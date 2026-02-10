# Cross-Cluster Orchestration - Technical Implementation Details

## Overview

This document provides detailed technical specifications for implementing cross-cluster orchestration in Kova, where the backend runs in `dev01-eks-kova` and orchestrates user app pods in `dev01-eks-ops`.

## 1. Configuration Architecture

### 1.1 Environment Variable Schema

**Current K8s Environment Config**:
```typescript
// backend/src/config/index.ts
K8S_ENVIRONMENT: z.enum(["local", "eks-dev", "eks-prod"]).optional()
K8S_CONTEXT: z.string().optional()
K8S_NAMESPACE: z.string().optional()
PREVIEW_DOMAIN: z.string().optional()
PREVIEW_PORT: z.coerce.number().optional()
```

**New Cross-Cluster Config** (additions):
```typescript
// Cross-cluster orchestration mode
K8S_ORCHESTRATION_MODE: z.enum(["single-cluster", "cross-cluster"]).default("single-cluster")

// When mode=cross-cluster, these are REQUIRED:
K8S_OPS_CLUSTER_CONTEXT: z.string().optional()  // Target cluster for user apps
K8S_OPS_CLUSTER_NAMESPACE: z.string().optional()  // Namespace in ops cluster
K8S_OPS_KUBECONFIG_PATH: z.string().default("/etc/kubernetes/ops/kubeconfig")

// Optional: Separate ServiceAccount for user apps
K8S_OPS_SERVICE_ACCOUNT: z.string().default("kova-app-container")
```

### 1.2 Environment Detection Logic

```typescript
// backend/src/services/k8s-environment.service.ts

export type K8sOrchestrationMode = "single-cluster" | "cross-cluster";

export interface K8sEnvironmentConfig {
  environment: K8sEnvironment;
  orchestrationMode: K8sOrchestrationMode;

  // Kova backend cluster config (where Kova runs)
  backendContext: string;
  backendNamespace: string;

  // Ops cluster config (where user apps run)
  opsContext: string;
  opsNamespace: string;
  opsKubeconfigPath?: string;  // Only needed for cross-cluster
  opsServiceAccount: string;

  // Preview configuration
  previewDomain: string;
  previewPort: number;
}

export function buildK8sEnvironmentConfig(): K8sEnvironmentConfig {
  const environment = detectK8sEnvironment();
  const orchestrationMode = config.K8S_ORCHESTRATION_MODE || "single-cluster";

  // Single-cluster mode (local, or same cluster for both)
  if (orchestrationMode === "single-cluster") {
    const defaults = ENVIRONMENT_DEFAULTS[environment];
    return {
      environment,
      orchestrationMode: "single-cluster",
      backendContext: config.K8S_CONTEXT || defaults.context,
      backendNamespace: "kova",  // Backend always in "kova" namespace
      opsContext: config.K8S_CONTEXT || defaults.context,  // Same cluster
      opsNamespace: config.K8S_NAMESPACE || defaults.namespace,
      opsServiceAccount: "kova-app-container",
      previewDomain: config.PREVIEW_DOMAIN || defaults.previewDomain,
      previewPort: config.PREVIEW_PORT || defaults.previewPort,
    };
  }

  // Cross-cluster mode (backend in kova cluster, apps in ops cluster)
  if (!config.K8S_OPS_CLUSTER_CONTEXT) {
    throw new Error("K8S_OPS_CLUSTER_CONTEXT is required for cross-cluster mode");
  }

  return {
    environment,
    orchestrationMode: "cross-cluster",
    backendContext: config.K8S_CONTEXT || `arn:aws:eks:us-east-1:851725519214:cluster/dev01-eks-kova`,
    backendNamespace: "kova",
    opsContext: config.K8S_OPS_CLUSTER_CONTEXT,
    opsNamespace: config.K8S_OPS_CLUSTER_NAMESPACE || "kova-apps",
    opsKubeconfigPath: config.K8S_OPS_KUBECONFIG_PATH,
    opsServiceAccount: config.K8S_OPS_SERVICE_ACCOUNT || "kova-app-container",
    previewDomain: config.PREVIEW_DOMAIN || "kova-apps.eks.dev01.tk.dev",
    previewPort: config.PREVIEW_PORT || 443,
  };
}
```

