/**
 * Podman Container Orchestrator
 * Implements ContainerOrchestrator using Dockerode (compatible with Podman)
 * Uses shared network + Traefik for routing
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Docker from "dockerode";
import type {
  ContainerInfo,
  ContainerOrchestrator,
  ContainerState,
  HealthCheckResult,
  OrchestratorConfig,
  SpawnContainerConfig,
} from "./types.js";

/**
 * Convert a path to Docker/Podman-compatible format for bind mounts
 */
function toContainerPath(hostPath: string): string {
  return hostPath.replace(/\\/g, "/");
}

/**
 * Podman/Docker orchestrator implementation
 */
export class PodmanOrchestrator implements ContainerOrchestrator {
  private docker: Docker;
  private config: OrchestratorConfig;
  private containers: Map<number, ContainerInfo> = new Map();

  constructor(config: OrchestratorConfig) {
    this.config = config;

    // Initialize Docker/Podman client based on platform and environment
    const dockerHost = process.env.DOCKER_HOST;

    if (dockerHost) {
      // Use DOCKER_HOST if set (works for both Docker and Podman)
      if (dockerHost.startsWith("tcp://")) {
        const url = new URL(dockerHost.replace("tcp://", "http://"));
        this.docker = new Docker({
          host: url.hostname,
          port: parseInt(url.port) || 2375,
        });
      } else if (dockerHost.startsWith("unix://")) {
        this.docker = new Docker({ socketPath: dockerHost.replace("unix://", "") });
      } else if (dockerHost.startsWith("npipe://")) {
        this.docker = new Docker({ socketPath: dockerHost.replace("npipe://", "") });
      } else {
        this.docker = new Docker({ socketPath: dockerHost });
      }
    } else if (process.platform === "win32") {
      // On Windows, Podman uses SSH to connect to the VM
      // Try to find Podman's SSH key and connect via SSH
      const podmanKeyPath = path.join(
        os.homedir(),
        ".local",
        "share",
        "containers",
        "podman",
        "machine",
        "machine"
      );

      if (fs.existsSync(podmanKeyPath)) {
        // Use SSH connection to Podman machine
        // Default connection is to root@127.0.0.1:52853
        const sshPort = parseInt(process.env.PODMAN_SSH_PORT || "52853", 10);
        console.log(`[PodmanOrchestrator] Using SSH connection on port ${sshPort}`);
        this.docker = new Docker({
          protocol: "ssh",
          host: "127.0.0.1",
          port: sshPort,
          username: "root",
          sshOptions: {
            privateKey: fs.readFileSync(podmanKeyPath),
          },
        });
      } else {
        // Fallback to Docker's named pipe if no Podman SSH key found
        console.log("[PodmanOrchestrator] Podman SSH key not found, trying Docker pipe");
        this.docker = new Docker({ socketPath: "//./pipe/docker_engine" });
      }
    } else {
      // On Linux/macOS, check for Podman socket first, then Docker
      const socketPath = "/run/podman/podman.sock";
      this.docker = new Docker({ socketPath });
    }
  }

  async initialize(): Promise<void> {
    console.log("[PodmanOrchestrator] Initializing...");

    // Verify connection to Docker/Podman
    try {
      const info = await this.docker.info();
      console.log(`[PodmanOrchestrator] Connected to ${info.Name || "container engine"}`);
    } catch (error) {
      throw new Error(`Failed to connect to container engine: ${error}`);
    }

    // Ensure network exists
    await this.ensureNetworkExists();

    // Discover existing app containers
    await this.discoverExistingContainers();

    console.log("[PodmanOrchestrator] Initialized successfully");
  }

  private async ensureNetworkExists(): Promise<void> {
    const networks = await this.docker.listNetworks({
      filters: { name: [this.config.networkName] },
    });

    if (networks.length === 0) {
      console.log(`[PodmanOrchestrator] Creating network: ${this.config.networkName}`);
      await this.docker.createNetwork({
        Name: this.config.networkName,
        Driver: "bridge",
      });
    } else {
      console.log(`[PodmanOrchestrator] Network exists: ${this.config.networkName}`);
    }
  }

