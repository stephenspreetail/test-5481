/**
 * App Container Service
 * Manages containers for running Claude Agent SDK + Dev Server per app
 * Uses orchestrator abstraction (Docker/Podman or Kubernetes)
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config/index.js";
import { broadcastPreviewReady } from "../websocket/handlers/app-output.handler.js";
import { createOrchestrator } from "./orchestrator/index.js";
import type { ContainerInfo, ContainerState } from "./orchestrator/types.js";
import {
  buildLlmEnvironment,
  buildLlmProviderConfig,
} from "./llm-provider.service.js";
import { buildK8sEnvironmentConfig } from "./k8s-environment.service.js";
import { shortId, appHostname } from "../utils/app-identifiers.js";
import {
  ensureWatching as ensurePodWatcher,
  stopAllWatchers,
  clearAppWatchState,
  queryPodStatus,
} from "./k8s-pod-watcher.service.js";
import {
  broadcastAgentStatus,
  clearAgentStatus,
  registerStatusResolver,
} from "../websocket/handlers/agent-status.handler.js";
// TODO: Re-enable when agent token validation is implemented in app-container
// import { generateAgentToken } from "./agent-auth.service.js";

/**
 * Resolve the apps base path to an absolute path
 * Relative paths are resolved from the project root (parent of backend/)
 * so that ./backend/apps in .env works regardless of where the server runs from
 */
function resolveAppsBasePath(): string {
  const basePath = config.APPS_BASE_PATH;
  // If it's already absolute, use it
  if (resolve(basePath) === basePath) {
    return basePath;
  }
  // Resolve relative to project root (this file is at backend/src/services/)
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(currentDir, "../../..");
  return resolve(projectRoot, basePath);
}

const orchestrator = createOrchestrator();
const appsBasePath = resolveAppsBasePath();

export interface AppContainerInfo {
  containerId: string | null;
  containerName: string;
  agentUrl: string;
  previewUrl: string;
  userId: number;
  state: ContainerState;
  lastActivityAt: number;
}

// Track running containers by appId
const appContainers = new Map<number, AppContainerInfo>();

// Map appId to ContainerInfo from orchestrator
function toAppContainerInfo(
  appId: number,
  userId: number,
  containerInfo: ContainerInfo
): AppContainerInfo {
  return {
    containerId: containerInfo.containerId,
    containerName: containerInfo.containerName,
    agentUrl: containerInfo.agentUrl,
    previewUrl: containerInfo.previewUrl,
    userId,
    state: containerInfo.state,
    lastActivityAt: containerInfo.lastActivityAt,
  };
}

// Mutex to prevent concurrent container operations for the same app
const containerOperationLocks = new Map<number, Promise<any>>();

// Idle timeout check interval
let idleCheckInterval: NodeJS.Timeout | null = null;

// Default idle timeout: 15 minutes
const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export interface StartContainerConfig {
  appId: number;
  appGuid: string;
  appSlug?: string;
  userId: number;
  appPath: string;
}

export interface ContainerPorts {
  agentUrl: string;
  previewUrl: string;
}

class AppContainerService {
  private idleTimeoutMs: number;
  private containerImage: string;
  private containerScanIntervalMs: number;

  constructor() {
    this.idleTimeoutMs = config.CONTAINER_IDLE_TIMEOUT_MS;
    this.containerImage = buildK8sEnvironmentConfig().containerImage;
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
      `[${timestamp}] [AppContainerService] config: orchestrator type: ${config.ORCHESTRATOR_TYPE} (Kubernetes)`,
    );
    console.log(
      `[${timestamp}] [AppContainerService] config: container scan interval: ${this.containerScanIntervalMs}ms`,
    );
    console.log(
      `[${timestamp}] [AppContainerService] config: idle timeout interval (${this.idleTimeoutMs}ms)`,
    );

    // Initialize orchestrator
    await orchestrator.initialize();

    // Register the status resolver: on subscribe, query K8s directly for
    // real pod state instead of relying on cached/stale data.
    registerStatusResolver((appId) => queryPodStatus(appId));

    // Start namespace-wide pod watcher for real-time push updates
    ensurePodWatcher();