### 1.3 Environment Defaults

```typescript
const ENVIRONMENT_DEFAULTS: Record<K8sEnvironment, EnvironmentDefaults> = {
  // Local k3d (single cluster)
  local: {
    context: "k3d-kova-dev",
    namespace: "kova-apps",
    previewDomain: "dev.toolkit.co",
    previewPort: 8443,
  },

  // EKS dev (cross-cluster by default)
  "eks-dev": {
    context: "arn:aws:eks:us-east-1:851725519214:cluster/dev01-eks-kova",
    namespace: "kova-apps",
    previewDomain: "kova-apps.eks.dev01.tk.dev",
    previewPort: 443,
  },

  // EKS test
  "eks-test": {
    context: "arn:aws:eks:us-east-1:851725519214:cluster/test01-eks-kova",
    namespace: "kova-apps",
    previewDomain: "kova-apps.eks.test01.tk.staging",
    previewPort: 443,
  },

  // EKS prod
  "eks-prod": {
    context: "arn:aws:eks:us-east-1:851725519214:cluster/prod-eks-kova",
    namespace: "kova-apps",
    previewDomain: "kova-apps.eks.prod.tk.dev",
    previewPort: 443,
  },
};
```

## 2. Kubectl Orchestrator Updates

### 2.1 Constructor Changes

```typescript
// backend/src/services/orchestrator/kubectl.orchestrator.ts

export class KubectlOrchestrator implements ContainerOrchestrator {
  private orchestrationMode: K8sOrchestrationMode;
  private backendContext?: string;  // Where Kova backend runs
  private opsContext?: string;      // Where user apps run
  private opsKubeconfigPath?: string;
  private opsServiceAccount: string;

  constructor(options: KubectlOrchestratorOptions) {
    super();
    this.options = options;

    // Get K8s environment config
    const k8sEnv = buildK8sEnvironmentConfig();

    this.orchestrationMode = k8sEnv.orchestrationMode;
    this.backendContext = k8sEnv.backendContext;
    this.opsContext = k8sEnv.opsContext;
    this.opsKubeconfigPath = k8sEnv.opsKubeconfigPath;
    this.opsServiceAccount = k8sEnv.opsServiceAccount;
    this.namespace = k8sEnv.opsNamespace;

    console.log(`[KubectlOrchestrator] Orchestration mode: ${this.orchestrationMode}`);
    if (this.orchestrationMode === "cross-cluster") {
      console.log(`[KubectlOrchestrator] Backend cluster: ${this.backendContext}`);
      console.log(`[KubectlOrchestrator] Ops cluster: ${this.opsContext}`);
      console.log(`[KubectlOrchestrator] Ops kubeconfig: ${this.opsKubeconfigPath}`);
    }
  }
}
```

### 2.2 Kubectl Command Execution

```typescript
/**
 * Execute kubectl command
 * - In single-cluster mode: use default kubeconfig and --context flag
 * - In cross-cluster mode: use mounted ops kubeconfig
 */
private async kubectlExec(args: string[]): Promise<string> {
  const kubectlArgs: string[] = [];

  if (this.orchestrationMode === "cross-cluster") {
    // Use ops cluster kubeconfig (mounted at /etc/kubernetes/ops/kubeconfig)
    kubectlArgs.push(`--kubeconfig=${this.opsKubeconfigPath}`);
    // Context is embedded in kubeconfig, but specify explicitly for clarity
    if (this.opsContext) {
      kubectlArgs.push(`--context=${this.opsContext}`);
    }
  } else {
    // Single-cluster mode: use default kubeconfig with context
    if (this.opsContext) {
      kubectlArgs.push(`--context=${this.opsContext}`);
    }
  }

  // Add namespace (all user app operations are namespaced)
  kubectlArgs.push(`--namespace=${this.namespace}`);

  // Add actual command args
  kubectlArgs.push(...args);

  // Execute kubectl
  const result = await execPromise(`kubectl ${kubectlArgs.join(" ")}`);
  return result.stdout.trim();
}
```

### 2.3 Deployment Manifest Updates

