/**
 * Container Orchestrator Module
 * Exports orchestrator interface and implementations
 */

import { config } from "../../config/index.js";
import type { ContainerOrchestrator, OrchestratorConfig } from "./types.js";
import { KubectlOrchestrator } from "./kubectl.orchestrator.js";
import { buildK8sEnvironmentConfig } from "../k8s-environment.service.js";

export * from "./types.js";
export { KubectlOrchestrator } from "./kubectl.orchestrator.js";

/**
 * Create Kubernetes orchestrator using kubectl
 */
export function createOrchestrator(): ContainerOrchestrator {
  // Get environment-specific K8s configuration
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

  return new KubectlOrchestrator({
    ...orchestratorConfig,
    context: k8sEnv.context,
    namespace: k8sEnv.namespace,
    isEKS: k8sEnv.isEKS,
    storageClass: k8sEnv.storageClass,
  });
}
