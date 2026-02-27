/**
 * Container Orchestrator Types
 * Abstractions for container management across different platforms
 * ...Local (Rancher, Podman), Kubernetes, ECS Fargate
 */

/**
 * Configuration for spawning a new app container
 */
export interface SpawnContainerConfig {
  /** Unique app identifier (integer, for backward compat) */
  appId: number;
  /** Globally unique app identifier (UUID) — used for K8s resource naming */
  appGuid: string;
  /** User-defined slug (optional, used for preview URLs in slug mode) */
  appSlug?: string;
  /** User who owns the app */
  userId: number;
  /** Path to app files on host (for volume mount) */
  appPath: string;
  /** Container image to use */
  image: string;
  /** Environment variables to pass to container */
  env: Record<string, string>;
}

/**
 * Information about a running container
 */
export interface ContainerInfo {
  /** Platform-specific container/task identifier */
  containerId: string;
  /** Container name (used for DNS resolution) */
  containerName: string;
  /** Internal URL for agent server (backend → container) */
  agentUrl: string;
  /** External URL for dev server preview (browser → container via proxy) */
  previewUrl: string;
  /** Current state of the container */
  state: ContainerState;
  /** Timestamp of last activity */
  lastActivityAt: number;
}

/**
 * Container lifecycle states
 */
export type ContainerState =
  | "pending" // Container creation requested
  | "starting" // Container is starting up
  | "running" // Container is healthy and running
  | "stopping" // Container is shutting down
  | "stopped" // Container has stopped
  | "failed"; // Container failed to start or crashed

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  message?: string;
}

/**
 * Container orchestrator interface
 * Implement this for each platform (Local, Kubernetes, ECS)
 */
export interface ContainerOrchestrator {
  /**
   * Initialize the orchestrator (connect to API, validate config)
   */
  initialize(): Promise<void>;

  /**
   * Spawn a new app container
   */
  spawnContainer(config: SpawnContainerConfig): Promise<ContainerInfo>;

  /**
   * Stop and remove a container
   */
  stopContainer(containerId: string): Promise<void>;

  /**
   * Get information about a running container
   */
  getContainer(appId: number): Promise<ContainerInfo | null>;

  /**
   * Check if a container is healthy
   */
  healthCheck(containerId: string): Promise<HealthCheckResult>;

  /**
   * List all running app containers
   */
  listContainers(): Promise<ContainerInfo[]>;

  /**
   * Clean up idle containers (based on lastActivityAt)
   */
  cleanupIdleContainers(maxIdleMs: number): Promise<number>;

  /**
   * Copy a file from the host filesystem into a running container
   * Used for workflow file uploads (Excel, images) that need to be in the container workspace
   */
  copyFileToContainer(appId: number, localPath: string, containerPath: string): Promise<void>;

  /**
   * Read a file from a running container's filesystem
   * Returns the file content as a string
   */
  readFileFromContainer(appId: number, containerPath: string): Promise<string>;

  /**
   * Delete persistent storage for an app (PVC/volume)
   * Called when an app is permanently deleted
   */
  deletePersistentStorage(appId: number): Promise<void>;

  /**
   * Shutdown the orchestrator (cleanup resources)
   */
  shutdown(): Promise<void>;
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Container image for app containers */
  containerImage: string;
  /** Network name for container communication */
  networkName: string;
  /** Base domain for preview URLs */
  previewDomain: string;
  /** Preview proxy port */
  previewPort: number;
  /** Internal agent port (inside container) */
  agentPort: number;
  /** Internal dev server port (inside container) */
  devServerPort: number;
  /** Idle timeout in milliseconds */
  idleTimeoutMs: number;
}
