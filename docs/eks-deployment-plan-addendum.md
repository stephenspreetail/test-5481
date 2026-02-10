# Kova EKS Deployment Plan - Addendum

## Additional Considerations & Details

This document supplements the main [eks-deployment-plan.md](./eks-deployment-plan.md) with additional implementation details.

## 1. Multi-Image Build Strategy

### 1.1 Three Docker Images Required

Kova requires **three separate Docker images**:

1. **Backend API** (`kova-backend`)
   - Bun/Fastify API server
   - Orchestrates user app pods
   - Runs in kova cluster

2. **Frontend UI** (`kova-web`)
   - React SPA built with Vite
   - Served by nginx
   - Runs in kova cluster

3. **App Container** (`kova-app-container`)
   - User-generated app runtime
   - @kova/agent CLI
   - Runs in ops cluster

### 1.2 Build Pipeline Strategy

**Option A: Multi-Project Pipeline** (Recommended)

Use `dotnet-multi-project.yml` pattern for multiple images:

```yaml
include:
  - project: spreetail/ci-templates
    ref: main
    file: node-single-build.yml  # Base template

variables:
  RELEASE_NAME: "kova"
  NAMESPACE: "kova"
  DOCKER_REPOSITORIES: "kova/kova-backend kova/kova-web kova/kova-app-container"

# Backend image
backend_build:
  extends: .npm_run_build
  variables:
    PROJECT_NAME: "backend"
    PROJECT_DIRECTORY: "backend"
  script:
    - cd backend && bun install && bun run build

backend_image_build:
  extends: .image_build
  needs: [backend_build]
  variables:
    RELEASE_NAME: "kova-backend"
    DOCKERFILE: "backend/Dockerfile"
    CONTEXT: "backend"

backend_image_scan:
  extends: .snyk_image_scan
  needs: [backend_image_build]
  variables:
    RELEASE_NAME: "kova-backend"

# Web image
web_build:
  extends: .npm_run_build
  variables:
    PROJECT_NAME: "web"
  script:
    - bun install && bun run build:web

web_image_build:
  extends: .image_build
  needs: [web_build]
  variables:
    RELEASE_NAME: "kova-web"
    DOCKERFILE: "Dockerfile.web"
    CONTEXT: "."

web_image_scan:
  extends: .snyk_image_scan
  needs: [web_image_build]
  variables:
    RELEASE_NAME: "kova-web"

# App container image
appcontainer_image_build:
  extends: .image_build
  needs: []  # No build step needed, Dockerfile handles it
  variables:
    RELEASE_NAME: "kova-app-container"
    DOCKERFILE: "Dockerfile.appcontainer"
    CONTEXT: "."

appcontainer_image_scan:
  extends: .snyk_image_scan
  needs: [appcontainer_image_build]
  variables:
    RELEASE_NAME: "kova-app-container"

# Release
release_dev_aws:
  extends: .helm_deploy_dev_aws
  needs:
    - backend_image_scan
    - web_image_scan
    - appcontainer_image_scan
  variables:
    HELM_ARGS: |
      --set backend.deployment.image.repository=${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com/kova/kova-backend
      --set backend.deployment.image.tag=${RELEASE_VERSION}
      --set web.deployment.image.repository=${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com/kova/kova-web
      --set web.deployment.image.tag=${RELEASE_VERSION}
      --set appContainer.image.repository=${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com/kova/kova-app-container
      --set appContainer.image.tag=${RELEASE_VERSION}
      # ... other HELM_ARGS
```

**Option B: Separate Pipelines** (Simpler but less efficient)

Create three separate `.gitlab-ci.yml` files:
- `backend/.gitlab-ci.yml` - Backend pipeline
- `.gitlab-ci.yml` - Web pipeline
- `app-container/.gitlab-ci.yml` - App container pipeline

**Recommendation**: Use Option A for better coordination and single-version releases.

### 1.3 Image Registry Structure

```
851725519214.dkr.ecr.us-east-1.amazonaws.com/
├── kova/
│   ├── kova-backend:123      (backend API)
│   ├── kova-backend:latest
│   ├── kova-web:123          (frontend UI)
│   ├── kova-web:latest
│   ├── kova-app-container:123 (user app runtime)
│   └── kova-app-container:latest
```

## 2. Frontend Deployment

### 2.1 Frontend Helm Chart

**Option A: Separate Frontend Chart** (Cleaner)

