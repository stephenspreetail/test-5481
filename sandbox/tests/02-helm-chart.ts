import type { TestContext } from "../run.js";
import { kubectl } from "../lib/context.js";
import { K8S_CONTEXT, K8S_NAMESPACE } from "../lib/context.js";
import { assert, assertContains, assertEq, log } from "../lib/log.js";

const RELEASE_NAME = "chart-test-deadbeef";
const CHART_PATH = "helm/kova-app";
const TEST_VALUES = {
  instanceId: "chart-test",
  appShortId: "deadbeef",
  appGuid: "deadbeef-1234-5678-9012-123456789abc",
  appId: "99999",
  userId: "1",
  "image.repository": "kova-app-container",
  "image.tag": "latest",
  "image.pullPolicy": "IfNotPresent",
  // k3d hostNetwork mode: app listens on these ports AND they become NodePorts
  "ports.agent": "30199",
  "ports.dev": "30299",
  "storage.storageClass": "local-path",
  "networking.hostNetwork": "true",
  "networking.previewDomain": "dev.toolkit.co:8443",
  "networking.gatewayName": "istio-system/kova-gateway",
  previewHostname: "app-deadbeef.dev.toolkit.co",
  // App must listen on the same ports configured above
  "env.AGENT_PORT": "30199",
  "env.DEV_SERVER_PORT": "30299",
  // Pass a test secret to verify the Secret resource
  "secretEnv.TEST_SECRET": "s3cret-value",
  // Pass a plain env var
  "env.HELLO": "world",
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
    "120s",
  ];
  for (const [key, value] of Object.entries(TEST_VALUES)) {
    args.push("--set-string", `${key}=${value}`);
  }
  const result = await helm(...args);
  if (result.exitCode !== 0) {
    throw new Error(`helm install failed: ${result.stderr}`);
  }
}