```typescript
private createDeploymentManifest(
  deploymentName: string,
  config: ContainerConfig,
  labels: Record<string, string>,
  replicas: number = 1
) {
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      name: deploymentName,
      namespace: this.namespace,
      labels,
    },
    spec: {
      replicas,
      selector: { matchLabels: labels },
      template: {
        metadata: { labels },
        spec: {
          // Use ops cluster ServiceAccount (has Pod Identity for Bedrock)
          serviceAccountName: this.opsServiceAccount,

          // hostNetwork: Only in local mode for VPN compatibility
          // In EKS cross-cluster, use regular networking
          ...(this.orchestrationMode === "single-cluster" && {
            hostNetwork: true,
          }),

          containers: [
            {
              name: deploymentName,
              image: config.image,
              env: this.buildEnvArray(config.env),
              ports: [
                {
                  name: "agent",
                  containerPort: parseInt(config.env.AGENT_PORT || "3100"),
                  protocol: "TCP",
                },
                {
                  name: "dev",
                  containerPort: parseInt(config.env.DEV_SERVER_PORT || "3000"),
                  protocol: "TCP",
                },
              ],
              volumeMounts: [
                {
                  name: "workspace",
                  mountPath: "/workspace",
                },
              ],
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
```

### 2.4 Service Manifest Updates

```typescript
private createServiceManifest(
  deploymentName: string,
  config: ContainerConfig,
  labels: Record<string, string>
) {
  const agentPort = parseInt(config.env.AGENT_PORT || "3100");
  const devPort = parseInt(config.env.DEV_SERVER_PORT || "3000");

  // In single-cluster mode with hostNetwork, use NodePort for deterministic port mapping
  // In cross-cluster mode, use ClusterIP (Istio handles ingress)
  const serviceType = this.orchestrationMode === "single-cluster" ? "NodePort" : "ClusterIP";

  return {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name: deploymentName,
      namespace: this.namespace,
      labels,
    },
    spec: {
      type: serviceType,
      selector: labels,
      ports: [
        {
          name: "agent",
          port: agentPort,
          targetPort: agentPort,
          protocol: "TCP",
          // NodePort only in single-cluster mode
          ...(serviceType === "NodePort" && {
            nodePort: agentPort,  // hostNetwork makes this work
          }),
        },
        {
          name: "dev",
          port: devPort,
          targetPort: devPort,
          protocol: "TCP",
          ...(serviceType === "NodePort" && {
            nodePort: devPort,
          }),
        },
      ],
    },
  };
}
```

### 2.5 VirtualService Manifest

```typescript
private createVirtualServiceManifest(
  deploymentName: string,
  previewHostname: string,
  devPort: number
) {
  return {
    apiVersion: "networking.istio.io/v1beta1",
    kind: "VirtualService",
    metadata: {
      name: deploymentName,
      namespace: this.namespace,
    },
    spec: {
      hosts: [previewHostname],
      gateways: [
        // In ops cluster, Istio Gateway is in istio-system namespace
        "istio-system/default-gateway",
      ],
      http: [
        {
          match: [
            {
              uri: { prefix: "/" },
            },
          ],
          route: [
            {
              destination: {
                host: `${deploymentName}.${this.namespace}.svc.cluster.local`,
                port: { number: devPort },
              },
            },
          ],
          // CORS for preview URLs
          corsPolicy: {
            allowOrigins: [
              { regex: ".*" },  // Allow all origins (preview URLs)
            ],
            allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allowHeaders: ["*"],
            allowCredentials: true,
          },
        },
      ],
    },
  };
}
```

### 2.6 PersistentVolumeClaim Manifest

```typescript
private createPVCManifest(
  deploymentName: string,
  storageSize: string = "5Gi"
) {
  return {
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata: {
      name: `${deploymentName}-workspace`,
      namespace: this.namespace,
    },
    spec: {
      accessModes: ["ReadWriteOnce"],
      storageClassName: "gp3",  // AWS EBS gp3
      resources: {
        requests: {
          storage: storageSize,
        },
      },
    },
  };
}
```

## 3. Container URL Resolution

### 3.1 Agent URL Construction

