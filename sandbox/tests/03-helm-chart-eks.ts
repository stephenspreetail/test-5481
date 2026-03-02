import type { TestContext } from "../run.js";
import { kubectl, K8S_CONTEXT, K8S_NAMESPACE, K8S_ENVIRONMENT } from "../lib/context.js";
import { assert, assertContains, assertEq, assertMatch, log } from "../lib/log.js";

const ECR_IMAGE =
  "851725519214.dkr.ecr.us-east-1.amazonaws.com/scaled-innovation/kova-app-container";
const RELEASE_NAME = "chart-test-deadbeef";
const CHART_PATH = "helm/kova-app";
const PREVIEW_DOMAIN = "kova.eks.dev01.tk.dev";
const PREVIEW_HOSTNAME = `app-deadbeef.${PREVIEW_DOMAIN}`;

// String values (passed via --set-string)
const TEST_VALUES = {
  instanceId: "chart-test",
  appShortId: "deadbeef",
  appGuid: "deadbeef-1234-5678-9012-123456789abc",
  appId: "99999",
  userId: "1",
  "image.repository": ECR_IMAGE,
  "image.tag": "latest",
  "image.pullPolicy": "Always",
  "ports.agent": "3100",
  "ports.dev": "3000",
  "storage.storageClass": "ebs-sc",
  "networking.previewDomain": PREVIEW_DOMAIN,
  "networking.gatewayName": "istio-system/kova-gateway",
  previewHostname: PREVIEW_HOSTNAME,
  "env.AGENT_PORT": "3100",
  "env.DEV_SERVER_PORT": "3000",
  "secretEnv.TEST_SECRET": "s3cret-value",
  "env.HELLO": "world",
};

// Boolean/numeric values (passed via --set so Helm sees proper types)
const TEST_SET_VALUES = {
  "networking.hostNetwork": "false",
};

async function helm(
  ...args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const fullArgs = [...args];
  if (!fullArgs.includes("--kube-context")) {
    fullArgs.push("--kube-context", K8S_CONTEXT);
  }
  const proc = Bun.spawn(["helm", ...fullArgs], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

async function helmInstall(): Promise<void> {
  const args = [
    "upgrade",
    "--install",
    RELEASE_NAME,
    CHART_PATH,
    "--namespace",
    K8S_NAMESPACE,
    "--wait",
    "--timeout",
    "180s",
  ];
  for (const [key, value] of Object.entries(TEST_VALUES)) {
    args.push("--set-string", `${key}=${value}`);
  }
  for (const [key, value] of Object.entries(TEST_SET_VALUES)) {
    args.push("--set", `${key}=${value}`);
  }
  const result = await helm(...args);
  if (result.exitCode !== 0) {
    throw new Error(`helm install failed: ${result.stderr}`);
  }
}

async function helmUninstall(): Promise<void> {
  await helm("uninstall", RELEASE_NAME, "--namespace", K8S_NAMESPACE);
  // PVCs aren't deleted by helm uninstall
  await kubectl(
    "delete",
    "pvc",
    `${RELEASE_NAME}-workspace`,
    "--ignore-not-found",
  );
}

function jsonpath(expr: string): string {
  return `-o=jsonpath=${expr}`;
}

/**
 * Fetch a URL with retries for transient failures (DNS propagation, ingress warmup).
 */
async function fetchWithRetry(
  url: string,
  opts: { retries?: number; delayMs?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const { retries = 10, delayMs = 3000, timeoutMs = 5000 } = opts;
  let lastError: Error | undefined;

  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < retries - 1) {
        await Bun.sleep(delayMs);
      }
    }
  }
  throw new Error(
    `fetchWithRetry: ${url} failed after ${retries} attempts: ${lastError?.message}`,
  );
}

/**
 * EKS Helm chart smoke test — deploys the kova-app chart to the EKS dev cluster
 * and validates all resources, networking, and end-to-end health endpoint
 * reachability over the public Istio ingress.
 *
 * Run with: SANDBOX_K8S_CONTEXT=dev01-eks-kova SANDBOX_K8S_ENVIRONMENT=eks-dev bun run sandbox/run.ts 03-helm-chart-eks
 */
