/**
 * Kubectl Orchestrator
 * Shells out to kubectl for manifest-based K8s operations
 * Stable, declarative, production-ready approach
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ContainerInfo,
  ContainerOrchestrator,
  ContainerState,
  HealthCheckResult,
  OrchestratorConfig,
  SpawnContainerConfig,
} from "./types.js";

const execFileAsync = promisify(execFile);

/** Kubernetes mounts this file inside every pod */
const IN_CLUSTER_TOKEN_PATH =
  "/var/run/secrets/kubernetes.io/serviceaccount/token";

interface KubectlOrchestratorOptions extends OrchestratorConfig {
  /** Kubectl context to use (undefined ONLY for in-cluster config) */
  context?: string;
  /** Namespace for user app pods */
  namespace: string;
  /** Whether this is an EKS cluster (affects networking mode) */
  isEKS: boolean;
  /** StorageClass for PVCs (e.g. "local-path" for k3d, "ebs-sc" for EKS) */
  storageClass: string;
}

export class KubectlOrchestrator implements ContainerOrchestrator {
  private options: KubectlOrchestratorOptions;
  private containerCache = new Map<number, ContainerInfo>();

  constructor(options: KubectlOrchestratorOptions) {
    // SAFETY: When running outside a Kubernetes pod, a context MUST be
    // provided. Without it, kubectl falls back to the developer's ambient
    // kubeconfig current-context, which could be a production cluster.
    // In-cluster (detected by the service account token mount), kubectl
    // uses the pod's identity automatically and no context is needed.
    if (!options.context && !existsSync(IN_CLUSTER_TOKEN_PATH)) {
      throw new Error(
        "[KubectlOrchestrator] SAFETY: No kubectl context provided and not running in-cluster. " +
          "Set K8S_CONTEXT in .env to prevent accidentally using the ambient kubeconfig context. " +
          "Refusing to start.",
      );
    }

    this.options = options;
    console.log(
      `[KubectlOrchestrator] Networking mode: ${options.isEKS ? "EKS (ClusterIP + standard ports)" : "Local (hostNetwork + unique ports)"}`
    );
  }

  async initialize(): Promise<void> {
    const contextInfo = this.options.context
      ? `context: ${this.options.context}`
      : "current kubectl context";
    console.log(
      `[KubectlOrchestrator] Initializing with ${contextInfo}, namespace: ${this.options.namespace}`
    );

    // Verify kubectl is available
    try {
      const version = await this.kubectl("version", "--client");
      console.log(`[KubectlOrchestrator] kubectl available`);
    } catch (error: any) {
      throw new Error(`kubectl not found or not executable: ${error.message}`);
    }

    // Verify cluster connectivity
    try {
      await this.kubectl("cluster-info");
      console.log(`[KubectlOrchestrator] Connected to cluster successfully`);
    } catch (error: any) {
      throw new Error(
        `Failed to connect to cluster: ${error.message}\nEnsure KUBECONFIG is set and context is valid`
      );
    }

    // Verify namespace exists
    try {
      await this.kubectl("get", "namespace", this.options.namespace);
      console.log(
        `[KubectlOrchestrator] Namespace '${this.options.namespace}' verified`
      );
    } catch (error) {
      throw new Error(
        `Namespace '${this.options.namespace}' does not exist. Run: kubectl create namespace ${this.options.namespace}`
      );
    }
  }