```
helm/
├── kova-backend/        # Backend deployment
│   ├── Chart.yaml
│   ├── values-*.yaml
│   └── templates/
└── kova-web/           # Frontend deployment
    ├── Chart.yaml
    ├── values-*.yaml
    └── templates/
```

**Option B: Combined Chart** (Simpler)

```
helm/kova/
├── Chart.yaml
├── values-*.yaml
└── templates/
    ├── backend-deployment.yaml
    ├── backend-service.yaml
    ├── web-deployment.yaml
    ├── web-service.yaml
    └── ingress.yaml (routes to both)
```

**Recommendation**: Option B (combined) for simpler version coordination.

### 2.2 Frontend Configuration

**Dockerfile.web**:
```dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json bun.lock* ./
RUN npm install -g bun && bun install --frozen-lockfile
COPY . .
RUN bun run build:web

# Stage 2: Nginx
FROM nginx:stable-alpine
COPY --from=builder /app/dist/web /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**nginx.conf**:
```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA routing fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy to backend
    location /api/ {
        proxy_pass http://kova-backend:80/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket proxy
    location /ws {
        proxy_pass http://kova-backend:80/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Health check
    location /health {
        access_log off;
        return 200 "OK\n";
    }
}
```

### 2.3 Ingress Configuration

**Istio VirtualService** (routes to both frontend and backend):
```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: kova
  namespace: kova
spec:
  hosts:
    - "kova.eks.dev01.tk.dev"
  gateways:
    - istio-system/default-gateway
  http:
    # Frontend (default)
    - match:
        - uri:
            prefix: "/"
      route:
        - destination:
            host: kova-web.kova.svc.cluster.local
            port:
              number: 80
```

## 3. App Container Image Pre-Loading

### 3.1 Problem

User app pods need the `kova-app-container` image. If image is pulled on-demand, first app creation is slow (image pull time).

### 3.2 Solution: DaemonSet Pre-Pull

**Deploy in ops cluster**:
```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: kova-app-container-prepull
  namespace: kova-apps
spec:
  selector:
    matchLabels:
      name: kova-app-container-prepull
  template:
    metadata:
      labels:
        name: kova-app-container-prepull
    spec:
      containers:
      - name: prepull
        image: 851725519214.dkr.ecr.us-east-1.amazonaws.com/kova/kova-app-container:latest
        command: ["sleep", "infinity"]
        resources:
          requests:
            cpu: 1m
            memory: 8Mi
          limits:
            cpu: 10m
            memory: 32Mi
      nodeSelector:
        kova-app-node: "true"  # Only on nodes designated for Kova apps
```

**Benefits**:
- Image pre-cached on all app nodes
- Fast app pod startup
- Minimal resource overhead (1m CPU, 8Mi memory)

**Update Strategy**:
- When new app-container version released, DaemonSet pulls new image
- Rolling update ensures nodes always have latest image

## 4. Persistent Storage for App Workspaces

### 4.1 Problem

User apps generate files (code, node_modules, build artifacts). Without persistent storage:
- ❌ Files lost when pod restarts
- ❌ Must reinstall dependencies every restart
- ❌ No state persistence

### 4.2 Solution Options

**Option A: EBS-backed PersistentVolumes** (Recommended for dev/test)

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: kova-app-5-workspace
  namespace: kova-apps
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: gp3  # AWS EBS gp3
  resources:
    requests:
      storage: 5Gi  # 5GB per app

---
# In Deployment
spec:
  template:
    spec:
      volumes:
      - name: workspace
        persistentVolumeClaim:
          claimName: kova-app-5-workspace
      containers:
      - name: app
        volumeMounts:
        - name: workspace
          mountPath: /workspace
```

**Cost**: ~$0.40/month per app (5GB EBS gp3)

**Option B: EFS Shared Storage** (Recommended for prod)

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: kova-apps-efs
spec:
  capacity:
    storage: 1Ti
  accessModes:
    - ReadWriteMany
  persistentVolumeReclaimPolicy: Retain
  storageClassName: efs
  csi:
    driver: efs.csi.aws.com
    volumeHandle: fs-12345678

---
# Per-app subdirectory via subPath
spec:
  template:
    spec:
      volumes:
      - name: workspace
        persistentVolumeClaim:
          claimName: kova-apps-efs
      containers:
      - name: app
        volumeMounts:
        - name: workspace
          mountPath: /workspace
          subPath: app-5  # Isolate apps with subPath
```

**Cost**: ~$0.30/GB-month (EFS Standard), shared across all apps

**Option C: No Persistent Storage** (Dev only, simplest)

- Store code in memory/tmpfs
- Fast but ephemeral
- Fine for testing, not production

**Recommendation**:
- **Dev**: Option C or A (EBS per app)
- **Prod**: Option B (EFS shared)

### 4.3 Storage Cleanup Policy

**Problem**: Deleted apps leave orphaned PVCs/storage

**Solution**: PVC cleanup in orchestrator

```typescript
// In kubectl.orchestrator.ts
async stopContainer(containerId: string): Promise<void> {
  // Delete deployment
  await this.kubectlDelete("deployment", deploymentName);

  // Delete service
  await this.kubectlDelete("service", serviceName);

  // Delete PVC (if using per-app PVCs)
  await this.kubectlDelete("pvc", `${deploymentName}-workspace`);

  // Delete VirtualService
  await this.kubectlDelete("virtualservice", virtualServiceName);
}
```

## 5. Network Policies

### 5.1 Isolation Requirements

**Kova Cluster** (`dev01-eks-kova`):
- Backend can reach: ops cluster API, RDS, Bedrock
- Web can reach: backend only
- Nothing else can reach backend

**Ops Cluster** (`dev01-eks-ops`):
- User apps can reach: Bedrock, external npm/apt repos
- User apps CANNOT reach: Kova backend, other apps
- Istio Gateway can reach: all apps (for preview URLs)

### 5.2 NetworkPolicy Examples

**Kova Cluster - Backend**:
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: kova-backend
  namespace: kova
spec:
  podSelector:
    matchLabels:
      app: kova
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Allow from web frontend
    - from:
        - podSelector:
            matchLabels:
              app: kova-web
      ports:
        - protocol: TCP
          port: 3002
    # Allow from Istio Gateway (health checks)
    - from:
        - namespaceSelector:
            matchLabels:
              name: istio-system
  egress:
    # Allow DNS
    - to:
        - namespaceSelector:
            matchLabels:
              name: kube-system
      ports:
        - protocol: UDP
          port: 53
    # Allow ops cluster API (cross-cluster)
    - to:
        - ipBlock:
            cidr: 10.0.0.0/8  # Private VPC CIDR
      ports:
        - protocol: TCP
          port: 443
    # Allow RDS
    - to:
        - ipBlock:
            cidr: 10.0.0.0/8
      ports:
        - protocol: TCP
          port: 5432
    # Allow Bedrock (AWS API endpoints)
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0  # External (AWS endpoints)
      ports:
        - protocol: TCP
          port: 443
```

**Ops Cluster - User Apps**:
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: kova-app-isolation
  namespace: kova-apps
spec:
  podSelector:
    matchLabels:
      managed-by: kova
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Allow from Istio Gateway only
    - from:
        - namespaceSelector:
            matchLabels:
              name: istio-system
  egress:
    # Allow DNS
    - to:
        - namespaceSelector:
            matchLabels:
              name: kube-system
      ports:
        - protocol: UDP
          port: 53
    # Allow external (npm, apt, Bedrock)
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 10.0.0.0/8  # Block internal VPC access
      ports:
        - protocol: TCP
          port: 443
        - protocol: TCP
          port: 80
```

## 6. Pod Security Standards

### 6.1 Pod Security Admission

**Enable Pod Security Standards** on namespaces:

```yaml
# Kova namespace (backend/web)
apiVersion: v1
kind: Namespace
metadata:
  name: kova
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

```yaml
# Kova-apps namespace (user apps)
apiVersion: v1
kind: Namespace
metadata:
  name: kova-apps
  labels:
    pod-security.kubernetes.io/enforce: baseline  # Less restrictive for user apps
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

### 6.2 Security Context Requirements

**Backend/Web pods** (restricted):
```yaml
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 1000
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: backend
    securityContext:
      allowPrivilegeEscalation: false
      capabilities:
        drop:
          - ALL
      readOnlyRootFilesystem: true  # Read-only root FS
```

**User app pods** (baseline):
```yaml
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 1000
  containers:
  - name: app
    securityContext:
      allowPrivilegeEscalation: false
      capabilities:
        drop:
          - ALL
      # NOT read-only (apps need to write files)
```

### 6.3 Implications

**Backend with readOnlyRootFilesystem**:
- ✅ Better security (prevent malicious writes)
- ⚠️ Need tmpfs/emptyDir for writable paths

```yaml
volumes:
  - name: tmp
    emptyDir: {}
  - name: logs
    emptyDir: {}
containers:
  - name: backend
    volumeMounts:
      - name: tmp
        mountPath: /tmp
      - name: logs
        mountPath: /app/logs
```

## 7. Monitoring & Observability

### 7.1 Metrics Collection

**Backend metrics** (Prometheus format):
```typescript
// backend/src/metrics.ts
import { Registry, Counter, Histogram, Gauge } from "prom-client";

export const register = new Registry();

// Request metrics
export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

// App orchestration metrics
export const appContainersTotal = new Gauge({
  name: "kova_app_containers_total",
  help: "Total number of user app containers",
  registers: [register],
});

export const appCreationDuration = new Histogram({
  name: "kova_app_creation_duration_seconds",
  help: "Duration to create user app pod",
  registers: [register],
});

// LLM call metrics
export const llmCallDuration = new Histogram({
  name: "kova_llm_call_duration_seconds",
  help: "Duration of LLM API calls",
  labelNames: ["provider", "model"],
  registers: [register],
});

export const llmTokensUsed = new Counter({
  name: "kova_llm_tokens_used_total",
  help: "Total LLM tokens used",
  labelNames: ["provider", "model", "type"],
  registers: [register],
});
```

**Metrics endpoint**:
```typescript
// backend/src/api/routes/metrics.routes.ts
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.send(await register.metrics());
});
```

**Prometheus ServiceMonitor**:
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: kova-backend
  namespace: kova
spec:
  selector:
    matchLabels:
      app: kova
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
```