```typescript
/**
 * Build agent URL for backend to call
 * - Single-cluster with hostNetwork: http://<pod-ip>:<agent-port>
 * - Cross-cluster: http://<service-name>.<namespace>.svc.cluster.local:<agent-port>
 *   (requires backend to have network access to ops cluster services)
 */
private buildAgentUrl(deploymentName: string, podIp: string, agentPort: number): string {
  if (this.orchestrationMode === "single-cluster") {
    // Direct pod IP access (hostNetwork mode)
    return `http://${podIp}:${agentPort}`;
  }

  // Cross-cluster: use service DNS
  // IMPORTANT: This requires network connectivity between clusters
  // Either:
  //   1. VPC Peering + DNS forwarding, or
  //   2. Service mesh (Istio multi-cluster), or
  //   3. Alternative: Backend calls ops cluster API to proxy to pod
  return `http://${deploymentName}.${this.namespace}.svc.cluster.local:${agentPort}`;
}
```

### 3.2 Cross-Cluster Service Access Problem

**Issue**: Backend in kova cluster can't directly call service in ops cluster

**Solutions**:

**Option A: VPC Peering + Route53 Private Hosted Zone**
```
1. Create VPC Peering between kova and ops VPCs
2. Create Route53 Private Hosted Zone: kova-apps.ops.cluster.local
3. Create CNAME records pointing to ops cluster LoadBalancer
4. Backend uses: http://kova-app-5.kova-apps.ops.cluster.local:3100
```

**Option B: Istio Multi-Cluster**
```
1. Configure Istio multi-cluster federation
2. Backend uses service mesh to route to ops cluster
3. Transparent service discovery across clusters
```

**Option C: API Proxy Pattern** (Simplest)
```
1. Backend uses kubectl port-forward to proxy to pod
2. Temporary tunnel for API calls
3. No permanent network connectivity needed

Example:
  kubectl port-forward pod/kova-app-5-xxx 3100:3100 \
    --namespace=kova-apps \
    --context=dev01-eks-ops \
    --kubeconfig=/etc/kubernetes/ops/kubeconfig &

  # Backend calls localhost:3100
  curl http://localhost:3100/query
```

**Recommendation**: Option A (VPC Peering) for production, Option C (port-forward) for MVP

### 3.3 Port-Forward Implementation

```typescript
// backend/src/services/orchestrator/kubectl.orchestrator.ts

private portForwards: Map<string, ChildProcess> = new Map();

/**
 * Create port-forward tunnel to user app pod
 */