  async spawnContainer(config: SpawnContainerConfig): Promise<ContainerInfo> {
    const containerName = `app-${config.appId}`;
    const deploymentName = containerName;
    const labels = {
      app: "kova-app",
      "kova.app-id": config.appId.toString(),
      "kova.user-id": config.userId.toString(),
    };

    console.log(
      `[KubectlOrchestrator] Starting container for ${containerName} in namespace: ${this.options.namespace}`
    );

    // Check if deployment already exists
    const deploymentExists = await this.deploymentExists(deploymentName);

    if (deploymentExists) {
      console.log(
        `[KubectlOrchestrator] Deployment ${deploymentName} exists, ensuring config is up to date...`
      );
      // Apply deployment manifest to ensure configuration is current (declarative update)
      // This handles any changes to env vars, resources, volumes, etc.
      await this.updateDeploymentResources(config, deploymentName, labels);
      // Scale to 1 if currently at 0
      await this.scaleDeployment(deploymentName, 1);
    } else {
      console.log(
        `[KubectlOrchestrator] Creating new deployment ${deploymentName}...`
      );
      await this.createDeploymentResources(config, deploymentName, labels);
    }

    // Wait for rollout to complete (handles rolling updates correctly —
    // kubectl wait pod can match terminating pods and time out spuriously)
    const readyTimeoutSec = this.options.isEKS ? 180 : 60;
    console.log(
      `[KubectlOrchestrator] Waiting for rollout to complete (timeout: ${readyTimeoutSec}s)...`
    );
    await this.kubectl(
      "rollout",
      "status",
      `deployment/${deploymentName}`,
      "-n",
      this.options.namespace,
      `--timeout=${readyTimeoutSec}s`
    );

    // Build URLs — route through Istio Gateway for both local and EKS
    const hostname = `${containerName}.${this.options.previewDomain}`;
    const isHttps = this.options.previewPort === 443 || this.options.previewPort === 8443;
    const protocol = isHttps ? "https" : "http";
    const portSuffix = (this.options.previewPort === 443 || this.options.previewPort === 80)
      ? ""
      : `:${this.options.previewPort}`;
    const baseUrl = `${protocol}://${hostname}${portSuffix}`;

    const agentUrl = `${baseUrl}/agent`;
    const previewUrl = baseUrl;

    console.log(`[KubectlOrchestrator] Agent URL: ${agentUrl}`);
    console.log(`[KubectlOrchestrator] Preview URL: ${previewUrl}`);

    // Build container info
    const containerInfo: ContainerInfo = {
      containerId: `${this.options.namespace}/${deploymentName}`,
      containerName: deploymentName,
      agentUrl,
      previewUrl,
      state: "running",
      lastActivityAt: Date.now(),
    };

    // Cache container info
    this.containerCache.set(config.appId, containerInfo);

    console.log(
      `[KubectlOrchestrator] Container ready: ${containerName}`
    );

    return containerInfo;
  }

  /**
   * Build deployment manifest (shared between create and update)
   */
  private buildDeploymentManifest(
    config: SpawnContainerConfig,
    deploymentName: string,
    labels: Record<string, string>,
    replicas: number = 1
  ) {
    // Read unique ports from env config (calculated in app-container.service.ts)
    const agentPort = parseInt(config.env.AGENT_PORT || "3100");
    const devPort = parseInt(config.env.DEV_SERVER_PORT || "3000");

    return {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: {
        name: deploymentName,
        namespace: this.options.namespace,
        labels,
      },
      spec: {
        replicas: replicas,
        strategy: this.options.isEKS
          ? {
              // EKS: RollingUpdate for zero-downtime deployments
              type: "RollingUpdate",
              rollingUpdate: {
                maxSurge: 1,
                maxUnavailable: 0,
              },
            }
          : {
              // Local: Recreate to avoid hostNetwork port conflicts
              type: "Recreate",
            },
        selector: {
          matchLabels: labels,
        },
        template: {
          metadata: {
            labels,
          },
          spec: {
            // Use host network to bypass corporate VPN transparent proxy (local k3d only)
            // EKS has proper networking, no need for hostNetwork
            ...(this.options.isEKS ? {} : { hostNetwork: true }),
            restartPolicy: "Always",
            containers: [
              {
                name: "app",
                image: config.image,
                imagePullPolicy: "IfNotPresent",
                ports: [
                  {
                    name: "agent",
                    containerPort: agentPort, // Unique port per app
                    protocol: "TCP",
                  },
                  {
                    name: "dev",
                    containerPort: devPort, // Unique port per app
                    protocol: "TCP",
                  },
                ],
                env: Object.entries(config.env).map(([name, value]) => ({
                  name,
                  value,
                })),
                volumeMounts: [
                  {
                    name: "workspace",
                    mountPath: "/workspace",
                  },
                ],
                // workingDir defaults to Dockerfile's WORKDIR (/app)
                // Do NOT override to /workspace or it can't find the container code
                resources: {
                  requests: {
                    memory: "4Gi",
                    cpu: "1",
                  },
                  limits: {
                    memory: "4Gi",
                    cpu: "1",
                  },
                },
              },
            ],
            volumes: [
              {
                name: "workspace",
                persistentVolumeClaim: {
                  claimName: `${deploymentName}-workspace`,
                },
              },
            ],
          },
        },
      },
    };
  }