### 7.2 Logging

**Structured logging with pino**:
```typescript
// backend/src/logger.ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label) => ({ level: label }),
  },
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
});

// Usage
logger.info({ userId: 123, appId: 5 }, "Creating user app");
logger.error({ err, appId: 5 }, "Failed to create app pod");
```

**CloudWatch Logs with Fluent Bit**:
```yaml
# Already deployed in EKS clusters
# Fluent Bit DaemonSet automatically ships logs to CloudWatch
# No additional config needed
```

### 7.3 Tracing (Optional)

**AWS X-Ray integration**:
```typescript
// backend/src/tracing.ts
import AWSXRay from "aws-xray-sdk-core";

// Wrap Bedrock client
const bedrock = AWSXRay.captureAWSv3Client(new BedrockRuntimeClient({
  region: "us-east-1",
}));

// HTTP tracing middleware
app.use(AWSXRay.express.openSegment("kova-backend"));
app.use(AWSXRay.express.closeSegment());
```

## 8. Cost Estimation

### 8.1 Monthly Cost Breakdown (Dev Environment)

**Compute** (EKS nodes):
- 3x m5.large nodes (ops cluster): $0.096/hr × 3 × 730hr = **$210/month**
- 2x m5.large nodes (kova cluster): $0.096/hr × 2 × 730hr = **$140/month**

