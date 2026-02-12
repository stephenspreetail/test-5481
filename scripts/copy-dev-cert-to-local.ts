#!/usr/bin/env bun
/**
 * Copy Kova TLS certificate from dev01-eks-app-ro to local k3d cluster.
 * Allows local development with proper HTTPS certificates.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { run, capture, check, kubectlApplyStdin, log, writeln } from "./lib/run";

const REMOTE_CONTEXT = "dev01-eks-app-ro";
const LOCAL_CONTEXT = "k3d-kova-dev";
const SECRET_NAME = "kova-tls-cert";
const NAMESPACE = "istio-system";
const TMP_FILE = ".tmp/kova-tls-cert.yaml";

export function copyDevCertToLocal(): void {
  log.banner("==========================================");
  log.banner("Copying Kova Certificate to Local K3d");
  log.banner("==========================================");
  writeln();

  // Verify remote cluster is accessible
  log.info("Verifying remote cluster...");
  if (!check("kubectl", ["--context", REMOTE_CONTEXT, "cluster-info"])) {
    log.error(`Cannot access remote cluster: ${REMOTE_CONTEXT}`);
    process.exit(1);
  }
  log.success(`Remote cluster accessible: ${REMOTE_CONTEXT}`);

  // Verify local cluster is accessible
  log.info("Verifying local cluster...");
  if (!check("kubectl", ["--context", LOCAL_CONTEXT, "cluster-info"])) {
    log.error(`Cannot access local cluster: ${LOCAL_CONTEXT}`);
    log.error("   Is k3d running? Try: bun run scripts/cluster-up.ts");
    process.exit(1);
  }
  log.success(`Local cluster accessible: ${LOCAL_CONTEXT}`);
  writeln();

  // Check if secret exists in remote cluster
  log.info("Checking for certificate in remote cluster...");
  if (
    !check("kubectl", [
      "--context", REMOTE_CONTEXT,
      "get", "secret", SECRET_NAME,
      "-n", NAMESPACE,
    ])
  ) {
    log.error(`Secret '${SECRET_NAME}' not found in ${REMOTE_CONTEXT}`);
    log.error("   Run: ./scripts/deploy-local-dev-certs.sh");
    process.exit(1);
  }
  log.success("Certificate found in remote cluster");
  writeln();

  // Export secret from remote cluster
  log.info(`Exporting certificate from ${REMOTE_CONTEXT}...`);
  mkdirSync(".tmp", { recursive: true });
  const yaml = capture("kubectl", [
    "--context", REMOTE_CONTEXT,
    "get", "secret", SECRET_NAME,
    "-n", NAMESPACE,
    "-o", "yaml",
  ]);
  writeFileSync(TMP_FILE, yaml);

  // Remove cluster-specific fields
  log.info("Cleaning certificate manifest...");
  const cleaned = readFileSync(TMP_FILE, "utf-8")
    .split("\n")
    .filter(
      (line) =>
        !line.match(/^\s*(resourceVersion|uid|creationTimestamp|selfLink):/)
    )
    .join("\n");
  writeFileSync(TMP_FILE, cleaned);

  // Ensure istio-system namespace exists in local cluster
  log.info("Ensuring istio-system namespace exists in local cluster...");
  const nsYaml = capture("kubectl", [
    "--context", LOCAL_CONTEXT,
    "create", "namespace", NAMESPACE,
    "--dry-run=client", "-o", "yaml",
  ]);
  kubectlApplyStdin(nsYaml, LOCAL_CONTEXT);

  // Delete existing secret if present (force update)
  log.info("Removing old certificate from local cluster (if exists)...");
  run("kubectl", [
    "--context", LOCAL_CONTEXT,
    "delete", "secret", SECRET_NAME,
    "-n", NAMESPACE,
    "--ignore-not-found=true",
  ]);

  // Apply secret to local cluster
  log.info(`Importing certificate to ${LOCAL_CONTEXT}...`);
  run("kubectl", ["--context", LOCAL_CONTEXT, "apply", "-f", TMP_FILE]);

  // Verify import
  writeln();
  log.info("Verifying certificate in local cluster...");
  run("kubectl", [
    "--context", LOCAL_CONTEXT,
    "get", "secret", SECRET_NAME,
    "-n", NAMESPACE,
  ]);

  writeln();
  log.success("Certificate copy complete!");
  writeln();
  log.info("Certificate is now available in local k3d cluster");
  writeln();
  writeln("Next steps:");
  writeln("  1. Restart Istio Gateway (if needed):");
  writeln(
    `     kubectl --context=${LOCAL_CONTEXT} rollout restart deployment istio-ingressgateway -n istio-system`
  );
  writeln("  2. Test access:");
  writeln("     curl -k https://kova.dev.toolkit.co:30443");
  writeln();
}

// Run directly when executed as a script
if (import.meta.main) {
  copyDevCertToLocal();
}