  /**
   * Create all Kubernetes resources for a new app deployment
   */
  private async createDeploymentResources(
    config: SpawnContainerConfig,
    deploymentName: string,
    labels: Record<string, string>
  ): Promise<void> {
    // Build deployment manifest
    const deploymentManifest = this.buildDeploymentManifest(
      config,
      deploymentName,
      labels,
      1
    );

    // Create PVC for persistent storage
    const pvcManifest = {
      apiVersion: "v1",
      kind: "PersistentVolumeClaim",
      metadata: {
        name: `${deploymentName}-workspace`,
        namespace: this.options.namespace,
        labels,
      },
      spec: {
        accessModes: ["ReadWriteOnce"],
        storageClassName: this.options.storageClass,
        resources: {
          requests: {
            storage: "5Gi",
          },
        },
      },
    };

    console.log(
      `[KubectlOrchestrator] Creating PVC for ${deploymentName}...`
    );
    await this.kubectlApply(pvcManifest);

    // Apply deployment manifest
    console.log(
      `[KubectlOrchestrator] Creating deployment ${deploymentName}...`
    );
    await this.kubectlApply(deploymentManifest);

    // Create service for app access
    // - EKS: ClusterIP service with standard ports
    // - Local: NodePort service with unique ports (for hostNetwork)
    const agentPort = parseInt(config.env.AGENT_PORT || "3100");
    const devPort = parseInt(config.env.DEV_SERVER_PORT || "3000");

    const serviceManifest = {
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name: deploymentName,
        namespace: this.options.namespace,
        labels,
      },
      spec: {
        selector: labels,
        ports: this.options.isEKS
          ? [
              // EKS: ClusterIP with standard ports
              {
                name: "agent",
                port: agentPort,
                targetPort: agentPort,
                protocol: "TCP",
              },
              {
                name: "dev",
                port: devPort,
                targetPort: devPort,
                protocol: "TCP",
              },
            ]
          : [
              // Local: NodePort with unique ports
              {
                name: "agent",
                port: agentPort,
                targetPort: agentPort,
                nodePort: agentPort,
                protocol: "TCP",
              },
              {
                name: "dev",
                port: devPort,
                targetPort: devPort,
                nodePort: devPort,
                protocol: "TCP",
              },
            ],
        type: this.options.isEKS ? "ClusterIP" : "NodePort",
      },
    };

    console.log(
      `[KubectlOrchestrator] Creating service ${deploymentName}...`
    );
    await this.kubectlApply(serviceManifest);

    // Create VirtualService for Istio routing
    // Routes both agent API and preview to the same hostname:
    //   - /agent/* → agent port (3100)
    //   - /*      → dev server port (3000)
    // Hostname: app-{id}.{previewDomain} (same pattern for local and EKS)
    const virtualServiceManifest = {
      apiVersion: "networking.istio.io/v1",
      kind: "VirtualService",
      metadata: {
        name: deploymentName,
        namespace: this.options.namespace,
        labels,
      },
      spec: {
        hosts: [`${deploymentName}.${this.options.previewDomain}`],
        gateways: ["istio-system/kova-gateway"],
        http: [
          // Agent API route (must come first - more specific)
          // Match /agent or /agent/* and strip the /agent prefix
          {
            match: [{ uri: { prefix: "/agent/" } }],
            rewrite: {
              uri: "/",
            },
            route: [
              {
                destination: {
                  host: deploymentName,
                  port: { number: agentPort },
                },
              },
            ],
          },
          // Preview route (catches everything else)
          {
            match: [{ uri: { prefix: "/" } }],
            route: [
              {
                destination: {
                  host: deploymentName,
                  port: { number: devPort },
                },
              },
            ],
          },
        ],
      },
    };