async function helmUninstall(): Promise<void> {
  await helm(
    "uninstall",
    RELEASE_NAME,
    "--namespace",
    K8S_NAMESPACE,
  );
  // Also delete the PVC (helm doesn't delete PVCs by default)
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
 * Helm chart test — deploys the kova-app chart to k3d and validates
 * that all resources are created with correct labels, probes,
 * security context, service account, and secrets.
 *
 * Does NOT require the backend server or agent — this is a pure
 * infrastructure test.
 */
export default async function helmChartTest(_ctx: TestContext): Promise<void> {
  // ── Cleanup any previous run ────────────────────────────────────────────
  log("step", "Cleaning up any previous test release...");
  await helmUninstall().catch(() => {}); // ignore if not found

  // ── Install chart ───────────────────────────────────────────────────────
  log("step", "Installing helm chart...");
  await helmInstall();
  log("pass", `Helm release ${RELEASE_NAME} installed`);

  try {
    // ── Deployment exists and has 1 ready replica ─────────────────────────
    log("step", "Validating deployment...");
    const readyReplicas = await kubectl(
      "get",
      "deployment",
      RELEASE_NAME,
      jsonpath("{.status.readyReplicas}"),
    );
    assertEq(readyReplicas.stdout.trim(), "1", "deployment ready replicas");
    log("pass", "Deployment has 1 ready replica");

    // ── Standard labels on deployment ─────────────────────────────────────
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

    // ── Pod security context ──────────────────────────────────────────────
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
      jsonpath("{.spec.template.spec.containers[0].securityContext.allowPrivilegeEscalation}"),
    );
    assertEq(noPrivEsc.stdout.trim(), "false", "allowPrivilegeEscalation=false");
    log("pass", "Security context correct (fsGroup=1001, allowPrivilegeEscalation=false)");

    // ── Health probes ─────────────────────────────────────────────────────
    log("step", "Validating health probes...");
    const startupPath = await kubectl(
      "get",
      "deployment",
      RELEASE_NAME,
      jsonpath("{.spec.template.spec.containers[0].startupProbe.httpGet.path}"),
    );
    assertEq(startupPath.stdout.trim(), "/health", "startup probe path");

    const readinessPath = await kubectl(
      "get",
      "deployment",
      RELEASE_NAME,
      jsonpath("{.spec.template.spec.containers[0].readinessProbe.httpGet.path}"),
    );
    assertEq(readinessPath.stdout.trim(), "/health", "readiness probe path");

    const livenessPath = await kubectl(
      "get",
      "deployment",
      RELEASE_NAME,
      jsonpath("{.spec.template.spec.containers[0].livenessProbe.httpGet.path}"),
    );
    assertEq(livenessPath.stdout.trim(), "/health", "liveness probe path");
    log("pass", "All three health probes configured (startup, readiness, liveness)");

    // ── Service account ───────────────────────────────────────────────────
    log("step", "Validating service account...");
    const saResult = await kubectl(
      "get",
      "serviceaccount",
      RELEASE_NAME,
      jsonpath("{.metadata.name}"),
    );
    assertEq(saResult.exitCode, 0, "service account exists");
    assertEq(saResult.stdout.trim(), RELEASE_NAME, "service account name");

    const podSa = await kubectl(
      "get",
      "deployment",
      RELEASE_NAME,
      jsonpath("{.spec.template.spec.serviceAccountName}"),
    );
    assertEq(podSa.stdout.trim(), RELEASE_NAME, "pod references service account");
    log("pass", "Service account created and referenced by pod");

    // ── Secret resource ───────────────────────────────────────────────────
    log("step", "Validating secret...");
    const secretResult = await kubectl(
      "get",
      "secret",
      `${RELEASE_NAME}-env`,
      jsonpath("{.data.TEST_SECRET}"),
    );
    assertEq(secretResult.exitCode, 0, "secret exists");
    // Decode base64 and verify value
    const decoded = atob(secretResult.stdout.trim());
    assertEq(decoded, "s3cret-value", "secret value matches");

    // Verify env var references the secret
    const envFrom = await kubectl(
      "get",
      "deployment",
      RELEASE_NAME,
      "-o",
      "json",
    );
    const deployJson = JSON.parse(envFrom.stdout);
    const envVars = deployJson.spec.template.spec.containers[0].env;
    const secretEnv = envVars.find((e: any) => e.name === "TEST_SECRET");
    assert(secretEnv, "TEST_SECRET env var exists");
    assertEq(
      secretEnv.valueFrom?.secretKeyRef?.name,
      `${RELEASE_NAME}-env`,
      "env var references correct secret",
    );
    // Also check plain env var
    const plainEnv = envVars.find((e: any) => e.name === "HELLO");
    assert(plainEnv, "HELLO env var exists");
    assertEq(plainEnv.value, "world", "plain env var value");
    log("pass", "Secret created, env var references it via secretKeyRef");

    // ── Service ───────────────────────────────────────────────────────────
    log("step", "Validating service...");
    const svcType = await kubectl(
      "get",
      "service",
      RELEASE_NAME,
      jsonpath("{.spec.type}"),
    );
    assertEq(svcType.stdout.trim(), "NodePort", "service type (hostNetwork=true → NodePort)");

    const publishNotReady = await kubectl(
      "get",
      "service",
      RELEASE_NAME,
      jsonpath("{.spec.publishNotReadyAddresses}"),
    );
    assertEq(publishNotReady.stdout.trim(), "true", "publishNotReadyAddresses (required for probes + NodePort)");
    log("pass", "Service is NodePort with publishNotReadyAddresses=true");

    // ── PVC ───────────────────────────────────────────────────────────────
    log("step", "Validating PVC...");
    const pvcPhase = await kubectl(
      "get",
      "pvc",
      `${RELEASE_NAME}-workspace`,
      jsonpath("{.status.phase}"),
    );
    assertEq(pvcPhase.stdout.trim(), "Bound", "PVC is bound");
    log("pass", "PVC is bound");

    // ── VirtualService ────────────────────────────────────────────────────
    log("step", "Validating VirtualService...");
    const vsHost = await kubectl(
      "get",
      "virtualservice",
      RELEASE_NAME,
      jsonpath("{.spec.hosts[0]}"),
    );
    assertEq(
      vsHost.stdout.trim(),
      "app-deadbeef.dev.toolkit.co",
      "VirtualService host",
    );
    log("pass", "VirtualService configured with correct hostname");

    // ── /tmp emptyDir volume ──────────────────────────────────────────────
    log("step", "Validating /tmp emptyDir...");
    const volumes = deployJson.spec.template.spec.volumes;
    const tmpVol = volumes.find((v: any) => v.name === "tmp");
    assert(tmpVol, "/tmp volume exists");
    assert(tmpVol.emptyDir !== undefined, "/tmp is emptyDir");
    const mounts = deployJson.spec.template.spec.containers[0].volumeMounts;
    const tmpMount = mounts.find((m: any) => m.mountPath === "/tmp");
    assert(tmpMount, "/tmp volumeMount exists");
    log("pass", "/tmp emptyDir volume mounted");

    // ── Pod is actually running and healthy ───────────────────────────────
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
    log("pass", "Pod is Running and Ready (health probes passing)");
  } finally {
    // ── Cleanup ─────────────────────────────────────────────────────────────
    log("step", "Cleaning up test release...");
    await helmUninstall();
    log("pass", "Test release cleaned up");
  }
}
