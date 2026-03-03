/**
 * Helm Orchestrator
 *
 * Multi-tenant orchestrator that uses Helm to manage per-app K8s resources.
 * Each app gets its own Helm release containing: Deployment, Service, VirtualService, PVC.
 *
 * Resource naming: {instanceId}-{shortId} (e.g., "dev-a1b2c3d4")
 * Preview URLs: app-{shortId}.{domain} (prefixed mode) or {slug}.{domain} (slug mode)
 */

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream, existsSync } from "node:fs";
import type {
  ContainerInfo,
  ContainerOrchestrator,
  ContainerState,
  HealthCheckResult,
  OrchestratorConfig,
  SpawnContainerConfig,
} from "./types.js";
import {
  shortId,
  k8sResourceName,
  appHostname,
} from "../../utils/app-identifiers.js";

const execFileAsync = promisify(execFile);

const IN_CLUSTER_TOKEN_PATH =
  "/var/run/secrets/kubernetes.io/serviceaccount/token";

interface HelmOrchestratorOptions extends OrchestratorConfig {
  context?: string;
  namespace: string;
  isEKS: boolean;
  storageClass: string;
  instanceId: string;
  previewUrlMode: "prefixed" | "slug";
  chartPath: string;
}

export class HelmOrchestrator implements ContainerOrchestrator {
  private options: HelmOrchestratorOptions;
  private containerCache = new Map<number, ContainerInfo>();

  constructor(options: HelmOrchestratorOptions) {
    if (
      !options.context &&
      !existsSync(IN_CLUSTER_TOKEN_PATH) &&
      !process.env.KUBECONFIG
    ) {
      throw new Error(
        "[HelmOrchestrator] SAFETY: No kubectl context provided and not running in-cluster. " +
          "Set K8S_CONTEXT in .env to prevent accidentally using the ambient kubeconfig context.",
      );
    }

    this.options = options;
    console.log(
      `[HelmOrchestrator] Instance: ${options.instanceId}, URL mode: ${options.previewUrlMode}`,
    );
    console.log(
      `[HelmOrchestrator] Networking: ${options.isEKS ? "EKS (ClusterIP)" : "Local (hostNetwork)"}`,
    );
  }

  async initialize(): Promise<void> {
    const contextInfo = this.options.context
      ? `context: ${this.options.context}`
      : "current kubectl context";
    console.log(
      `[HelmOrchestrator] Initializing with ${contextInfo}, namespace: ${this.options.namespace}`,
    );

    // Verify helm is available
    try {
      await execFileAsync("helm", ["version", "--short"]);
      console.log(`[HelmOrchestrator] helm available`);
    } catch (error: any) {
      throw new Error(`helm not found or not executable: ${error.message}`);
    }

    // Verify kubectl is available (still needed for scale, exec, etc.)
    try {
      await this.kubectl("version", "--client");
      console.log(`[HelmOrchestrator] kubectl available`);
    } catch (error: any) {
      throw new Error(`kubectl not found or not executable: ${error.message}`);
    }

    // Verify cluster connectivity
    try {
      await this.kubectl("cluster-info");
      console.log(`[HelmOrchestrator] Connected to cluster`);
    } catch (error: any) {
      throw new Error(`Failed to connect to cluster: ${error.message}`);
    }

    // Verify namespace exists
    try {
      await this.kubectl("get", "namespace", this.options.namespace);
      console.log(
        `[HelmOrchestrator] Namespace '${this.options.namespace}' verified`,
      );
    } catch {
      throw new Error(
        `Namespace '${this.options.namespace}' does not exist.`,
      );
    }
  }

