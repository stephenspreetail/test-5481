import { assert, log } from "./log.js";

// Sandbox-controlled defaults (overridable via env)
export const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3002";
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");
export const K8S_CONTEXT = process.env.SANDBOX_K8S_CONTEXT ?? "k3d-kova-dev";
export const K8S_NAMESPACE = process.env.SANDBOX_K8S_NAMESPACE ?? "kova-apps";
export const K8S_ENVIRONMENT = process.env.SANDBOX_K8S_ENVIRONMENT ?? "local";

/**
 * Run kubectl with given args. Automatically injects --context and
 * -n (namespace) so callers can't accidentally hit the wrong cluster.
 * To skip auto-injection (e.g. for `cluster-info` or `config` commands),
 * pass `{ raw: true }` as the first argument.
 */
export async function kubectl(
  ...args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Auto-inject --context and -n unless the caller already provided them
  const hasContext = args.includes("--context");
  const hasNamespace = args.includes("-n") || args.includes("--namespace");

  const fullArgs = [...args];
  if (!hasContext) {
    fullArgs.unshift("--context", K8S_CONTEXT);
  }
  if (!hasNamespace) {
    fullArgs.push("-n", K8S_NAMESPACE);
  }

  const proc = Bun.spawn(["kubectl", ...fullArgs], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

/**
 * Run kubectl without auto-injecting --context or -n.
 * Use for commands like `cluster-info`, `config`, or `version`
 * where namespace doesn't apply.
 */
export async function kubectlRaw(
  ...args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["kubectl", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

/**
 * Assert that the target K8s context exists in kubeconfig and
 * the cluster is reachable. Does NOT require it to be the current context —
 * all sandbox kubectl calls pass --context explicitly.
 *
 * Also reads the `kova.dev/cluster-name` label from the namespace to verify
 * the cluster's identity from live data (not just local kubeconfig).
 */
export async function assertK8sReachable(): Promise<void> {
  // cluster-info is cluster-scoped, use kubectlRaw with explicit --context
  const info = await kubectlRaw("cluster-info", "--context", K8S_CONTEXT);
  assert(
    info.exitCode === 0,
    `K8s cluster unreachable via context "${K8S_CONTEXT}": ${info.stderr.trim()}`,
  );
  log("pass", `K8s cluster reachable via context ${K8S_CONTEXT}`);

  // Verify namespace exists (namespace is cluster-scoped, use kubectlRaw)
  const ns = await kubectlRaw(
    "get",
    "namespace",
    K8S_NAMESPACE,
    "--context",
    K8S_CONTEXT,
    "-o",
    "jsonpath={.metadata.name}",
  );
  assert(
    ns.exitCode === 0 && ns.stdout.trim() === K8S_NAMESPACE,
    `K8s namespace "${K8S_NAMESPACE}" not found in context ${K8S_CONTEXT}`,
  );
  log("pass", `K8s namespace ${K8S_NAMESPACE} exists`);

  // Verify cluster identity via namespace label (live data from the cluster)
  const clusterLabel = await kubectlRaw(
    "get",
    "namespace",
    K8S_NAMESPACE,
    "--context",
    K8S_CONTEXT,
    "-o",
    "jsonpath={.metadata.labels.kova\\.dev/cluster-name}",
  );
  const labelValue = clusterLabel.stdout.trim();
  assert(
    labelValue !== "",
    `Namespace ${K8S_NAMESPACE} is missing the kova.dev/cluster-name label. ` +
      `Apply it with: kubectl label namespace ${K8S_NAMESPACE} kova.dev/cluster-name=${K8S_CONTEXT} --context ${K8S_CONTEXT}`,
  );
  assert(
    labelValue === K8S_CONTEXT,
    `Cluster identity mismatch: namespace label kova.dev/cluster-name="${labelValue}" but expected "${K8S_CONTEXT}"`,
  );
  log("pass", `Cluster identity verified: kova.dev/cluster-name=${labelValue}`);
}
