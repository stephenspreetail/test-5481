/**
 * Container Orchestrator Module
 * Exports orchestrator interface and implementations
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../../config/index.js";
import type { ContainerOrchestrator, OrchestratorConfig } from "./types.js";
import { KubectlOrchestrator } from "./kubectl.orchestrator.js";
import { HelmOrchestrator } from "./helm.orchestrator.js";
import { buildK8sEnvironmentConfig } from "../k8s-environment.service.js";

export * from "./types.js";
export { KubectlOrchestrator } from "./kubectl.orchestrator.js";
export { HelmOrchestrator } from "./helm.orchestrator.js";

/**
 * Resolve the path to the kova-app Helm chart.
 * The chart lives at {projectRoot}/helm/kova-app/
 */
function resolveChartPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // This file: backend/src/services/orchestrator/index.ts
  // Project root: ../../../../
  return resolve(currentDir, "../../../../helm/kova-app");
}

/**
 * Create the appropriate orchestrator based on ORCHESTRATOR_TYPE config.
 * - "kubectl" (default): Legacy orchestrator using kubectl apply with app-{intId} naming
 * - "helm": Multi-tenant orchestrator using Helm with {instanceId}-{shortId} naming
 */
export function createOrchestrator(): ContainerOrchestrator {
  const k8sEnv = buildK8sEnvironmentConfig();

  const orchestratorConfig: OrchestratorConfig = {
    containerImage: k8sEnv.containerImage,
    networkName: config.CONTAINER_NETWORK,
    previewDomain: k8sEnv.previewDomain,
    previewPort: k8sEnv.previewPort,
    agentPort: config.CONTAINER_AGENT_PORT,
    devServerPort: config.CONTAINER_DEV_PORT,
    idleTimeoutMs: config.CONTAINER_IDLE_TIMEOUT_MS,
  };

  if (config.ORCHESTRATOR_TYPE === "helm") {
    console.log(
      `[Orchestrator] Using HelmOrchestrator (instance: ${k8sEnv.instanceId})`,
    );
    return new HelmOrchestrator({
      ...orchestratorConfig,
      context: k8sEnv.context,
      namespace: k8sEnv.namespace,
      isEKS: k8sEnv.isEKS,
      storageClass: k8sEnv.storageClass,
      instanceId: k8sEnv.instanceId,
      previewUrlMode: k8sEnv.previewUrlMode,
      chartPath: resolveChartPath(),
    });
  }

  console.log(`[Orchestrator] Using KubectlOrchestrator (legacy)`);
  return new KubectlOrchestrator({
    ...orchestratorConfig,
    context: k8sEnv.context,
    namespace: k8sEnv.namespace,
    isEKS: k8sEnv.isEKS,
    storageClass: k8sEnv.storageClass,
  });
}