    if (idleCheckInterval) {
      clearInterval(idleCheckInterval);
    }

    // Periodically scan for containers to reconcile in-memory state.
    // Idle timeout is disabled — containers are kept long-lived for shareable preview URLs.
    idleCheckInterval = setInterval(() => {
      this.scanExistingContainers();
    }, this.containerScanIntervalMs);

    // Scan for existing containers
    await this.scanExistingContainers();

    console.log(`[${timestamp}] [AppContainerService] initialized`);
  }

  /**
   * Reconcile container reality → in-memory maps
   * (handles the case where backend restarts but containers are still running)
   */
  private async scanExistingContainers(): Promise<void> {
    console.log(
      `[${new Date().toLocaleString()}] [AppContainerService] scanning containers...`,
    );

    try {
      const containers = await orchestrator.listContainers();

      // Track which appIds we found running
      const runningAppIds = new Set<number>();

      for (const containerInfo of containers) {
        // Extract appId from ContainerInfo.
        // Helm orchestrator: appId comes from kova.dev/app-id label
        // Kubectl orchestrator: appId parsed from container name "app-{intId}"
        let appId: number;
        if (containerInfo.appId != null) {
          appId = containerInfo.appId;
        } else {
          const match = containerInfo.containerName.match(/^app-(\d+)$/);
          if (!match) continue;
          appId = parseInt(match[1], 10);
        }
        runningAppIds.add(appId);

        // Skip if we already know about this container
        if (appContainers.has(appId)) {
          continue;
        }

        // Track this container (userId defaults to 0 - could be enhanced)
        appContainers.set(appId, {
          containerId: containerInfo.containerId,
          containerName: containerInfo.containerName,
          agentUrl: containerInfo.agentUrl,
          previewUrl: containerInfo.previewUrl,
          userId: 0, // Can't determine from orchestrator - would need labels
          state: containerInfo.state,
          lastActivityAt: containerInfo.lastActivityAt,
        });

        // Seed agent status cache for running containers
        if (containerInfo.state === "running") {
          broadcastAgentStatus(appId, "ready");
          broadcastPreviewReady(appId, containerInfo.previewUrl);
        }

        console.log(
          `[${new Date().toLocaleString()}] [AppContainerService] discovered container ${containerInfo.containerName} (appId: ${appId})`,
        );
      }

      // Remove stale entries for containers no longer running
      // BUT don't remove entries in "starting" state
      for (const [appId, info] of appContainers.entries()) {
        if (!runningAppIds.has(appId)) {
          if (info.state === "starting") {
            console.log(
              `[${new Date().toLocaleString()}] [AppContainerService] Skipping stale check for app-${appId} (still in starting state)`,
            );
            continue;
          }
          console.log(
            `[${new Date().toLocaleString()}] [AppContainerService] Removing stale container entry: app-${appId} (state: ${info.state})`,
          );
          appContainers.delete(appId);
          clearAgentStatus(appId);
          clearAppWatchState(appId);
          broadcastAgentStatus(appId, "offline");
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
    stopAllWatchers();
    await this.stopAllContainers();
    await orchestrator.shutdown();
    console.log("[AppContainerService] Shutdown complete");
  }

  /**
   * Start an app container (or return existing if already running)
   */
  async startContainer(cfg: StartContainerConfig): Promise<ContainerPorts> {
    const { appId, userId, appPath } = cfg;

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
          `[AppContainerService] Previous operation succeeded, reusing container`,
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
      // Verify with orchestrator
      const containerInfo = await orchestrator.getContainer(appId);
      if (containerInfo && containerInfo.state === "running") {
        console.log(
          `[AppContainerService] Container app-${appId} is now running (after lock wait), reusing`,
        );
        this.recordActivity(appId, "agent");
        broadcastPreviewReady(appId, containerInfo.previewUrl);
        broadcastAgentStatus(appId, "ready");
        return {
          agentUrl: containerInfo.agentUrl,
          previewUrl: containerInfo.previewUrl,
        };
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
    const { appId, userId, appPath, appGuid, appSlug } = cfg;
    const containerName = `app-${appId}`; // Display name for logs (K8s name computed by orchestrator)

    // Check if container is already running
    const existing = appContainers.get(appId);
    console.log(
      `[AppContainerService] startContainer for ${containerName}: existing entry =`,
      existing
        ? JSON.stringify({
            containerId: existing.containerId?.slice(0, 12),
            state: existing.state,
          })
        : "none",
    );

    if (
      existing &&
      (existing.state === "running" || existing.state === "starting") &&
      existing.containerId
    ) {
      // Verify the container is actually running
      const containerInfo = await orchestrator.getContainer(appId);
      if (containerInfo && containerInfo.state === "running") {
        // Container is actually running, return existing
        this.recordActivity(appId, "agent");
        console.log(
          `[AppContainerService] Reusing existing container ${containerName}`,
        );
        broadcastPreviewReady(appId, containerInfo.previewUrl);
        broadcastAgentStatus(appId, "ready");
        return {
          agentUrl: containerInfo.agentUrl,
          previewUrl: containerInfo.previewUrl,
        };
      } else {
        // Container not running, clean up and recreate
        console.log(
          `[AppContainerService] Container ${containerName} not running, will recreate`,
        );
        appContainers.delete(appId);
        // Try to remove stopped container
        if (existing.containerId) {
          try {
            await orchestrator.stopContainer(existing.containerId);
          } catch (err) {
            console.log(`[AppContainerService] Failed to cleanup: ${err}`);
          }
        }
      }
    }


    // Full path on server (resolve to absolute path)
    const fullAppPath = resolve(appsBasePath, appPath);

    // Ensure the app directory exists
    if (!existsSync(fullAppPath)) {
      mkdirSync(fullAppPath, { recursive: true });
      console.log(
        `[AppContainerService] Created app directory: ${fullAppPath}`,
      );
    }

    // Build LLM provider environment variables
    const llmProviderConfig = buildLlmProviderConfig();
    const llmEnv = buildLlmEnvironment(llmProviderConfig);

    // Get K8s environment config to determine port strategy
    const k8sEnv = buildK8sEnvironmentConfig();

    // Port allocation strategy:
    // - EKS: Use fixed standard ports (no conflicts with ClusterIP services)
    // - Local k3d: Use unique ports per app (needed for hostNetwork)
    let agentPort: number;
    let devPort: number;
    if (k8sEnv.isEKS) {
      // EKS: Fixed standard ports
      agentPort = 3100;
      devPort = 3000;
    } else {
      // Local k3d: Unique ports (31000 + appId)
      const basePort = 31000 + appId;
      agentPort = basePort - 100;
      devPort = basePort;
    }

    // TODO: Implement agent token validation in app-container.
    // For now, pass empty string to avoid unnecessary deployment churn —
    // a new JWT on every start changes the deployment spec and forces a
    // full pod recreation even when just scaling from 0 → 1.
    const agentToken = "";

    // Build app-specific preview URL for Vite's allowedHosts
    // For helm orchestrator, use shortId-based hostname; for kubectl, use legacy appId-based
    const isHelmMode = config.ORCHESTRATOR_TYPE === "helm";
    const appPreviewHost = isHelmMode
      ? appHostname(
          k8sEnv.previewUrlMode === "slug" && appSlug
            ? { mode: "slug", slug: appSlug, domain: k8sEnv.previewDomain }
            : { mode: "prefixed", shortId: shortId(appGuid), domain: k8sEnv.previewDomain },
        )
      : `app-${appId}.${k8sEnv.previewDomain}`;

    // Environment variables for the container
    const env = {
      // LLM Provider credentials (Anthropic API, Azure, or Bedrock)
      ...llmEnv,
      // Container metadata
      APP_ID: appId.toString(),
      WORKSPACE_DIR: "/workspace",
      AGENT_PORT: agentPort.toString(),
      DEV_SERVER_PORT: devPort.toString(),
      // Agent API authentication
      AGENT_TOKEN: agentToken,
      // Cluster identifier (for tracking app location)
      K8S_CLUSTER: k8sEnv.clusterIdentifier,
      // Store Claude sessions in workspace (persisted via bind mount)
      CLAUDE_CONFIG_DIR: "/workspace/.claude",
      // ProGet API key for internal npm packages
      PROGET_API_KEY: config.PROGET_API_KEY || "",
      // Data Platform credentials (Starburst Galaxy / Trino)
      DATA_PLATFORM_HOST: config.DATA_PLATFORM_HOST,
      DATA_PLATFORM_USER: config.DATA_PLATFORM_USER,
      DATA_PLATFORM_PASSWORD: config.DATA_PLATFORM_PASSWORD,
      // GitLab token + plugin marketplace for private plugin
      GITLAB_TOKEN: config.GITLAB_TOKEN,
      KOVA_PLUGIN_REPO: config.KOVA_PLUGIN_REPO,
      KOVA_PLUGIN_NAME: config.KOVA_PLUGIN_NAME,
      KOVA_PLUGIN_BRANCH: config.KOVA_PLUGIN_BRANCH,
      // Agent configuration
      VERBOSE_AGENT_LOGGING: config.VERBOSE_AGENT_LOGGING,
      // Vite dev server security: Allow this app's specific preview host
      // Vite 5.4+ blocks all hosts by default unless in vite.config or this env var
      __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: appPreviewHost,
    };

    // Update state to starting
    appContainers.set(appId, {
      containerId: null,
      containerName,
      agentUrl: "", // Will be updated after spawn
      previewUrl: "", // Will be updated after spawn
      userId,
      state: "starting",
      lastActivityAt: Date.now(),
    });
    broadcastAgentStatus(appId, "scheduling");

    try {
      console.log(`\n========== START CONTAINER DEBUG ==========`);
      console.log(
        `[AppContainerService] Starting container ${containerName} for app ${appId}`,
      );
      console.log(
        `[AppContainerService] Timestamp: ${new Date().toISOString()}`,
      );
      console.log(`[AppContainerService] App path: ${fullAppPath}`);
      console.log(`===========================================\n`);

      // Spawn container via orchestrator
      const containerInfo = await orchestrator.spawnContainer({
        appId,
        appGuid,
        appSlug,
        userId,
        appPath: fullAppPath,
        image: this.containerImage,
        env,
      });

      // Update container state
      const appInfo = appContainers.get(appId);
      if (appInfo) {
        appInfo.containerId = containerInfo.containerId;
        appInfo.agentUrl = containerInfo.agentUrl;
        appInfo.previewUrl = containerInfo.previewUrl;
        appInfo.state = containerInfo.state;
      }

      // Notify subscribers that the preview is ready
      broadcastPreviewReady(appId, containerInfo.previewUrl);
      broadcastAgentStatus(appId, "ready");

      console.log(
        `[AppContainerService] Container started: ${containerName} (preview: ${containerInfo.previewUrl})`,
      );

      return {
        agentUrl: containerInfo.agentUrl,
        previewUrl: containerInfo.previewUrl,
      };
    } catch (error: any) {
      // Cleanup on error
      appContainers.delete(appId);
      broadcastAgentStatus(appId, "error");
      console.error(
        `[AppContainerService] Failed to start container for app ${appId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Copy a file from the host filesystem into a running container's workspace
   */
  async copyFileToContainer(appId: number, localPath: string, containerPath: string): Promise<void> {
    await orchestrator.copyFileToContainer(appId, localPath, containerPath);
  }

  /**
   * Read a file from a running container's workspace
   */
  async readFileFromContainer(appId: number, containerPath: string): Promise<string> {
    return orchestrator.readFileFromContainer(appId, containerPath);
  }

  /**
   * Check if a container is currently running for the given app
   */
  isContainerRunning(appId: number): boolean {
    const containerInfo = appContainers.get(appId);
    return containerInfo?.state === "running" && containerInfo.containerId !== null;
  }

  /**
   * Stop an app container
   */
  async stopContainer(
    appId: number,
    options?: { reason?: string; deletePersistentStorage?: boolean },
  ): Promise<void> {
    const reason = options?.reason;
    const deletePersistentStorage = options?.deletePersistentStorage || false;

    console.log(
      `\n\n\n*************************************************************`,
    );
    console.log(`***** STOP CONTAINER CALLED *****`);
    console.log(`***** App ID: ${appId}, Reason: ${reason || "NONE"} *****`);
    console.log(
      `***** Delete Storage: ${deletePersistentStorage ? "YES" : "NO"} *****`,
    );
    console.log(
      `*************************************************************\n`,
    );

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

    if (!containerInfo || containerInfo.state === "stopped") {
      console.log(
        `[AppContainerService] stopContainer: app ${appId} already stopped`,
      );
      return;
    }

    if (containerInfo.state === "stopping") {
      console.log(
        `[AppContainerService] stopContainer: app ${appId} already stopping`,
      );
      return;
    }

    if (containerInfo.state === "starting") {
      console.log(
        `[AppContainerService] stopContainer: app ${appId} is still starting, will not stop`,
      );
      return;
    }

    console.log(
      `[AppContainerService] stopContainer: transitioning app ${appId} from ${containerInfo.state} to stopping`,
    );
    containerInfo.state = "stopping";

    // Broadcast offline and clear watcher tracking for this app
    broadcastAgentStatus(appId, "offline");
    clearAppWatchState(appId);

    try {
      if (containerInfo.containerId) {
        console.log(
          `[AppContainerService] Stopping container ${containerInfo.containerId}`,
        );
        await orchestrator.stopContainer(containerInfo.containerId);
        console.log(
          `[AppContainerService] Container stopped for app ${appId}`,
        );

        // Delete persistent storage if requested (app is being permanently deleted)
        if (deletePersistentStorage) {
          console.log(
            `[AppContainerService] Deleting persistent storage for app ${appId}`,
          );
          try {
            await orchestrator.deletePersistentStorage(appId);
            console.log(
              `[AppContainerService] Persistent storage deleted for app ${appId}`,
            );
          } catch (error: any) {
            console.error(
              `[AppContainerService] Failed to delete persistent storage for app ${appId}:`,
              error,
            );
            // Don't throw - container is already stopped
          }
        }
      }
    } catch (error: any) {
      console.error(
        `[AppContainerService] Error stopping container for app ${appId}:`,
        error,
      );
    }

    // Cleanup
    appContainers.delete(appId);
    clearAgentStatus(appId);
  }

  /**
   * Get container ports for an app
   */
  getContainerPorts(appId: number): ContainerPorts | null {
    const containerInfo = appContainers.get(appId);

    if (!containerInfo || containerInfo.state !== "running") {
      return null;
    }

    return {
      agentUrl: containerInfo.agentUrl,
      previewUrl: containerInfo.previewUrl,
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
      return { state: "pending" };
    }

    return {
      state: containerInfo.state,
      ports:
        containerInfo.state === "running"
          ? {
              agentUrl: containerInfo.agentUrl,
              previewUrl: containerInfo.previewUrl,
            }
          : undefined,
    };
  }

  /**
   * Get all running containers
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
    try {
      const cleanedCount = await orchestrator.cleanupIdleContainers(
        this.idleTimeoutMs,
      );

      if (cleanedCount > 0) {
        const idleMinutes = Math.round(this.idleTimeoutMs / 60000);
        console.log(`\n========== IDLE TIMEOUT ==========`);
        console.log(
          `[AppContainerService] Cleaned up ${cleanedCount} idle container(s)`,
        );
        console.log(
          `[AppContainerService] Idle timeout threshold: ${idleMinutes} minutes`,
        );
        console.log(`==================================\n`);

        // Refresh our container map
        await this.scanExistingContainers();
      }
    } catch (error) {
      console.error(
        "[AppContainerService] Error during idle container cleanup:",
        error,
      );
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
        this.stopContainer(appId, {
          reason: `user ${userId} containers cleanup`,
        }),
      ),
    );
  }

  /**
   * Stop all containers (for shutdown)
   */
  async stopAllContainers(): Promise<void> {
    const allAppIds = Array.from(appContainers.keys());
    await Promise.all(
      allAppIds.map((appId) => this.stopContainer(appId, { reason: "shutdown" })),
    );
  }

  /**
   * Ensure the container image exists (build if needed)
   */
  async ensureImageExists(): Promise<void> {
    console.log(
      `[AppContainerService] Using Kubernetes - image ${this.containerImage} will be pulled by cluster`,
    );
  }
}

export const appContainerService = new AppContainerService();