  async spawnContainer(config: SpawnContainerConfig): Promise<ContainerInfo> {
    const sid = shortId(config.appGuid);
    const releaseName = k8sResourceName(this.options.instanceId, config.appGuid);
    const previewHost = this.buildPreviewHostname(sid, config.appSlug);

    console.log(
      `[HelmOrchestrator] Spawning ${releaseName} (appId=${config.appId}, shortId=${sid})`,
    );

    // helm upgrade --install handles both create and upgrade idempotently

    // Build helm values
    const agentPort = parseInt(config.env.AGENT_PORT || "3100");
    const devPort = parseInt(config.env.DEV_SERVER_PORT || "3000");

    // Split image into repository:tag
    const imageColonIdx = config.image.lastIndexOf(":");
    const imageRepo =
      imageColonIdx > 0 ? config.image.substring(0, imageColonIdx) : config.image;
    const imageTag =
      imageColonIdx > 0 ? config.image.substring(imageColonIdx + 1) : "latest";

    const values: Record<string, string> = {
      instanceId: this.options.instanceId,
      appShortId: sid,
      appGuid: config.appGuid,
      appId: config.appId.toString(),
      appSlug: config.appSlug || "",
      userId: config.userId.toString(),
      "image.repository": imageRepo,
      "image.tag": imageTag,
      "image.pullPolicy": "IfNotPresent",
      "ports.agent": agentPort.toString(),
      "ports.dev": devPort.toString(),
      "storage.size": "5Gi",
      "storage.storageClass": this.options.storageClass,
      "networking.hostNetwork": (!this.options.isEKS).toString(),
      "networking.previewDomain": this.options.previewDomain,
      "networking.gatewayName": "istio-system/kova-gateway",
      previewHostname: previewHost,
    };

    // Flatten env map into helm --set values
    for (const [key, value] of Object.entries(config.env)) {
      values[`env.${key}`] = value;
    }

    await this.helmUpgradeInstall(releaseName, values);

    // Wait for rollout
    const readyTimeoutSec = this.options.isEKS ? 180 : 60;
    console.log(
      `[HelmOrchestrator] Waiting for rollout (timeout: ${readyTimeoutSec}s)...`,
    );
    await this.kubectl(
      "rollout",
      "status",
      `deployment/${releaseName}`,
      "-n",
      this.options.namespace,
      `--timeout=${readyTimeoutSec}s`,
    );

    const { agentUrl, previewUrl } = this.buildContainerUrls(previewHost);

    const containerInfo: ContainerInfo = {
      containerId: `${this.options.namespace}/${releaseName}`,
      containerName: releaseName,
      agentUrl,
      previewUrl,
      state: "running",
      lastActivityAt: Date.now(),
      appId: config.appId,
    };

    this.containerCache.set(config.appId, containerInfo);
    console.log(`[HelmOrchestrator] Container ready: ${releaseName}`);

    return containerInfo;
  }

  async stopContainer(containerId: string): Promise<void> {
    const [_namespace, deploymentName] = containerId.split("/");
    console.log(
      `[HelmOrchestrator] Scaling down deployment: ${deploymentName}`,
    );

    try {
      await this.kubectl(
        "scale",
        "deployment",
        deploymentName,
        "-n",
        this.options.namespace,
        "--replicas=0",
      );

      // Remove from cache
      for (const [appId, info] of this.containerCache.entries()) {
        if (info.containerName === deploymentName) {
          this.containerCache.delete(appId);
          break;
        }
      }

      console.log(
        `[HelmOrchestrator] Deployment scaled down: ${deploymentName}`,
      );
    } catch (error: any) {
      if (error.message?.includes("NotFound")) {
        console.log(
          `[HelmOrchestrator] Deployment already gone: ${deploymentName}`,
        );
        return;
      }
      throw error;
    }
  }

  async getContainer(appId: number): Promise<ContainerInfo | null> {
    if (this.containerCache.has(appId)) {
      return this.containerCache.get(appId)!;
    }

    try {
      // Query pods by app-id label
      const output = await this.kubectl(
        "get",
        "pods",
        "-l",
        `kova.dev/app-id=${appId}`,
        "-n",
        this.options.namespace,
        "-o",
        "json",
      );

      const podList = JSON.parse(output);
      if (!podList.items || podList.items.length === 0) {
        return null;
      }

      const pod = podList.items[0];
      const labels = pod.metadata?.labels || {};
      const instanceLabel = labels["kova.dev/instance"] || "";
      const guidLabel = labels["kova.dev/app-guid"] || "";
      const slugLabel = labels["kova.dev/app-slug"] || "";
      const sid = guidLabel ? shortId(guidLabel) : "";

      // Derive deployment name from labels
      const deploymentName =
        instanceLabel && sid ? `${instanceLabel}-${sid}` : "";
      if (!deploymentName) return null;

      const previewHost = this.buildPreviewHostname(sid, slugLabel || undefined);
      const { agentUrl, previewUrl } = this.buildContainerUrls(previewHost);

      const containerInfo: ContainerInfo = {
        containerId: `${this.options.namespace}/${deploymentName}`,
        containerName: deploymentName,
        agentUrl,
        previewUrl,
        state: this.mapPodState(pod),
        lastActivityAt: Date.now(),
      };

      this.containerCache.set(appId, containerInfo);
      return containerInfo;
    } catch (error: any) {
      if (error.message?.includes("NotFound")) return null;
      throw error;
    }
  }

