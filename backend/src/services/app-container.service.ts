/**
 * App Container Service
 * Manages Docker containers for running Claude Agent SDK + Dev Server per app
 * Traefik HTTP provider polls /api/traefik/config for routing
 */

import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import Docker from "dockerode";
import { config } from "../config/index.js";

// Initialize Docker client based on platform
function createDockerClient(): Docker {
  // Check if we're on Windows
  if (process.platform === "win32") {
    // Windows Docker Desktop uses named pipe
    return new Docker({ socketPath: "//./pipe/docker_engine" });
  }
  // Unix-based systems use socket path from config
  return new Docker({ socketPath: config.DOCKER_SOCKET });
}

/**
 * Convert a path to Docker-compatible format for bind mounts
 * Docker Desktop on Windows accepts Windows paths natively
 */
function toDockerPath(hostPath: string): string {
  // Docker Desktop on Windows handles Windows paths natively
  // Just ensure forward slashes for consistency in the bind mount string
  return hostPath.replace(/\\/g, "/");
}

/**
 * Resolve the apps base path to an absolute path
 */
function resolveAppsBasePath(): string {
  const basePath = config.APPS_BASE_PATH;
  // If it's already absolute, use it
  if (resolve(basePath) === basePath) {
    return basePath;
  }
  // Resolve relative to current working directory
  return resolve(process.cwd(), basePath);
}

const docker = createDockerClient();
const appsBasePath = resolveAppsBasePath();

// Port allocation ranges
const AGENT_PORT_MIN = 31100;
const AGENT_PORT_MAX = 31999;
const DEV_PORT_MIN = 33000;
const DEV_PORT_MAX = 33999;

const allocatedAgentPorts = new Set<number>();
const allocatedDevPorts = new Set<number>();

// Container state
type ContainerState = "none" | "starting" | "running" | "stopping";

export interface AppContainerInfo {
  containerId: string | null;
  containerName: string;
  agentPort: number;
  devPort: number;
  userId: number;
  state: ContainerState;
  lastActivityAt: number;
}

// Track running containers by appId
const appContainers = new Map<number, AppContainerInfo>();

// Mutex to prevent concurrent container operations for the same app
const containerOperationLocks = new Map<number, Promise<any>>();

// Idle timeout check interval
let idleCheckInterval: NodeJS.Timeout | null = null;

// Default idle timeout: 15 minutes
const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export interface StartContainerConfig {
  appId: number;
  userId: number;
  appPath: string;
}

export interface ContainerPorts {
  agentPort: number;
  devPort: number;
  agentUrl: string;
  devUrl: string;
  previewUrl: string; // Traefik URL: http://app-{id}.localhost:8081
}

class AppContainerService {
  private idleTimeoutMs: number;
  private containerImage: string;
  private containerScanIntervalMs: number;

  constructor() {
    if (!config.APP_CONTAINER_IDLE_TIMEOUT_MS) {
      throw new Error("APP_CONTAINER_IDLE_TIMEOUT_MS is not set");
    }
    if (!config.APP_CONTAINER_IMAGE) {
      throw new Error("APP_CONTAINER_IMAGE is not set");
    }
    if (!config.CONTAINER_SCAN_INTERVAL_MS) {
      throw new Error("CONTAINER_SCAN_INTERVAL_MS is not set");
    }
    this.idleTimeoutMs = config.APP_CONTAINER_IDLE_TIMEOUT_MS;
    this.containerImage = config.APP_CONTAINER_IMAGE;
    this.containerScanIntervalMs = config.CONTAINER_SCAN_INTERVAL_MS;
  }

  /**
   * Initialize the service (start idle check interval)
   */
  async initialize(): Promise<void> {
    console.log(
      `[${new Date().toLocaleString()}] [AppContainerService] initializing...`,
    );

    const timestamp = new Date().toLocaleString();
    console.log(
      `[${timestamp}] [AppContainerService] config: apps base path: ${appsBasePath}`,
    );
    console.log(
      `[${timestamp}] [AppContainerService] config: container image: ${this.containerImage}`,
    );
    console.log(
      `[${timestamp}] [AppContainerService] config: container scan interval: ${this.containerScanIntervalMs}ms`,
    );
    console.log(
      `[${timestamp}] [AppContainerService] config: idle timeout interval (${this.idleTimeoutMs}ms)`,
    );

    if (idleCheckInterval) {
      clearInterval(idleCheckInterval);
    }

    // Periodically scan for containers and stop idle ones
    // This catches manually-started containers and removes stale entries
    idleCheckInterval = setInterval(() => {
      const timestamp = new Date().toLocaleString();
      this.scanExistingContainers();
      this.stopIdleContainers();
    }, this.containerScanIntervalMs);

    // Scan for existing containers and populate allocated ports
    await this.scanExistingContainers();

    console.log(`[${timestamp}] [AppContainerService] initialized`);
  }

