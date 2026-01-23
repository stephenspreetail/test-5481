/**
 * Local Container Orchestrator
 * Empty implementation of ContainerOrchestrator
 */

import type {
  ContainerInfo,
  ContainerOrchestrator,
  HealthCheckResult,
  SpawnContainerConfig,
} from "./types.js";

export class LocalOrchestrator implements ContainerOrchestrator {
  async initialize(): Promise<void> {
    throw new Error("Not implemented");
  }

  async spawnContainer(_config: SpawnContainerConfig): Promise<ContainerInfo> {
    throw new Error("Not implemented");
  }

  async stopContainer(_containerId: string): Promise<void> {
    throw new Error("Not implemented");
  }

  async getContainer(_appId: number): Promise<ContainerInfo | null> {
    throw new Error("Not implemented");
  }

  async healthCheck(_containerId: string): Promise<HealthCheckResult> {
    throw new Error("Not implemented");
  }

  async listContainers(): Promise<ContainerInfo[]> {
    throw new Error("Not implemented");
  }

  async cleanupIdleContainers(_maxIdleMs: number): Promise<number> {
    throw new Error("Not implemented");
  }

  async shutdown(): Promise<void> {
    throw new Error("Not implemented");
  }
}