  async healthCheck(containerId: string): Promise<HealthCheckResult> {
    const [namespace, deploymentName] = containerId.split("/");
    const ns = namespace || this.options.namespace;

    try {
      // Query pods directly using the deployment name as the instance label.
      // This avoids an extra kubectl call to fetch the guid from the deployment.
      const podOutput = await this.kubectl(
        "get",
        "pods",
        "-l",
        `app.kubernetes.io/instance=${deploymentName}`,
        "-n",
        ns,
        "-o",
        "jsonpath={.items[0].status.phase},{.items[0].status.containerStatuses[0].ready}",
      );

      const [phase, ready] = podOutput.split(",");
      if (phase === "Running" && ready === "true") {
        return { healthy: true };
      }
      return { healthy: false, message: `Pod phase: ${phase}, ready: ${ready}` };
    } catch (error: any) {
      return { healthy: false, message: error.message };
    }
  }

  async listContainers(): Promise<ContainerInfo[]> {
    try {
      // List pods managed by this Kova instance
      const output = await this.kubectl(
        "get",
        "pods",
        "-n",
        this.options.namespace,
        "-l",
        `app=kova-app,kova.dev/instance=${this.options.instanceId}`,
        "-o",
        "json",
      );

      const podList = JSON.parse(output);
      const containers: ContainerInfo[] = [];

      for (const pod of podList.items || []) {
        const labels = pod.metadata?.labels || {};
        const instanceLabel = labels["kova.dev/instance"] || "";
        const guidLabel = labels["kova.dev/app-guid"] || "";
        const appIdLabel = labels["kova.dev/app-id"] || "";
        const slugLabel = labels["kova.dev/app-slug"] || "";
        const sid = guidLabel ? shortId(guidLabel) : "";

        if (!instanceLabel || !sid) continue;

        const deploymentName = `${instanceLabel}-${sid}`;
        const previewHost = this.buildPreviewHostname(sid, slugLabel || undefined);
        const { agentUrl, previewUrl } = this.buildContainerUrls(previewHost);

        const appId = parseInt(appIdLabel, 10);
        const containerInfo: ContainerInfo = {
          containerId: `${this.options.namespace}/${deploymentName}`,
          containerName: deploymentName,
          agentUrl,
          previewUrl,
          state: this.mapPodState(pod),
          lastActivityAt: Date.now(),
          appId: !isNaN(appId) ? appId : undefined,
        };

        containers.push(containerInfo);

        // Update cache
        if (!isNaN(appId)) {
          this.containerCache.set(appId, containerInfo);
        }
      }

      return containers;
    } catch (error) {
      console.error("[HelmOrchestrator] Failed to list pods:", error);
      return [];
    }
  }