  /**
   * This method is essentially “reconcile Docker reality → in-memory maps”
   * (handles the case where backend restarts but containers are still running)
   *  - List running managed containers
   *  - Build a set of running appIds
   *  - Skip containers already tracked
   *  - Extract the agent host port (best-effort)
   *  - Insert newly discovered containers into appContainers
   *  - Remove stale entries from appContainers for containers no longer running
   */
  private async scanExistingContainers(): Promise<void> {
    console.log(
      `[${new Date().toLocaleString()}] [AppContainerService] scanning containers...`,
    );

    try {
      const containers = await docker.listContainers({
        all: false, // Only running containers
        filters: {
          label: ["kova.app-container=true"],
        },
      });

      // Track which appIds we found running
      const runningAppIds = new Set<number>();

      for (const containerInfo of containers) {
        const appIdStr = containerInfo.Labels?.["kova.app.id"];
        const userIdStr = containerInfo.Labels?.["kova.user.id"];

        if (!appIdStr) continue;

        const appId = parseInt(appIdStr, 10);
        runningAppIds.add(appId);

        // Skip if we already know about this container
        if (appContainers.has(appId)) {
          continue;
        }

        const userId = userIdStr ? parseInt(userIdStr, 10) : 0;
        const containerName =
          containerInfo.Names?.[0]?.replace(/^\//, "") || `app-${appId}`;

        // Find the agent port from port bindings (may be 0 if not exposed)
        let agentPort = 0;
        for (const port of containerInfo.Ports || []) {
          if (port.PrivatePort === 3100 && port.PublicPort) {
            agentPort = port.PublicPort;
            break;
          }
        }

        // Mark port as allocated if found
        if (agentPort > 0) {
          allocatedAgentPorts.add(agentPort);
        }

        // Track this container (even without agent port - needed for Traefik routing)
        appContainers.set(appId, {
          containerId: containerInfo.Id,
          containerName,
          agentPort,
          devPort: 0, // Dev port not exposed to host anymore
          userId,
          state: "running",
          lastActivityAt: Date.now(),
        });

        console.log(
          `[${new Date().toLocaleString()}] [AppContainerService] discovered container ${containerName} (appId: ${appId}, agentPort: ${agentPort || "none"})`,
        );
      }

      // Remove stale entries for containers no longer running
      // BUT don't remove entries in "starting" state - they might not be in Docker's list yet
      for (const [appId, info] of appContainers.entries()) {
        if (!runningAppIds.has(appId)) {
          if (info.state === "starting") {
            // Container is still starting, don't remove it yet
            console.log(
              `[${new Date().toLocaleString()}] [AppContainerService] Skipping stale check for app-${appId} (still in starting state)`,
            );
            continue;
          }
          console.log(
            `[${new Date().toLocaleString()}] [AppContainerService] Removing stale container entry: app-${appId} (state: ${info.state})`,
          );
          if (info.agentPort > 0) {
            allocatedAgentPorts.delete(info.agentPort);
          }
          appContainers.delete(appId);
        }
      }

      console.log(
        `[${new Date().toLocaleString()}] [AppContainerService] found ${appContainers.size} active container(s)`,
      );
    } catch (error) {
      console.error(
        "[AppContainerService] Failed to scan existing containers:",
        error,
      );
    }
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    if (idleCheckInterval) {
      clearInterval(idleCheckInterval);
      idleCheckInterval = null;
    }

    await this.stopAllContainers();
    console.log("[AppContainerService] Shutdown complete");
  }

  /**
   * Allocate an available agent port
   */
  private allocateAgentPort(): number {
    for (let port = AGENT_PORT_MIN; port <= AGENT_PORT_MAX; port++) {
      if (!allocatedAgentPorts.has(port)) {
        allocatedAgentPorts.add(port);
        return port;
      }
    }
    throw new Error("No available agent ports");
  }

  /**
   * Allocate an available dev server port
   */
  private allocateDevPort(): number {
    for (let port = DEV_PORT_MIN; port <= DEV_PORT_MAX; port++) {
      if (!allocatedDevPorts.has(port)) {
        allocatedDevPorts.add(port);
        return port;
      }
    }
    throw new Error("No available dev server ports");
  }

  /**
   * Release allocated ports
   */
  private releasePorts(agentPort: number, devPort: number): void {
    allocatedAgentPorts.delete(agentPort);
    allocatedDevPorts.delete(devPort);
  }

  /**
   * Start an app container (or return existing if already running)
   * Connects to kova-network and configures Traefik routing
   */
  async startContainer(cfg: StartContainerConfig): Promise<ContainerPorts> {
    const { appId, userId, appPath } = cfg;
    const containerName = `app-${appId}`;
    const previewUrl = `http://${containerName}.${config.PREVIEW_DOMAIN}:${config.PREVIEW_PORT}`;

    // Use mutex to prevent concurrent container operations for the same app
    const existingLock = containerOperationLocks.get(appId);
    if (existingLock) {
      console.log(
        `[AppContainerService] Waiting for existing operation on app ${appId} to complete`,
      );
      try {
        const result = await existingLock;
        // Previous operation succeeded, return its result
        console.log(
          `[AppContainerService] Previous operation succeeded, reusing container on port ${result.agentPort}`,
        );
        this.recordActivity(appId, "agent");
        return result;
      } catch {
        // Previous operation failed, continue with new operation
        console.log(
          `[AppContainerService] Previous operation failed, starting new operation`,
        );
      }
    }

    // After waiting, check if container is now running (another request may have started it)
    const existing = appContainers.get(appId);
    if (existing && existing.state === "running" && existing.containerId) {
      try {
        const container = docker.getContainer(existing.containerId);
        const info = await container.inspect();
        if (info.State.Running) {
          console.log(
            `[AppContainerService] Container ${containerName} is now running (after lock wait), reusing`,
          );
          this.recordActivity(appId, "agent");
          return {
            agentPort: existing.agentPort,
            devPort: existing.devPort,
            agentUrl: `http://localhost:${existing.agentPort}`,
            devUrl: `http://localhost:${existing.devPort}`,
            previewUrl,
          };
        }
      } catch {
        // Container doesn't exist, continue with creation
      }
    }

    // Create new lock for this operation
    const operationPromise = this._startContainerImpl(cfg);
    containerOperationLocks.set(appId, operationPromise);

    try {
      const result = await operationPromise;
      return result;
    } finally {
      containerOperationLocks.delete(appId);
    }
  }

  /**
   * Internal implementation of startContainer
   */
  private async _startContainerImpl(
    cfg: StartContainerConfig,
  ): Promise<ContainerPorts> {
    const { appId, userId, appPath } = cfg;
    const containerName = `app-${appId}`;
    const previewUrl = `http://${containerName}.${config.PREVIEW_DOMAIN}:${config.PREVIEW_PORT}`;

    // Check if container is already running
    const existing = appContainers.get(appId);
    console.log(
      `[AppContainerService] startContainer for ${containerName}: existing entry =`,
      existing
        ? JSON.stringify({
            containerId: existing.containerId?.slice(0, 12),
            agentPort: existing.agentPort,
            state: existing.state,
          })
        : "none",
    );

    if (
      existing &&
      (existing.state === "running" || existing.state === "starting") &&
      existing.containerId
    ) {
      // Verify the container is actually running in Docker
      try {
        const container = docker.getContainer(existing.containerId);
        const info = await container.inspect();
        console.log(
          `[AppContainerService] Container ${containerName} inspect: Running=${info.State.Running}, Status=${info.State.Status}`,
        );
        if (info.State.Running) {
          // Container is actually running, return existing
          this.recordActivity(appId, "agent");
          console.log(
            `[AppContainerService] Reusing existing container ${containerName} on port ${existing.agentPort}`,
          );
          return {
            agentPort: existing.agentPort,
            devPort: existing.devPort,
            agentUrl: `http://localhost:${existing.agentPort}`,
            devUrl: `http://localhost:${existing.devPort}`,
            previewUrl,
          };
        } else {
          // Container exists but not running, clean up and recreate
          console.log(
            `[AppContainerService] Container ${containerName} not running (Status=${info.State.Status}), will recreate`,
          );
          this.releasePorts(existing.agentPort, existing.devPort);
          appContainers.delete(appId);
          // Also try to remove the stopped container
          try {
            await container.remove({ force: true });
            console.log(
              `[AppContainerService] Removed stopped container ${containerName}`,
            );
          } catch (removeErr) {
            console.log(
              `[AppContainerService] Failed to remove stopped container: ${removeErr}`,
            );
          }
        }
      } catch (inspectError: any) {
        // Container doesn't exist, clean up stale entry
        console.log(
          `[AppContainerService] Container ${containerName} inspect failed: ${inspectError.message}`,
        );
        this.releasePorts(existing.agentPort, existing.devPort);
        appContainers.delete(appId);
      }
    }

    // Allocate ports (still needed for agent access from host)
    const agentPort = this.allocateAgentPort();
    const devPort = this.allocateDevPort();

    // Full path on server (resolve to absolute path)
    const fullAppPath = resolve(appsBasePath, appPath);

    // Ensure the app directory exists
    if (!existsSync(fullAppPath)) {
      mkdirSync(fullAppPath, { recursive: true });
      console.log(
        `[AppContainerService] Created app directory: ${fullAppPath}`,
      );
    }

    // Convert to Docker-compatible path for volume mount
    const dockerAppPath = toDockerPath(fullAppPath);

    // Environment variables for the container
    const envArray = [
      `ANTHROPIC_API_KEY=${config.ANTHROPIC_API_KEY || ""}`,
      `APP_ID=${appId}`,
      `WORKSPACE_DIR=/workspace`,
      `AGENT_PORT=3100`,
      `DEV_SERVER_PORT=3000`,
      // Store Claude sessions in workspace (persisted via bind mount)
      `CLAUDE_CONFIG_DIR=/workspace/.claude`,
      // ProGet API key for internal npm packages
      `PROGET_API_KEY=${config.PROGET_API_KEY || ""}`,
    ];

    // Update state to starting
    appContainers.set(appId, {
      containerId: null,
      containerName,
      agentPort,
      devPort,
      userId,
      state: "starting",
      lastActivityAt: Date.now(),
    });

    try {
      console.log(`\n========== START CONTAINER DEBUG ==========`);
      console.log(
        `[AppContainerService] Starting container ${containerName} for app ${appId}`,
      );
      console.log(
        `[AppContainerService] Timestamp: ${new Date().toISOString()}`,
      );
      console.log(`[AppContainerService] Agent port: ${agentPort}`);
      console.log(`[AppContainerService] App path: ${fullAppPath}`);
      console.log(`[AppContainerService] Docker path: ${dockerAppPath}`);
      console.log(`[AppContainerService] Preview URL: ${previewUrl}`);
      console.log(`===========================================\n`);

      // Remove existing container with same name if any
      try {
        const existingContainer = docker.getContainer(containerName);
        console.log(
          `[AppContainerService] Found existing container ${containerName}, removing with force=true (will send SIGKILL)`,
        );
        await existingContainer.remove({ force: true });
        console.log(
          `[AppContainerService] Removed existing container: ${containerName}`,
        );
      } catch (removeError: any) {
        // Container doesn't exist, which is fine
        if (removeError.statusCode !== 404) {
          console.log(
            `[AppContainerService] Remove container ${containerName} error: ${removeError.message}`,
          );
        }
      }

      // Create container connected to kova-network for Traefik routing
      const container = await docker.createContainer({
        Image: this.containerImage,
        name: containerName,
        WorkingDir: "/app",
        Env: envArray,
        ExposedPorts: {
          "3000/tcp": {}, // Dev server
          "3100/tcp": {}, // Agent server
        },
        HostConfig: {
          NetworkMode: config.CONTAINER_NETWORK,
          Binds: [`${dockerAppPath}:/workspace:rw`],
          // Agent port exposed to host for direct access
          PortBindings: {
            "3100/tcp": [{ HostPort: agentPort.toString() }],
          },
          Memory: 1024 * 1024 * 1024, // 1GB
          MemorySwap: 2 * 1024 * 1024 * 1024, // 2GB with swap
          CpuPeriod: 100000,
          CpuQuota: 100000, // 100% CPU (1 core)
        },
        Labels: {
          "kova.app-container": "true",
          "kova.app.id": appId.toString(),
          "kova.user.id": userId.toString(),
        },
        Tty: true,
      });

      // Update container id as soon as it's known (even before start)
      const containerInfo = appContainers.get(appId);
      if (containerInfo) {
        containerInfo.containerId = container.id;
      }

      // Start container
      await container.start();

      // Note: Traefik HTTP provider polls /api/traefik/config for routes
      // Routes are generated dynamically from appContainers map

      // Update container state
      const containerInfoAfterStart = appContainers.get(appId);
      if (containerInfoAfterStart) {
        containerInfoAfterStart.state = "running";
      }

      // Monitor container for exit
      this.monitorContainer(appId, container);

      console.log(
        `[AppContainerService] Container started: ${containerName} (agent: ${agentPort}, preview: ${previewUrl})`,
      );

      return {
        agentPort,
        devPort,
        agentUrl: `http://localhost:${agentPort}`,
        devUrl: `http://localhost:${devPort}`,
        previewUrl,
      };
    } catch (error: any) {
      // Cleanup on error
      this.releasePorts(agentPort, devPort);
      appContainers.delete(appId);
      console.error(
        `[AppContainerService] Failed to start container for app ${appId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Monitor container for exit
   */
  private async monitorContainer(
    appId: number,
    container: Docker.Container,
  ): Promise<void> {
    try {
      const result = await container.wait();
      console.log(
        `[AppContainerService] Container exited for app ${appId}:`,
        result,
      );
      this.handleContainerExit(appId);
    } catch (error) {
      console.error(
        `[AppContainerService] Error monitoring container for app ${appId}:`,
        error,
      );
    }
  }

  /**
   * Handle container exit
   */
  private handleContainerExit(appId: number): void {
    const containerInfo = appContainers.get(appId);
    if (containerInfo) {
      this.releasePorts(containerInfo.agentPort, containerInfo.devPort);
      appContainers.delete(appId);
    }
  }

  /**
   * Stop an app container
   */
  async stopContainer(appId: number, reason?: string): Promise<void> {
    // CRITICAL DEBUG: This MUST appear before "Container stopped"
    // Build ID: 20260104-2130
    console.log(
      `\n\n\n*************************************************************`,
    );
    console.log(`***** STOP CONTAINER CALLED - BUILD 20260104-2130 *****`);
    console.log(`***** App ID: ${appId}, Reason: ${reason || "NONE"} *****`);
    console.log(
      `*************************************************************\n`,
    );

    // Log call stack to trace who's calling stopContainer
    const stack = new Error().stack;
    console.log(`\n========== STOP CONTAINER DEBUG ==========`);
    console.log(`[AppContainerService] stopContainer called for app ${appId}`);
    console.log(
      `[AppContainerService] Reason: ${reason || "UNKNOWN - NOT PROVIDED"}`,
    );
    console.log(`[AppContainerService] Timestamp: ${new Date().toISOString()}`);
    console.log(`[AppContainerService] Call stack:`);
    console.log(stack?.split("\n").slice(1, 8).join("\n"));
    console.log(`===========================================\n`);

    const containerInfo = appContainers.get(appId);

    if (!containerInfo || containerInfo.state === "none") {
      console.log(
        `[AppContainerService] stopContainer: app ${appId} already stopped (no entry or state=none)`,
      );
      return; // Already stopped
    }

    if (containerInfo.state === "stopping") {
      console.log(
        `[AppContainerService] stopContainer: app ${appId} already stopping`,
      );
      return; // Already stopping
    }

    if (containerInfo.state === "starting") {
      console.log(
        `[AppContainerService] stopContainer: app ${appId} is still starting, will not stop`,
      );
      return; // Don't stop containers that are still starting
    }

    console.log(
      `[AppContainerService] stopContainer: transitioning app ${appId} from ${containerInfo.state} to stopping`,
    );
    containerInfo.state = "stopping";

    try {
      const containerHandle =
        containerInfo.containerId ?? containerInfo.containerName;
      console.log(
        `[AppContainerService] Stopping container ${containerHandle} (will send SIGTERM, wait 10s)`,
      );
      const container = docker.getContainer(containerHandle);
      await container.stop({ t: 10 }); // 10 second timeout
      console.log(
        `[AppContainerService] Container stopped for app ${appId} [BUILD-20260104-2130]`,
      );
    } catch (error: any) {
      // Container might already be stopped
      if (!error.message?.includes("is not running")) {
        console.error(
          `[AppContainerService] Error stopping container for app ${appId}:`,
          error,
        );
      }
    }

    // Cleanup
    this.releasePorts(containerInfo.agentPort, containerInfo.devPort);
    appContainers.delete(appId);
  }

  /**
   * Get container ports for an app
   */
  getContainerPorts(appId: number): ContainerPorts | null {
    const containerInfo = appContainers.get(appId);

    if (!containerInfo || containerInfo.state !== "running") {
      return null;
    }

    const previewUrl = `http://${containerInfo.containerName}.${config.PREVIEW_DOMAIN}:${config.PREVIEW_PORT}`;

    return {
      agentPort: containerInfo.agentPort,
      devPort: containerInfo.devPort,
      agentUrl: `http://localhost:${containerInfo.agentPort}`,
      devUrl: `http://localhost:${containerInfo.devPort}`,
      previewUrl,
    };
  }

  /**
   * Get container status
   */
  getContainerStatus(appId: number): {
    state: ContainerState;
    ports?: ContainerPorts;
  } {
    const containerInfo = appContainers.get(appId);

    if (!containerInfo) {
      return { state: "none" };
    }

    const previewUrl = `http://${containerInfo.containerName}.${config.PREVIEW_DOMAIN}:${config.PREVIEW_PORT}`;

    return {
      state: containerInfo.state,
      ports:
        containerInfo.state === "running"
          ? {
              agentPort: containerInfo.agentPort,
              devPort: containerInfo.devPort,
              agentUrl: `http://localhost:${containerInfo.agentPort}`,
              devUrl: `http://localhost:${containerInfo.devPort}`,
              previewUrl,
            }
          : undefined,
    };
  }

  /**
   * Get all running containers (for Traefik HTTP provider)
   */
  getRunningContainers(): Map<number, AppContainerInfo> {
    const running = new Map<number, AppContainerInfo>();
    for (const [appId, info] of appContainers.entries()) {
      if (info.state === "running") {
        running.set(appId, info);
      }
    }
    return running;
  }

  /**
   * Record activity to reset idle timer
   */
  recordActivity(appId: number, type: "agent" | "preview"): void {
    const containerInfo = appContainers.get(appId);
    if (containerInfo) {
      containerInfo.lastActivityAt = Date.now();
    }
  }

  /**
   * Check if container has been idle for longer than the timeout and stop it if so
   */
  private async stopIdleContainers(): Promise<void> {
    const now = Date.now();

    for (const [appId, containerInfo] of appContainers.entries()) {
      if (containerInfo.state !== "running") {
        continue;
      }

      const idleTime = now - containerInfo.lastActivityAt;
      if (idleTime > this.idleTimeoutMs) {
        const idleMinutes = Math.round(idleTime / 60000);
        console.log(`\n========== IDLE TIMEOUT ==========`);
        console.log(`[AppContainerService] Container for app ${appId} has been idle for ${idleMinutes} minutes`);
        console.log(`[AppContainerService] Idle timeout threshold: ${Math.round(this.idleTimeoutMs / 60000)} minutes`);
        console.log(`[AppContainerService] Stopping container due to IDLE TIMEOUT`);
        console.log(`==================================\n`);
        await this.stopContainer(
          appId,
          `IDLE TIMEOUT: no activity for ${idleMinutes} minutes`,
        );
      }
    }
  }

  /**
   * Stop all containers for a user
   */
  async stopUserContainers(userId: number): Promise<void> {
    const userContainers = Array.from(appContainers.entries()).filter(
      ([_, info]) => info.userId === userId,
    );

    await Promise.all(
      userContainers.map(([appId]) =>
        this.stopContainer(appId, `user ${userId} containers cleanup`),
      ),
    );
  }

  /**
   * Stop all containers (for shutdown)
   */
  async stopAllContainers(): Promise<void> {
    const allAppIds = Array.from(appContainers.keys());
    await Promise.all(
      allAppIds.map((appId) => this.stopContainer(appId, "shutdown")),
    );
  }

  /**
   * Ensure the container image exists (build if needed)
   */
  async ensureImageExists(): Promise<void> {
    try {
      await docker.getImage(this.containerImage).inspect();
      console.log(`[AppContainerService] Image ${this.containerImage} exists`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        console.log(
          `[AppContainerService] Image ${this.containerImage} not found, please build it first`,
        );
        throw new Error(
          `Docker image ${this.containerImage} not found. Run 'docker-compose build app-container' first.`,
        );
      }
      throw error;
    }
  }
}

export const appContainerService = new AppContainerService();