export default async function helmChartEksTest(
  _ctx: TestContext,
): Promise<void> {
  // ── Guard: only run against EKS ───────────────────────────────────────
  if (K8S_ENVIRONMENT === "local") {
    throw new Error(
      "This test targets EKS. Run with: SANDBOX_K8S_CONTEXT=dev01-eks-kova SANDBOX_K8S_ENVIRONMENT=eks-dev bun run sandbox/run.ts 03-helm-chart-eks",
    );
  }
  log("info", `Targeting EKS: context=${K8S_CONTEXT}, namespace=${K8S_NAMESPACE}`);

  // ── Cleanup any previous run ──────────────────────────────────────────
  log("step", "Cleaning up any previous test release...");
  await helmUninstall().catch(() => {});

  // ── Install chart ─────────────────────────────────────────────────────
  log("step", "Installing helm chart to EKS (may take a minute for EBS provisioning)...");
  await helmInstall();
  log("pass", `Helm release ${RELEASE_NAME} installed on EKS`);

  try {
    // ── Deployment exists and has 1 ready replica ───────────────────────
    log("step", "Validating deployment...");
    const readyReplicas = await kubectl(
      "get",
      "deployment",
      RELEASE_NAME,
      jsonpath("{.status.readyReplicas}"),
    );
    assertEq(readyReplicas.stdout.trim(), "1", "deployment ready replicas");
    log("pass", "Deployment has 1 ready replica");

    // ── Standard labels ─────────────────────────────────────────────────
    log("step", "Validating labels...");
    const labels = await kubectl(
      "get",
      "deployment",
      RELEASE_NAME,
      jsonpath("{.metadata.labels}"),
    );
    const labelStr = labels.stdout;
    assertContains(labelStr, "app.kubernetes.io/name", "label: name");
    assertContains(labelStr, "app.kubernetes.io/instance", "label: instance");
    assertContains(labelStr, "app.kubernetes.io/version", "label: version");
    assertContains(labelStr, "app.kubernetes.io/component", "label: component");
    assertContains(labelStr, "app.kubernetes.io/part-of", "label: part-of");
    assertContains(labelStr, "app.kubernetes.io/managed-by", "label: managed-by");
    assertContains(labelStr, "kova.dev/instance", "label: kova instance");
    assertContains(labelStr, "kova.dev/app-guid", "label: kova app-guid");
    log("pass", "All standard labels present");

    // ── Security context ────────────────────────────────────────────────
    log("step", "Validating security context...");
    const fsGroup = await kubectl(
      "get",
      "deployment",
      RELEASE_NAME,
      jsonpath("{.spec.template.spec.securityContext.fsGroup}"),
    );
    assertEq(fsGroup.stdout.trim(), "1001", "pod fsGroup");

    const noPrivEsc = await kubectl(
      "get",
      "deployment",
      RELEASE_NAME,
      jsonpath(
        "{.spec.template.spec.containers[0].securityContext.allowPrivilegeEscalation}",
      ),
    );
    assertEq(noPrivEsc.stdout.trim(), "false", "allowPrivilegeEscalation=false");
    log("pass", "Security context correct");

    // ── Health probes ───────────────────────────────────────────────────
    log("step", "Validating health probes...");
    for (const probe of ["startupProbe", "readinessProbe", "livenessProbe"]) {
      const path = await kubectl(
        "get",
        "deployment",
        RELEASE_NAME,
        jsonpath(
          `{.spec.template.spec.containers[0].${probe}.httpGet.path}`,
        ),
      );
      assertEq(path.stdout.trim(), "/health", `${probe} path`);
    }
    log("pass", "All three health probes configured");

    // ── Service account ─────────────────────────────────────────────────
    log("step", "Validating service account...");
    const saResult = await kubectl(
      "get",
      "serviceaccount",
      RELEASE_NAME,
      jsonpath("{.metadata.name}"),
    );
    assertEq(saResult.exitCode, 0, "service account exists");
    log("pass", "Service account created");

    // ── Secret resource ─────────────────────────────────────────────────
    log("step", "Validating secret...");
    const secretResult = await kubectl(
      "get",
      "secret",
      `${RELEASE_NAME}-env`,
      jsonpath("{.data.TEST_SECRET}"),
    );
    assertEq(secretResult.exitCode, 0, "secret exists");
    const decoded = atob(secretResult.stdout.trim());
    assertEq(decoded, "s3cret-value", "secret value matches");
    log("pass", "Secret created with correct value");

    // ── Service: ClusterIP (EKS mode, no hostNetwork) ───────────────────
    log("step", "Validating service (EKS mode)...");
    const svcType = await kubectl(
      "get",
      "service",
      RELEASE_NAME,
      jsonpath("{.spec.type}"),
    );
    assertEq(svcType.stdout.trim(), "ClusterIP", "service type (EKS → ClusterIP)");

    // No publishNotReadyAddresses needed for ClusterIP
    const publishNotReady = await kubectl(
      "get",
      "service",
      RELEASE_NAME,
      jsonpath("{.spec.publishNotReadyAddresses}"),
    );
    assertEq(publishNotReady.stdout.trim(), "", "no publishNotReadyAddresses on ClusterIP");
    log("pass", "Service is ClusterIP (correct for EKS)");

    // ── No hostNetwork on pod ───────────────────────────────────────────
    log("step", "Validating pod networking...");
    const hostNet = await kubectl(
      "get",
      "deployment",
      RELEASE_NAME,
      jsonpath("{.spec.template.spec.hostNetwork}"),
    );
    assertEq(hostNet.stdout.trim(), "", "hostNetwork is not set (EKS uses pod network)");

    // Verify container ports are standard 3100/3000
    const containerPorts = await kubectl(
      "get",
      "deployment",
      RELEASE_NAME,
      jsonpath("{.spec.template.spec.containers[0].ports[*].containerPort}"),
    );
    assertContains(containerPorts.stdout, "3100", "agent port 3100");
    assertContains(containerPorts.stdout, "3000", "dev port 3000");
    log("pass", "Pod networking correct (no hostNetwork, standard ports)");

    // ── PVC with EBS storage class ──────────────────────────────────────
    log("step", "Validating PVC...");
    const pvcPhase = await kubectl(
      "get",
      "pvc",
      `${RELEASE_NAME}-workspace`,
      jsonpath("{.status.phase}"),
    );
    assertEq(pvcPhase.stdout.trim(), "Bound", "PVC is bound");

    const pvcSc = await kubectl(
      "get",
      "pvc",
      `${RELEASE_NAME}-workspace`,
      jsonpath("{.spec.storageClassName}"),
    );
    assertEq(pvcSc.stdout.trim(), "ebs-sc", "PVC uses ebs-sc storage class");
    log("pass", "PVC is bound with ebs-sc");

    // ── VirtualService ──────────────────────────────────────────────────
    log("step", "Validating VirtualService...");
    const vsHost = await kubectl(
      "get",
      "virtualservice",
      RELEASE_NAME,
      jsonpath("{.spec.hosts[0]}"),
    );
    assertEq(vsHost.stdout.trim(), PREVIEW_HOSTNAME, "VirtualService host");

    const vsGateway = await kubectl(
      "get",
      "virtualservice",
      RELEASE_NAME,
      jsonpath("{.spec.gateways[0]}"),
    );
    assertEq(
      vsGateway.stdout.trim(),
      "istio-system/kova-gateway",
      "VirtualService gateway",
    );
    log("pass", "VirtualService configured correctly");

    // ── ECR image ───────────────────────────────────────────────────────
    log("step", "Validating container image...");
    const image = await kubectl(
      "get",
      "deployment",
      RELEASE_NAME,
      jsonpath("{.spec.template.spec.containers[0].image}"),
    );
    assertMatch(image.stdout.trim(), /851725519214.*kova-app-container/, "ECR image");
    log("pass", "Container uses ECR image");

    // ── Pod is Running and Ready ────────────────────────────────────────
    log("step", "Validating pod health...");
    const podPhase = await kubectl(
      "get",
      "pod",
      "-l",
      `kova.dev/app-guid=${TEST_VALUES.appGuid}`,
      jsonpath("{.items[0].status.phase}"),
    );
    assertEq(podPhase.stdout.trim(), "Running", "pod is Running");

    const podReady = await kubectl(
      "get",
      "pod",
      "-l",
      `kova.dev/app-guid=${TEST_VALUES.appGuid}`,
      jsonpath("{.items[0].status.conditions[?(@.type=='Ready')].status}"),
    );
    assertEq(podReady.stdout.trim(), "True", "pod is Ready (probes passing)");
    log("pass", "Pod is Running and Ready");

    // ── End-to-end: health endpoint reachable over public ingress ────────
    log("step", "Validating health endpoint over public HTTPS ingress...");
    const healthUrl = `https://${PREVIEW_HOSTNAME}/agent/health`;
    log("info", `Fetching ${healthUrl} (with retries for ingress warmup)...`);
    const resp = await fetchWithRetry(healthUrl);
    assertEq(resp.status, 200, "health endpoint returns 200");
    const body = (await resp.json()) as { status: string };
    assertEq(body.status, "ok", "health response status is ok");
    log(
      "pass",
      "Health endpoint reachable over public HTTPS ingress (end-to-end)",
    );

    // ── End-to-end: preview (dev server) reachable ──────────────────────
    log("step", "Validating preview URL over public HTTPS ingress...");
    const previewUrl = `https://${PREVIEW_HOSTNAME}/`;
    const previewResp = await fetchWithRetry(previewUrl);
    assert(
      previewResp.status === 200 || previewResp.status === 304,
      `preview returns 200 or 304, got ${previewResp.status}`,
    );
    log("pass", "Preview URL reachable over public HTTPS ingress");
  } finally {
    // ── Cleanup ─────────────────────────────────────────────────────────
    log("step", "Cleaning up test release...");
    await helmUninstall();
    log("pass", "Test release cleaned up");
  }
}