**Storage**:
- EBS gp3 (20GB per app × 10 apps): 200GB × $0.08/GB-month = **$16/month**
- Or EFS (200GB shared): 200GB × $0.30/GB-month = **$60/month**

**RDS PostgreSQL**:
- db.t3.small (dev): **$30/month**

**Data Transfer**:
- Cross-cluster traffic: Minimal (same VPC)
- Bedrock API: $0.003/1K tokens (variable)

**ECR Storage**:
- 3 images × 300MB × 3 versions: ~3GB × $0.10/GB-month = **$0.30/month**

**Total Dev Environment**: ~$396/month (EBS) or ~$440/month (EFS)

**Total Prod Environment**: ~$1,200/month (5x nodes, larger RDS, multi-AZ)

### 8.2 Cost Optimization Strategies

**Compute**:
- Use Spot instances for dev (50-70% savings)
- Karpenter autoscaling (scale to zero at night)
- Smaller instance types (t3.medium for dev)

**Storage**:
- EBS snapshots for backup (cheaper than persistent volumes)
- Lifecycle policies (delete old snapshots after 30 days)

**Bedrock**:
- Use Sonnet by default (cheaper than Opus)
- Cache LLM responses where possible
- Implement token limits per user

**Networking**:
- Use VPC endpoints for Bedrock (avoid NAT Gateway costs)