    console.log(
      `[KubectlOrchestrator] Creating VirtualService ${deploymentName}...`
    );
    await this.kubectlApply(virtualServiceManifest);

    console.log(
      `[KubectlOrchestrator] All resources created for ${deploymentName}`
    );
  }

  /**
   * Update deployment configuration (declarative update without changing replicas)
   */
  private async updateDeploymentResources(
    config: SpawnContainerConfig,
    deploymentName: string,
    labels: Record<string, string>
  ): Promise<void> {
    // Get current replica count so we don't change it during update
    let currentReplicas = 0;
    try {
      const output = await this.kubectl(
        "get",
        "deployment",
        deploymentName,
        "-n",
        this.options.namespace,
        "-o",
        "jsonpath={.spec.replicas}"
      );
      currentReplicas = parseInt(output.trim()) || 0;
    } catch (error) {
      console.warn(
        `[KubectlOrchestrator] Failed to get current replicas, defaulting to 0`
      );
    }

    // Build deployment manifest with current replica count
    const deploymentManifest = this.buildDeploymentManifest(
      config,
      deploymentName,
      labels,
      currentReplicas
    );

    console.log(
      `[KubectlOrchestrator] Updating deployment ${deploymentName} (replicas: ${currentReplicas})...`
    );
    await this.kubectlApply(deploymentManifest);

    console.log(
      `[KubectlOrchestrator] Deployment ${deploymentName} updated`
    );
  }

  /**
   * Check if a deployment exists
   */
  private async deploymentExists(deploymentName: string): Promise<boolean> {
    try {
      await this.kubectl(
        "get",
        "deployment",
        deploymentName,
        "-n",
        this.options.namespace
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Scale a deployment to specified replica count
   */
  private async scaleDeployment(
    deploymentName: string,
    replicas: number
  ): Promise<void> {
    await this.kubectl(
      "scale",
      "deployment",
      deploymentName,
      "-n",
      this.options.namespace,
      `--replicas=${replicas}`
    );
    console.log(
      `[KubectlOrchestrator] Scaled ${deploymentName} to ${replicas} replicas`
    );
  }

  /**
   * Get pod IP for an app
   */
  private async getPodIp(appId: number): Promise<string | null> {
    try {
      const podIp = (
        await this.kubectl(
          "get",
          "pod",
          "-l",
          `kova.app-id=${appId}`,
          "-n",
          this.options.namespace,
          "-o",
          "jsonpath={.items[0].status.podIP}"
        )
      ).trim();
      return podIp || null;
    } catch (error) {
      return null;
    }
  }

  async stopContainer(containerId: string): Promise<void> {
    const [namespace, deploymentName] = containerId.split("/");

    console.log(`[KubectlOrchestrator] Stopping deployment: ${deploymentName}`);

    try {
      // Scale deployment to 0 replicas (instead of deleting)
      await this.scaleDeployment(deploymentName, 0);

      // Remove from cache
      const appId = Number.parseInt(deploymentName.replace("app-", ""));
      if (!Number.isNaN(appId)) {
        this.containerCache.delete(appId);
      }

      console.log(`[KubectlOrchestrator] Deployment scaled down: ${deploymentName}`);
    } catch (error: any) {
      // If deployment doesn't exist, that's fine (idempotent)
      if (error.message.includes("NotFound")) {
        console.log(
          `[KubectlOrchestrator] Deployment already deleted: ${deploymentName}`
        );
        return;
      }
      throw error;
    }
  }

  async getContainer(appId: number): Promise<ContainerInfo | null> {
    // Check cache first
    if (this.containerCache.has(appId)) {
      return this.containerCache.get(appId)!;
    }

    const podName = `app-${appId}`;

    try {
      // Get pod status
      const output = await this.kubectl(
        "get",
        "pod",
        podName,
        "-n",
        this.options.namespace,
        "-o",
        "json"
      );

      const pod = JSON.parse(output);
      const state = this.mapPodState(pod);

      // Get pod IP for direct access (needed because hostNetwork breaks Service routing)
      const podIp = pod.status?.podIP;
      if (!podIp) {
        console.warn(`[KubectlOrchestrator] No pod IP found for ${podName}`);
        return null;
      }

      // Get unique ports from pod env vars
      const container = pod.spec?.containers?.[0];
      const envVars = container?.env || [];
      const agentPortEnv = envVars.find((e: any) => e.name === "AGENT_PORT");
      const agentPort = agentPortEnv?.value ? parseInt(agentPortEnv.value) : this.options.agentPort;

      const previewHostname = `kova-${podName}.${this.options.previewDomain}`;
      const containerInfo: ContainerInfo = {
        containerId: `${this.options.namespace}/${podName}`,
        containerName: podName,
        agentUrl: `http://${podIp}:${agentPort}`,
        previewUrl: `https://${previewHostname}:${this.options.previewPort}`,
        state,
        lastActivityAt: Date.now(),
      };

      this.containerCache.set(appId, containerInfo);
      return containerInfo;
    } catch (error: any) {
      // Pod doesn't exist
      if (error.message.includes("NotFound")) {
        return null;
      }
      throw error;
    }
  }

  async healthCheck(containerId: string): Promise<HealthCheckResult> {
    const [namespace, podName] = containerId.split("/");

    try {
      const output = await this.kubectl(
        "get",
        "pod",
        podName,
        "-n",
        namespace || this.options.namespace,
        "-o",
        "jsonpath={.status.phase},{.status.containerStatuses[0].ready}"
      );

      const [phase, ready] = output.split(",");

      if (phase === "Running" && ready === "true") {
        return { healthy: true };
      }

      return {
        healthy: false,
        message: `Pod phase: ${phase}, ready: ${ready}`,
      };
    } catch (error: any) {
      return { healthy: false, message: error.message };
    }
  }

  async listContainers(): Promise<ContainerInfo[]> {
    try {
      const output = await this.kubectl(
        "get",
        "pods",
        "-n",
        this.options.namespace,
        "-l",
        "app=kova-app",
        "-o",
        "json"
      );

      const podList = JSON.parse(output);
      const containers: ContainerInfo[] = podList.items
        .map((pod: any): ContainerInfo | null => {
          const podName = pod.metadata.name;
          const appId = Number.parseInt(podName.replace("app-", ""));

          // Get pod IP for direct access (needed because hostNetwork breaks Service routing)
          const podIp = pod.status?.podIP;
          if (!podIp) {
            console.warn(`[KubectlOrchestrator] No pod IP found for ${podName}, skipping`);
            return null;
          }

          // Get unique ports from pod env vars
          const container = pod.spec?.containers?.[0];
          const envVars = container?.env || [];
          const agentPortEnv = envVars.find((e: any) => e.name === "AGENT_PORT");
          const agentPort = agentPortEnv?.value ? parseInt(agentPortEnv.value) : this.options.agentPort;

          const previewHostname = `kova-${podName}.${this.options.previewDomain}`;
          return {
            containerId: `${this.options.namespace}/${podName}`,
            containerName: podName,
            agentUrl: `http://${podIp}:${agentPort}`,
            previewUrl: `https://${previewHostname}:${this.options.previewPort}`,
            state: this.mapPodState(pod),
            lastActivityAt: Date.now(),
          };
        })
        .filter((container: ContainerInfo | null): container is ContainerInfo => container !== null);

      // Update cache
      for (const container of containers) {
        const appId = Number.parseInt(
          container.containerName.replace("app-", "")
        );
        if (!Number.isNaN(appId)) {
          this.containerCache.set(appId, container);
        }
      }

      return containers;
    } catch (error) {
      console.error("[KubectlOrchestrator] Failed to list pods:", error);
      return [];
    }
  }

  async cleanupIdleContainers(maxIdleMs: number): Promise<number> {
    console.log(
      `[KubectlOrchestrator] Cleaning up idle containers (max idle: ${maxIdleMs}ms)`
    );

    const containers = await this.listContainers();
    const now = Date.now();
    let cleanedCount = 0;

    for (const container of containers) {
      const idleTime = now - container.lastActivityAt;
      if (idleTime > maxIdleMs) {
        console.log(
          `[KubectlOrchestrator] Cleaning up idle container: ${container.containerName} (idle for ${idleTime}ms)`
        );
        await this.stopContainer(container.containerId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  async deletePersistentStorage(appId: number): Promise<void> {
    const deploymentName = `app-${appId}`;
    const pvcName = `${deploymentName}-workspace`;

    console.log(
      `[KubectlOrchestrator] Permanently deleting app resources for app ${appId}`
    );

    try {
      // Delete deployment
      console.log(`[KubectlOrchestrator] Deleting deployment: ${deploymentName}`);
      await this.kubectl(
        "delete",
        "deployment",
        deploymentName,
        "-n",
        this.options.namespace,
        "--ignore-not-found=true"
      );

      // Delete service
      console.log(`[KubectlOrchestrator] Deleting service: ${deploymentName}`);
      await this.kubectl(
        "delete",
        "service",
        deploymentName,
        "-n",
        this.options.namespace,
        "--ignore-not-found=true"
      );

      // Delete VirtualService
      console.log(`[KubectlOrchestrator] Deleting VirtualService: ${deploymentName}`);
      await this.kubectl(
        "delete",
        "virtualservice",
        deploymentName,
        "-n",
        this.options.namespace,
        "--ignore-not-found=true"
      );

      // Delete PVC
      console.log(`[KubectlOrchestrator] Deleting PVC: ${pvcName}`);
      await this.kubectl(
        "delete",
        "pvc",
        pvcName,
        "-n",
        this.options.namespace,
        "--ignore-not-found=true"
      );

      console.log(`[KubectlOrchestrator] All resources deleted for app ${appId}`);
    } catch (error) {
      console.error(
        `[KubectlOrchestrator] Failed to delete resources for app ${appId}:`,
        error
      );
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    console.log("[KubectlOrchestrator] Shutting down...");
    this.containerCache.clear();
  }

  // Helper methods

  /**
   * Execute kubectl command
   */
  private async kubectl(...args: string[]): Promise<string> {
    // Build args: add --context only if specified (omit for in-cluster config)
    const kubectlArgs = this.options.context
      ? ["--context", this.options.context, ...args]
      : args;

    const { stdout, stderr } = await execFileAsync("kubectl", kubectlArgs);

    // kubectl often writes warnings to stderr even on success
    if (stderr && !stderr.toLowerCase().includes("warning")) {
      console.warn("[kubectl stderr]", stderr);
    }

    return stdout;
  }

  /**
   * Apply manifest declaratively (handles create/update)
   * Uses temp file instead of stdin to avoid kubectl hanging issues
   */
  private async kubectlApply(manifest: any): Promise<void> {
    const jsonStr = JSON.stringify(manifest, null, 2);
    const tempFile = join(tmpdir(), `kubectl-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

    try {
      // Write manifest to temp file
      await writeFile(tempFile, jsonStr, "utf-8");

      // Apply from file — routes through kubectl() which handles --context
      const stdout = await this.kubectl("apply", "-f", tempFile);
      console.log(`[kubectl apply] ${stdout.trim()}`);
    } catch (error: any) {
      console.error(`[kubectl apply] Failed:`, error.message);
      if (error.stderr) {
        console.error(`[kubectl apply stderr] ${error.stderr}`);
      }
      throw error;
    } finally {
      // Clean up temp file
      try {
        await unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Wait for resource condition
   */
  private async kubectlWait(
    resource: string,
    condition: string,
    timeout: string
  ): Promise<void> {
    await this.kubectl(
      "wait",
      resource,
      condition,
      "--timeout",
      timeout,
      "-n",
      this.options.namespace
    );
  }

  /**
   * Map K8s pod phase to ContainerState
   */
  private mapPodState(pod: any): ContainerState {
    const phase = pod.status?.phase;

    if (phase === "Pending") return "starting";
    if (phase === "Running") {
      const containerStatus = pod.status?.containerStatuses?.[0];
      if (containerStatus?.ready) return "running";
      return "starting";
    }
    if (phase === "Succeeded") return "stopped";
    if (phase === "Failed") return "failed";
    if (phase === "Unknown") return "failed";

    return "pending";
  }
}
