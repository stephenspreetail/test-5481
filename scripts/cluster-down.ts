#!/usr/bin/env bun
/**
 * Cluster Down - Stop local K8s cluster.
 * Tears down k3d cluster, optionally removes registry and certificates.
 */
import { existsSync, rmSync } from "node:fs";
import { run, capture, log } from "./lib/run";

const CLUSTER_NAME = "kova-dev";
const REGISTRY_NAME = "kova-registry";

log.step("Stopping local Kubernetes cluster...");
console.log();

const removeVolumes =
  process.argv.includes("--volumes") || process.argv.includes("-v");

// Delete cluster
const clusterList = capture("k3d", ["cluster", "list"]);
if (clusterList.includes(CLUSTER_NAME)) {
  log.info(`Deleting cluster ${CLUSTER_NAME}...`);
  run("k3d", ["cluster", "delete", CLUSTER_NAME]);
  log.success("Cluster deleted");
} else {
  log.warn(`Cluster ${CLUSTER_NAME} not found (already stopped?)`);
}

console.log();

// Optionally remove registry and certificates
if (removeVolumes) {
  log.info("Removing registry and certificates...");

  // Remove registry
  const registryList = capture("k3d", ["registry", "list"]);
  if (registryList.includes(REGISTRY_NAME)) {
    run("k3d", ["registry", "delete", REGISTRY_NAME]);
    log.success("   Registry removed");
  }

  // Remove certificates
  if (existsSync(".tmp/certs")) {
    rmSync(".tmp/certs", { recursive: true, force: true });
    log.success("   Certificates removed");
  }

  // Remove downloaded Istio
  if (existsSync("istio-1.24.2")) {
    rmSync("istio-1.24.2", { recursive: true, force: true });
    log.success("   Istio directory removed");
  }

  console.log();
  log.success("Cluster and all resources removed!");
} else {
  log.info(`Registry ${REGISTRY_NAME} kept (faster restarts)`);
  log.info("   Run 'bun run scripts/cluster-down.ts --volumes' to remove everything");
}

console.log();
log.success("Cluster stopped successfully!");
console.log();
console.log("To start again: bun run scripts/cluster-up.ts");
console.log();