## 9. Disaster Recovery

### 9.1 Backup Strategy

**PostgreSQL Database**:
- RDS automated backups (7-day retention)
- Manual snapshots before major releases
- Point-in-time recovery enabled

**Kubernetes State**:
- Velero backups (daily)
- Backup scope: `kova` namespace only (not user apps)
- S3 bucket: `s3://spreetail-eks-backups/kova/`

**Velero configuration**:
```yaml
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: kova-daily-backup
  namespace: velero
spec:
  schedule: "0 2 * * *"  # 2 AM daily
  template:
    includedNamespaces:
      - kova
    ttl: 168h  # 7 days retention
    storageLocation: default
    volumeSnapshotLocations:
      - default
```

### 9.2 Recovery Procedures

**Database restore**:
```bash
# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier kova-restored \
  --db-snapshot-identifier kova-snapshot-2026-02-06

# Update connection string in GitLab variables
# Re-deploy backend with new DATABASE_URL
```

**Kubernetes restore**:
```bash
# List backups
velero backup get

# Restore specific backup
velero restore create --from-backup kova-daily-backup-20260206

# Verify restore
kubectl get all -n kova
```

### 9.3 RTO/RPO Targets

- **RTO (Recovery Time Objective)**: 1 hour
- **RPO (Recovery Point Objective)**: 24 hours (daily backups)

## 10. Operational Runbook

### 10.1 Common Operations

**Scale backend replicas**:
```bash
kubectl scale deployment kova --replicas=3 -n kova --context=dev01-eks-kova
```

**View logs**:
```bash
# Backend logs
kubectl logs -f deployment/kova -n kova --context=dev01-eks-kova

# User app logs
kubectl logs -f kova-app-5-xxx -n kova-apps --context=dev01-eks-ops-ro
```

**Exec into pod**:
```bash
kubectl exec -it kova-backend-xxx -n kova --context=dev01-eks-kova -- sh
```

**Check Pod Identity works**:
```bash
kubectl exec kova-backend-xxx -n kova --context=dev01-eks-kova -- \
  aws sts get-caller-identity
```

**Manually create test app pod**:
```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: test-app
  namespace: kova-apps
spec:
  serviceAccountName: kova-app-container
  containers:
  - name: app
    image: 851725519214.dkr.ecr.us-east-1.amazonaws.com/kova/kova-app-container:latest
    command: ["sleep", "infinity"]
EOF
```

### 10.2 Emergency Procedures

**Backend is down**:
```bash
# Check pod status
kubectl get pods -n kova --context=dev01-eks-kova

# Check events
kubectl get events -n kova --sort-by='.lastTimestamp' --context=dev01-eks-kova

# Check logs for errors
kubectl logs deployment/kova -n kova --tail=100 --context=dev01-eks-kova

# Restart deployment (last resort)
kubectl rollout restart deployment/kova -n kova --context=dev01-eks-kova
```

**Can't create apps in ops cluster**:
```bash
# Verify cross-cluster access
kubectl exec kova-backend-xxx -n kova --context=dev01-eks-kova -- \
  kubectl get nodes --kubeconfig=/etc/kubernetes/ops/kubeconfig

# Check RBAC permissions
kubectl auth can-i create pods --as=system:serviceaccount:kova:kova-backend \
  --namespace=kova-apps --context=dev01-eks-ops-ro

# Verify IAM role is in aws-auth
kubectl get cm aws-auth -n kube-system -o yaml --context=dev01-eks-ops-ro | grep kova
```

**Database connection issues**:
```bash
# Test connection from pod
kubectl exec kova-backend-xxx -n kova --context=dev01-eks-kova -- \
  psql "$DATABASE_URL" -c "SELECT 1"

# Check RDS security group allows traffic from kova cluster
aws ec2 describe-security-groups \
  --group-ids sg-xxx --region us-east-1
```

### 10.3 Alerts

**Critical Alerts** (PagerDuty):
- Backend pod crashes
- Database connection failures
- Pod Identity authentication failures
- Bedrock API rate limiting

**Warning Alerts** (Slack):
- High pod creation latency (>30s)
- High LLM token usage
- Low disk space in user app pods
- Failed app container starts

---

**Status**: Supplementary details ready for review
**Last Updated**: 2026-02-06
**Related**: [eks-deployment-plan.md](./eks-deployment-plan.md)