  private async discoverExistingContainers(): Promise<void> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        label: ["kova.app-container=true"],
      },
    });

    for (const containerData of containers) {
      const appIdLabel = containerData.Labels["kova.app.id"];
      if (!appIdLabel) continue;

      const appId = parseInt(appIdLabel, 10);
      const containerName = containerData.Names[0]?.replace(/^\//, "") || `app-${appId}`;

      const state = this.mapContainerState(containerData.State);

      this.containers.set(appId, {
        containerId: containerData.Id,
        containerName,
        agentUrl: `http://${containerName}:${this.config.agentPort}`,
        previewUrl: `http://${containerName}.${this.config.previewDomain}:${this.config.previewPort}`,
        state,
        lastActivityAt: Date.now(),
      });

      console.log(`[PodmanOrchestrator] Discovered container: ${containerName} (${state})`);
    }
  }

  private mapContainerState(dockerState: string): ContainerState {
    switch (dockerState.toLowerCase()) {
      case "created":
        return "pending";
      case "running":
        return "running";
      case "paused":
      case "restarting":
        return "starting";
      case "removing":
      case "exited":
      case "dead":
        return "stopped";
      default:
        return "stopped";
    }
  }

  async spawnContainer(config: SpawnContainerConfig): Promise<ContainerInfo> {
    const containerName = `app-${config.appId}`;

    console.log(`[PodmanOrchestrator] Spawning container: ${containerName}`);

    // Check if container already exists
    const existing = this.containers.get(config.appId);
    if (existing && existing.state === "running") {
      console.log(`[PodmanOrchestrator] Container already running: ${containerName}`);
      existing.lastActivityAt = Date.now();
      return existing;
    }

    // Remove existing stopped container if any
    if (existing) {
      try {
        const container = this.docker.getContainer(existing.containerId);
        await container.remove({ force: true });
      } catch {
        // Ignore errors removing old container
      }
    }

    // Build environment array
    const envArray = Object.entries(config.env).map(([key, value]) => `${key}=${value}`);

    // Convert app path for bind mount
    const hostPath = toContainerPath(config.appPath);

    // Create container with Traefik labels for auto-discovery
    const container = await this.docker.createContainer({
      Image: config.image,
      name: containerName,
      Env: envArray,
      Labels: {
        // Kova labels
        "kova.app-container": "true",
        "kova.app.id": config.appId.toString(),
        "kova.user.id": config.userId.toString(),
        // Traefik labels for preview routing
        "traefik.enable": "true",
        [`traefik.http.routers.${containerName}.rule`]: `Host(\`${containerName}.${this.config.previewDomain}\`)`,
        [`traefik.http.routers.${containerName}.entrypoints`]: "preview",
        [`traefik.http.services.${containerName}.loadbalancer.server.port`]: this.config.devServerPort.toString(),
      },
      HostConfig: {
        NetworkMode: this.config.networkName,
        Binds: [`${hostPath}:/workspace:rw`],
        Memory: 1024 * 1024 * 1024, // 1GB
        MemorySwap: 2 * 1024 * 1024 * 1024, // 2GB with swap
        CpuPeriod: 100000,
        CpuQuota: 100000, // 100% CPU (1 core)
      },
    });

    // Start container
    await container.start();

    const containerInfo: ContainerInfo = {
      containerId: container.id,
      containerName,
      agentUrl: `http://${containerName}:${this.config.agentPort}`,
      previewUrl: `http://${containerName}.${this.config.previewDomain}:${this.config.previewPort}`,
      state: "starting",
      lastActivityAt: Date.now(),
    };

    this.containers.set(config.appId, containerInfo);

    // Wait for container to be ready
    await this.waitForReady(containerInfo);

    containerInfo.state = "running";
    console.log(`[PodmanOrchestrator] Container ready: ${containerName}`);

    return containerInfo;
  }

  private async waitForReady(containerInfo: ContainerInfo, timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();
    const healthUrl = `${containerInfo.agentUrl}/health`;

    console.log(`[PodmanOrchestrator] Waiting for container ready: ${healthUrl}`);

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(healthUrl, {
          signal: AbortSignal.timeout(2000),
        });

        if (response.ok) {
          return;
        }
      } catch {
        // Container not ready yet
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(`Container failed to become ready at ${healthUrl}`);
  }

  async stopContainer(containerId: string): Promise<void> {
    console.log(`[PodmanOrchestrator] Stopping container: ${containerId}`);

    try {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: 10 });
      await container.remove();
    } catch (error) {
      console.error(`[PodmanOrchestrator] Error stopping container: ${error}`);
    }

    // Remove from tracking
    for (const [appId, info] of this.containers.entries()) {
      if (info.containerId === containerId) {
        this.containers.delete(appId);
        break;
      }
    }
  }

  async getContainer(appId: number): Promise<ContainerInfo | null> {
    return this.containers.get(appId) || null;
  }

  async healthCheck(containerId: string): Promise<HealthCheckResult> {
    // Find container info
    let containerInfo: ContainerInfo | undefined;
    for (const info of this.containers.values()) {
      if (info.containerId === containerId) {
        containerInfo = info;
        break;
      }
    }

    if (!containerInfo) {
      return { healthy: false, message: "Container not found" };
    }

    try {
      const response = await fetch(`${containerInfo.agentUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        return { healthy: true };
      } else {
        return { healthy: false, message: `Health check returned ${response.status}` };
      }
    } catch (error) {
      return { healthy: false, message: `Health check failed: ${error}` };
    }
  }

  async listContainers(): Promise<ContainerInfo[]> {
    return Array.from(this.containers.values());
  }

  async cleanupIdleContainers(maxIdleMs: number): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [appId, info] of this.containers.entries()) {
      if (info.state !== "running") continue;

      const idleTime = now - info.lastActivityAt;
      if (idleTime > maxIdleMs) {
        console.log(
          `[PodmanOrchestrator] Cleaning up idle container: ${info.containerName} (idle ${Math.round(idleTime / 1000)}s)`
        );

        try {
          await this.stopContainer(info.containerId);
          cleanedCount++;
        } catch (error) {
          console.error(`[PodmanOrchestrator] Failed to cleanup container: ${error}`);
        }
      }
    }

    return cleanedCount;
  }

  /**
   * Record activity for a container (resets idle timer)
   */
  recordActivity(appId: number): void {
    const info = this.containers.get(appId);
    if (info) {
      info.lastActivityAt = Date.now();
    }
  }

  async shutdown(): Promise<void> {
    console.log("[PodmanOrchestrator] Shutting down...");
    // Optionally stop all containers on shutdown
    // For dev, we might want to keep them running
  }
}