  async cleanupIdleContainers(maxIdleMs: number): Promise<number> {
    const containers = await this.listContainers();
    const now = Date.now();
    let cleanedCount = 0;

    for (const container of containers) {
      const idleTime = now - container.lastActivityAt;
      if (idleTime > maxIdleMs) {
        console.log(
          `[HelmOrchestrator] Cleaning up idle: ${container.containerName} (idle ${idleTime}ms)`,
        );
        await this.stopContainer(container.containerId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  async copyFileToContainer(
    appId: number,
    localPath: string,
    containerPath: string,
  ): Promise<void> {
    const podName = await this.getPodNameForApp(appId);

    console.log(
      `[HelmOrchestrator] Copying ${localPath} -> ${podName}:${containerPath}`,
    );

    const kubectlArgs = [
      ...(this.options.context ? ["--context", this.options.context] : []),
      "exec",
      "-i",
      podName,
      "-n",
      this.options.namespace,
      "--",
      "sh",
      "-c",
      `cat > '${containerPath}'`,
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn("kubectl", kubectlArgs, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (err) => reject(err));
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`kubectl exec failed (code ${code}): ${stderr}`));
        } else {
          resolve();
        }
      });

      const fileStream = createReadStream(localPath);
      fileStream.on("error", (err) => reject(err));
      fileStream.pipe(child.stdin);
    });
  }

  async readFileFromContainer(
    appId: number,
    containerPath: string,
  ): Promise<string> {
    const podName = await this.getPodNameForApp(appId);
    return this.kubectl(
      "exec",
      podName,
      "-n",
      this.options.namespace,
      "--",
      "cat",
      containerPath,
    );
  }

  async deletePersistentStorage(appId: number): Promise<void> {
    // Find the helm release name from the pod labels
    const releaseName = await this.getReleaseNameForApp(appId);

    if (releaseName) {
      console.log(
        `[HelmOrchestrator] Uninstalling release ${releaseName} for app ${appId}`,
      );
      try {
        await this.helmUninstall(releaseName);
        console.log(`[HelmOrchestrator] Release ${releaseName} uninstalled`);
      } catch (error) {
        console.error(
          `[HelmOrchestrator] Failed to uninstall release ${releaseName}:`,
          error,
        );
        throw error;
      }
    } else {
      console.warn(
        `[HelmOrchestrator] No release found for app ${appId}, skipping`,
      );
    }
  }

  async shutdown(): Promise<void> {
    console.log("[HelmOrchestrator] Shutting down...");
    this.containerCache.clear();
  }

  // =====================
  // Private helpers
  // =====================

  private buildPreviewHostname(sid: string, slug?: string): string {
    if (this.options.previewUrlMode === "slug" && slug) {
      return appHostname({
        mode: "slug",
        slug,
        domain: this.options.previewDomain,
      });
    }
    return appHostname({
      mode: "prefixed",
      shortId: sid,
      domain: this.options.previewDomain,
    });
  }

  private buildContainerUrls(previewHost: string): {
    agentUrl: string;
    previewUrl: string;
  } {
    const isHttps =
      this.options.previewPort === 443 || this.options.previewPort === 8443;
    const protocol = isHttps ? "https" : "http";
    const portSuffix =
      this.options.previewPort === 443 || this.options.previewPort === 80
        ? ""
        : `:${this.options.previewPort}`;
    const baseUrl = `${protocol}://${previewHost}${portSuffix}`;

    return {
      agentUrl: `${baseUrl}/agent`,
      previewUrl: baseUrl,
    };
  }

  private async getPodNameForApp(appId: number): Promise<string> {
    const podName = (
      await this.kubectl(
        "get",
        "pod",
        "-l",
        `kova.dev/app-id=${appId},kova.dev/instance=${this.options.instanceId}`,
        "-n",
        this.options.namespace,
        "-o",
        "jsonpath={.items[0].metadata.name}",
      )
    ).trim();

    if (!podName) {
      throw new Error(`No running pod found for app ${appId}`);
    }

    return podName;
  }

  private async getReleaseNameForApp(appId: number): Promise<string | null> {
    try {
      const output = await this.kubectl(
        "get",
        "deployment",
        "-l",
        `kova.dev/app-id=${appId},kova.dev/instance=${this.options.instanceId}`,
        "-n",
        this.options.namespace,
        "-o",
        "jsonpath={.items[0].metadata.name}",
      );
      return output.trim() || null;
    } catch {
      return null;
    }
  }

  private async helmUpgradeInstall(
    releaseName: string,
    values: Record<string, string>,
  ): Promise<void> {
    const args = [
      "upgrade",
      "--install",
      releaseName,
      this.options.chartPath,
      "--namespace",
      this.options.namespace,
      "--wait",
      "--timeout",
      "180s",
    ];

    if (this.options.context) {
      args.push("--kube-context", this.options.context);
    }

    for (const [key, value] of Object.entries(values)) {
      args.push("--set-string", `${key}=${value}`);
    }

    console.log(
      `[HelmOrchestrator] helm upgrade --install ${releaseName} (${Object.keys(values).length} values)`,
    );

    try {
      const { stdout, stderr } = await execFileAsync("helm", args, {
        maxBuffer: 10 * 1024 * 1024,
      });
      if (stdout.trim()) {
        console.log(`[helm] ${stdout.trim()}`);
      }
      if (stderr && !stderr.toLowerCase().includes("warning")) {
        console.warn(`[helm stderr] ${stderr}`);
      }
    } catch (error: any) {
      console.error(`[HelmOrchestrator] helm upgrade failed:`, error.message);
      if (error.stderr) {
        console.error(`[helm stderr] ${error.stderr}`);
      }
      throw error;
    }
  }

  private async helmUninstall(releaseName: string): Promise<void> {
    const args = [
      "uninstall",
      releaseName,
      "--namespace",
      this.options.namespace,
    ];

    if (this.options.context) {
      args.push("--kube-context", this.options.context);
    }

    await execFileAsync("helm", args);
  }

  private async kubectl(...args: string[]): Promise<string> {
    const kubectlArgs = this.options.context
      ? ["--context", this.options.context, ...args]
      : args;

    const { stdout, stderr } = await execFileAsync("kubectl", kubectlArgs);

    if (stderr && !stderr.toLowerCase().includes("warning")) {
      console.warn("[kubectl stderr]", stderr);
    }

    return stdout;
  }

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