private async createPortForward(
  podName: string,
  localPort: number,
  remotePort: number
): Promise<void> {
  const args = [
    "port-forward",
    `pod/${podName}`,
    `${localPort}:${remotePort}`,
    `--namespace=${this.namespace}`,
  ];

  if (this.orchestrationMode === "cross-cluster") {
    args.push(`--kubeconfig=${this.opsKubeconfigPath}`);
    args.push(`--context=${this.opsContext}`);
  } else if (this.opsContext) {
    args.push(`--context=${this.opsContext}`);
  }

  const proc = spawn("kubectl", args);

  proc.stdout.on("data", (data) => {
    console.log(`[PortForward ${podName}] ${data.toString()}`);
  });

  proc.stderr.on("data", (data) => {
    console.error(`[PortForward ${podName}] ${data.toString()}`);
  });

  // Store process for cleanup
  this.portForwards.set(podName, proc);

  // Wait for port-forward to be ready
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

/**
 * Clean up port-forward when container stops
 */
async stopContainer(containerId: string): Promise<void> {
  const podName = this.extractPodName(containerId);

  // Kill port-forward process
  const proc = this.portForwards.get(podName);
  if (proc) {
    proc.kill();
    this.portForwards.delete(podName);
  }

  // Delete Kubernetes resources
  await this.kubectlDelete("deployment", podName);
  await this.kubectlDelete("service", podName);
  await this.kubectlDelete("virtualservice", podName);
  await this.kubectlDelete("pvc", `${podName}-workspace`);
}

/**
 * Build agent URL with port-forward support
 */
private async buildAgentUrlWithPortForward(
  deploymentName: string,
  podName: string,
  agentPort: number
): Promise<string> {
  if (this.orchestrationMode === "cross-cluster") {
    // Allocate local port (use pod number + offset)
    const localPort = 20000 + this.extractAppId(deploymentName);

    // Create port-forward
    await this.createPortForward(podName, localPort, agentPort);

    // Return localhost URL
    return `http://localhost:${localPort}`;
  }

  // Single-cluster: direct pod IP access
  const podIp = await this.getPodIp(podName);
  return `http://${podIp}:${agentPort}`;
}
```

## 4. GitLab CI/CD Configuration

### 4.1 Environment Variables for Cross-Cluster

```yaml
# .gitlab-ci.yml

release_dev_aws:
  variables:
    # K8s orchestration config
    K8S_ORCHESTRATION_MODE: "cross-cluster"
    K8S_CONTEXT: "arn:aws:eks:us-east-1:851725519214:cluster/dev01-eks-kova"
    K8S_OPS_CLUSTER_CONTEXT: "arn:aws:eks:us-east-1:851725519214:cluster/dev01-eks-ops"
    K8S_OPS_CLUSTER_NAMESPACE: "kova-apps"
    K8S_OPS_SERVICE_ACCOUNT: "kova-app-container"
    K8S_OPS_KUBECONFIG_PATH: "/etc/kubernetes/ops/kubeconfig"

    # Helm configuration
    HELM_ARGS: |
      --set deployment.env.K8S_ORCHESTRATION_MODE="cross-cluster"
      --set deployment.env.K8S_OPS_CLUSTER_CONTEXT="${K8S_OPS_CLUSTER_CONTEXT}"
      --set deployment.env.K8S_OPS_CLUSTER_NAMESPACE="${K8S_OPS_CLUSTER_NAMESPACE}"
      --set deployment.env.K8S_OPS_SERVICE_ACCOUNT="${K8S_OPS_SERVICE_ACCOUNT}"
      --set deployment.env.K8S_OPS_KUBECONFIG_PATH="${K8S_OPS_KUBECONFIG_PATH}"
      # ... other env vars
      --set deployment.serviceAccount.annotations.eks\.amazonaws\.com/role-arn="${KOVA_BACKEND_IAM_ROLE_ARN}"
      --set deployment.volumes[0].name=ops-kubeconfig
      --set deployment.volumes[0].secret.secretName=ops-kubeconfig
      --set deployment.volumeMounts[0].name=ops-kubeconfig
      --set deployment.volumeMounts[0].mountPath=/etc/kubernetes/ops
      --set deployment.volumeMounts[0].readOnly=true
```

### 4.2 Local Development Override

```bash
# .env (local development)
K8S_ENVIRONMENT=local
K8S_ORCHESTRATION_MODE=single-cluster
K8S_CONTEXT=k3d-kova-dev
K8S_NAMESPACE=kova-apps
```

## 5. Testing Strategy

### 5.1 Unit Tests

```typescript
// backend/src/services/__tests__/k8s-environment.service.test.ts

describe("K8sEnvironmentService - Cross-Cluster", () => {
  beforeEach(() => {
    process.env.K8S_ORCHESTRATION_MODE = "cross-cluster";
    process.env.K8S_OPS_CLUSTER_CONTEXT = "arn:aws:eks:us-east-1:123:cluster/ops";
  });

  test("builds cross-cluster config correctly", () => {
    const config = buildK8sEnvironmentConfig();

    expect(config.orchestrationMode).toBe("cross-cluster");
    expect(config.opsContext).toBe("arn:aws:eks:us-east-1:123:cluster/ops");
    expect(config.opsKubeconfigPath).toBe("/etc/kubernetes/ops/kubeconfig");
  });

  test("throws error if ops cluster context missing", () => {
    delete process.env.K8S_OPS_CLUSTER_CONTEXT;

    expect(() => buildK8sEnvironmentConfig()).toThrow(
      "K8S_OPS_CLUSTER_CONTEXT is required for cross-cluster mode"
    );
  });
});
```

### 5.2 Integration Tests

```typescript
// backend/src/services/__tests__/kubectl.orchestrator.integration.test.ts

describe("KubectlOrchestrator - Cross-Cluster Integration", () => {
  let orchestrator: KubectlOrchestrator;

  beforeAll(async () => {
    // Set up test environment
    process.env.K8S_ORCHESTRATION_MODE = "cross-cluster";
    process.env.K8S_OPS_CLUSTER_CONTEXT = "kind-ops-cluster";

    orchestrator = createOrchestrator();
    await orchestrator.initialize();
  });

  test("can list nodes in ops cluster", async () => {
    const result = await orchestrator.kubectlExec(["get", "nodes"]);
    expect(result).toContain("kind-ops-cluster");
  });

  test("creates deployment in ops cluster", async () => {
    const container = await orchestrator.startContainer({
      appId: 999,
      image: "nginx:alpine",
      env: {
        AGENT_PORT: "3100",
        DEV_SERVER_PORT: "3000",
      },
    });

    expect(container.containerName).toContain("kova-app-999");

    // Verify pod exists in ops cluster
    const pods = await orchestrator.kubectlExec([
      "get", "pods",
      "-l", "app=kova-app-999",
      "-o", "name",
    ]);
    expect(pods).toContain("kova-app-999");

    // Cleanup
    await orchestrator.stopContainer(container.containerId);
  });

  test("port-forward works for cross-cluster access", async () => {
    const container = await orchestrator.startContainer({
      appId: 998,
      image: "nginx:alpine",
      env: { AGENT_PORT: "3100", DEV_SERVER_PORT: "3000" },
    });

    // Agent URL should be localhost with port-forward
    expect(container.agentUrl).toMatch(/^http:\/\/localhost:\d+$/);

    // Verify we can actually reach it
    const response = await fetch(container.agentUrl);
    expect(response.ok).toBe(true);

    await orchestrator.stopContainer(container.containerId);
  });
});
```

### 5.3 End-to-End Tests

```bash
#!/bin/bash
# scripts/test-cross-cluster.sh

set -e

echo "==> Testing cross-cluster orchestration"

# 1. Deploy backend to kova cluster
echo "Deploying backend..."
kubectl apply -f manifests/backend/ --context=dev01-eks-kova

# 2. Wait for backend to be ready
kubectl wait --for=condition=available deployment/kova \
  --namespace=kova --timeout=120s --context=dev01-eks-kova

# 3. Create test app via API
echo "Creating test app..."
APP_ID=$(curl -X POST http://kova.eks.dev01.tk.dev/api/apps \
  -H "Content-Type: application/json" \
  -d '{"name":"test-cross-cluster"}' | jq -r '.id')

echo "Created app ID: $APP_ID"

# 4. Verify pod created in ops cluster
echo "Verifying pod in ops cluster..."
kubectl get pod -l "app=kova-app-$APP_ID" \
  --namespace=kova-apps --context=dev01-eks-ops-ro

# 5. Check app is accessible
echo "Checking app preview URL..."
PREVIEW_URL="https://kova-app-$APP_ID.kova-apps.eks.dev01.tk.dev"
curl -f "$PREVIEW_URL" || echo "Preview URL not accessible yet (may take a moment)"

# 6. Cleanup
echo "Cleaning up..."
curl -X DELETE "http://kova.eks.dev01.tk.dev/api/apps/$APP_ID"

echo "==> Cross-cluster test completed successfully!"
```

## 6. Rollout Strategy

### Phase 1: Local Testing (Week 1)
- [ ] Implement cross-cluster config in code
- [ ] Add unit tests
- [ ] Test with kind multi-cluster locally
- [ ] Verify port-forward works

### Phase 2: Dev Deployment (Week 2)
- [ ] Create IAM roles
- [ ] Set up Pod Identity
- [ ] Apply RBAC in ops cluster
- [ ] Deploy to dev01-eks-kova
- [ ] Test cross-cluster orchestration
- [ ] Monitor logs for errors

### Phase 3: Optimization (Week 3)
- [ ] Implement VPC Peering (replace port-forward)
- [ ] Add monitoring and alerts
- [ ] Performance testing (latency, throughput)
- [ ] Cost analysis

### Phase 4: Production Rollout (Week 4+)
- [ ] Deploy to test environment
- [ ] User acceptance testing
- [ ] Deploy to production
- [ ] Documentation and runbooks

---

**Status**: Technical implementation details ready
**Last Updated**: 2026-02-06
**Related**:
- [eks-deployment-plan.md](./eks-deployment-plan.md)
- [eks-deployment-plan-addendum.md](./eks-deployment-plan-addendum.md)
