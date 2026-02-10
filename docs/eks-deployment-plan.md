# Kova EKS Deployment Plan - Cross-Cluster Orchestration

## Executive Summary

Deploy Kova to EKS with **cross-cluster orchestration** capability:
- **Kova Backend**: Deployed to `dev01-eks-kova` cluster
- **User App Pods**: Orchestrated in `dev01-eks-ops` cluster
- **Cross-Cluster Access**: Pod Identity + RBAC for kubectl operations

## Architecture Overview

### Current State (Local Development)
```
┌─────────────────────────────────────────────┐
│ k3d-kova-dev (Local Single Cluster)        │
│                                             │
│  ┌──────────────────┐                       │
│  │ Kova Backend Pod │                       │
│  │ (kubectl)        │                       │
│  └────────┬─────────┘                       │
│           │ Creates pods in                 │
│           │ same cluster                    │
│           ↓                                 │
│  ┌──────────────────┐                       │
│  │ User App Pods    │                       │
│  │ (kova-apps ns)   │                       │
│  └──────────────────┘                       │
└─────────────────────────────────────────────┘
```

### Target State (EKS Cross-Cluster)
```
┌──────────────────────────────────┐      ┌──────────────────────────────────┐
│ dev01-eks-kova (Kova Cluster)    │      │ dev01-eks-ops (Ops Cluster)      │
│                                  │      │                                  │
│  ┌────────────────────────────┐  │      │  ┌────────────────────────────┐  │
│  │ Kova Backend Pod           │  │      │  │ User App Pods              │  │
│  │ ─────────────────────────  │  │      │  │ ─────────────────────────  │  │
│  │ • ServiceAccount: kova-be  │  │      │  │ • Created by Kova          │  │
│  │ • IAM Role (Pod Identity)  │  │      │  │ • ServiceAccount: kova-app │  │
│  │ • kubectl config for ops   │  │      │  │ • IAM Role (Pod Identity)  │  │
│  │ • K8s API access           │  │      │  │ • Bedrock access           │  │
│  └──────────┬─────────────────┘  │      │  └────────────────────────────┘  │
│             │                     │      │           ↑                      │
│             └─────────────────────┼──────┼───────────┘                      │
│               Cross-cluster       │      │  Kubernetes API                  │
│               kubectl operations  │      │  (Pod CRUD operations)           │
└──────────────────────────────────┘      └──────────────────────────────────┘
                                                        ↑
                                                        │
                                                   Istio Gateway
                                                   (app previews)
```

## 1. CI/CD Pipeline Requirements

### 1.1 Pipeline Template Choice

Use **`node-single-build.yml`** from `spreetail/ci-templates`:

**Rationale**:
- ✅ Kova is a Bun/Node.js application
- ✅ Single build artifact (no environment-specific builds needed)
- ✅ Runtime configuration via environment variables
- ✅ Supports Docker image promotion to prod
- ✅ Includes security scanning (Snyk, GitLeaks)

### 1.2 GitLab CI Configuration

**File**: `.gitlab-ci.yml`

```yaml
include:
  - project: spreetail/ci-templates
    ref: main
    file: node-single-build.yml

variables:
  # Project Identity
  RELEASE_NAME: "kova"
  NAMESPACE: "kova"
  DOCKER_REPOSITORY: "kova/kova-backend"
  SNYK_ORG: "retail-decisions"

  # Build Configuration
  BUILD_IMAGE: "node:22-alpine"  # Match backend/Dockerfile
  PROJECT_DIRECTORY: "backend"   # Backend is in subdirectory
  PROJECT_TYPE: "api"

  # Feature Flags
  UNIT_TEST_ENABLED: "true"
  LINT_TEST_ENABLED: "true"
  CODE_QUALITY_SCAN_ENABLED: "false"  # Enable later with SonarQube
  DB_MIGRATION_ENABLED: "false"        # No DB migrations (using Drizzle ORM push)
  DOCKER_PROMOTION_ENABLED: "true"     # Enable prod image promotion
  HELM_STANDARD_SETS_ENABLED: "true"   # Use standard Helm sets

  # Deployment Configuration
  DEPLOY_TARGET: "AWS"
  AWS_REGION: "us-east-1"

  # Runtime Environment Variables (passed via Helm)
  # These configure the backend at runtime
  HELM_ARGS: |
    --set deployment.env.LLM_PROVIDER="${LLM_PROVIDER}"
    --set deployment.env.ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}"
    --set deployment.env.AGENT_MODEL="${AGENT_MODEL}"
    --set deployment.env.DATABASE_URL="${DATABASE_URL}"
    --set deployment.env.JWT_SECRET="${JWT_SECRET}"
    --set deployment.env.ENCRYPTION_KEY="${ENCRYPTION_KEY}"
    --set deployment.env.K8S_ENVIRONMENT="${K8S_ENVIRONMENT}"
    --set deployment.env.K8S_OPS_CLUSTER_CONTEXT="${K8S_OPS_CLUSTER_CONTEXT}"
    --set deployment.env.K8S_OPS_CLUSTER_NAMESPACE="${K8S_OPS_CLUSTER_NAMESPACE}"
    --set deployment.env.PREVIEW_DOMAIN="${PREVIEW_DOMAIN}"
    --set deployment.env.PROGET_API_KEY="${PROGET_API_KEY}"
    --set deployment.env.DATA_PLATFORM_HOST="${DATA_PLATFORM_HOST}"
    --set deployment.env.DATA_PLATFORM_USER="${DATA_PLATFORM_USER}"
    --set deployment.env.DATA_PLATFORM_PASSWORD="${DATA_PLATFORM_PASSWORD}"
    --set deployment.serviceAccount.annotations.eks\.amazonaws\.com/role-arn="${KOVA_BACKEND_IAM_ROLE_ARN}"
    --set deployment.volumes[0].name=ops-kubeconfig
    --set deployment.volumes[0].secret.secretName=ops-kubeconfig
    --set deployment.volumeMounts[0].name=ops-kubeconfig
    --set deployment.volumeMounts[0].mountPath=/etc/kubernetes/ops
    --set deployment.volumeMounts[0].readOnly=true

# Override environment-specific variables
release_dev_aws:
  variables:
    LLM_PROVIDER: "bedrock"
    AGENT_MODEL: "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    K8S_ENVIRONMENT: "eks-ops-dev"
    K8S_OPS_CLUSTER_CONTEXT: "arn:aws:eks:us-east-1:851725519214:cluster/dev01-eks-ops"
    K8S_OPS_CLUSTER_NAMESPACE: "kova-apps"
    PREVIEW_DOMAIN: "kova-apps.eks.dev01.tk.dev"
    DATABASE_URL: "postgresql://kova:${DB_PASSWORD}@dev-kova-pg.rds.amazonaws.com/kova"
    KOVA_BACKEND_IAM_ROLE_ARN: "arn:aws:iam::851725519214:role/dev-kova-backend-role"

release_test_aws:
  variables:
    LLM_PROVIDER: "bedrock"
    AGENT_MODEL: "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    K8S_ENVIRONMENT: "eks-ops-test"
    K8S_OPS_CLUSTER_CONTEXT: "arn:aws:eks:us-east-1:851725519214:cluster/test01-eks-ops"
    K8S_OPS_CLUSTER_NAMESPACE: "kova-apps"
    PREVIEW_DOMAIN: "kova-apps.eks.test01.tk.staging"
    DATABASE_URL: "postgresql://kova:${DB_PASSWORD}@test-kova-pg.rds.amazonaws.com/kova"
    KOVA_BACKEND_IAM_ROLE_ARN: "arn:aws:iam::851725519214:role/test-kova-backend-role"

release_prod_aws:
  variables:
    LLM_PROVIDER: "bedrock"
    AGENT_MODEL: "us.anthropic.claude-opus-4-6-v1:0"  # Use Opus in prod
    K8S_ENVIRONMENT: "eks-ops-prod"
    K8S_OPS_CLUSTER_CONTEXT: "arn:aws:eks:us-east-1:851725519214:cluster/prod-eks-ops"
    K8S_OPS_CLUSTER_NAMESPACE: "kova-apps"
    PREVIEW_DOMAIN: "kova-apps.eks.prod.tk.dev"
    DATABASE_URL: "postgresql://kova:${DB_PASSWORD}@prod-kova-pg.rds.amazonaws.com/kova"
    KOVA_BACKEND_IAM_ROLE_ARN: "arn:aws:iam::851725519214:role/prod-kova-backend-role"
```

### 1.3 Build Considerations

**Docker Image**:
- Use multi-stage build for smaller images
- Copy only necessary files (dist, node_modules, package.json)
- Use Bun in production for better performance

**Optimized Dockerfile** (backend/Dockerfile):
```dockerfile
# Stage 1: Build
FROM oven/bun:1.2-alpine AS builder
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production
COPY . .
RUN bun run build

# Stage 2: Production
FROM oven/bun:1.2-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3002
CMD ["bun", "run", "dist/index.js"]
```

## 2. Helm Chart Requirements

### 2.1 Helm Chart Structure

**Directory**: `helm/kova/`

```
helm/kova/
├── Chart.yaml
├── values-default.yaml
├── values-dev.yaml
├── values-test.yaml
├── values-prod.yaml
└── templates/
    ├── deployment.yaml
    ├── service.yaml
    ├── serviceaccount.yaml
    ├── secret.yaml (for ops kubeconfig)
    └── ingress.yaml (Istio VirtualService)
```

### 2.2 Chart.yaml

```yaml
apiVersion: v2
name: kova
description: Spreetail AI app builder
type: application
version: 0.9.0
appVersion: "0.9.0"
```

### 2.3 values-default.yaml

```yaml
applicationName: kova
applicationSubdomain: kova

# Image configuration (set by CI/CD)
deployment:
  image:
    repository: 851725519214.dkr.ecr.us-east-1.amazonaws.com/kova/kova-backend
    tag: latest
    pullPolicy: IfNotPresent

  replicas: 2  # HA for production readiness

  ports:
    containerPort: 3002
    name: http

  # Resource requests/limits
  resources:
    requests:
      cpu: 500m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 1Gi

  # Health checks
  livenessProbe:
    enabled: true
    httpGet:
      path: /health
      port: http
    initialDelaySeconds: 30
    periodSeconds: 30
    timeoutSeconds: 10
    failureThreshold: 3

  readinessProbe:
    enabled: true
    httpGet:
      path: /health
      port: http
    initialDelaySeconds: 10
    periodSeconds: 10
    timeoutSeconds: 5
    failureThreshold: 3

  # Environment variables (overridden by CI/CD HELM_ARGS)
  env: {}

  # Service account for Pod Identity
  serviceAccount:
    create: true
    name: kova-backend
    annotations: {}  # eks.amazonaws.com/role-arn set by CI/CD

  # Volume mounts for ops cluster kubeconfig
  volumes: []
  volumeMounts: []

# Service configuration
service:
  type: ClusterIP
  port: 80
  targetPort: http

# Istio ingress configuration
ingress:
  enabled: true
  className: istio
  hosts:
    - host: kova.eks.dev01.tk.dev
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: kova-tls
      hosts:
        - kova.eks.dev01.tk.dev
```

### 2.4 values-dev.yaml

```yaml
deployment:
  replicas: 1  # Single replica in dev for cost savings

  resources:
    requests:
      cpu: 250m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

ingress:
  hosts:
    - host: kova.eks.dev01.tk.dev
      paths:
        - path: /
          pathType: Prefix
```

### 2.5 templates/deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Values.applicationName }}
  namespace: {{ .Values.namespace }}
  labels:
    app: {{ .Values.applicationName }}
spec:
  replicas: {{ .Values.deployment.replicas }}
  selector:
    matchLabels:
      app: {{ .Values.applicationName }}
  template:
    metadata:
      labels:
        app: {{ .Values.applicationName }}
    spec:
      serviceAccountName: {{ .Values.deployment.serviceAccount.name }}

      containers:
      - name: {{ .Values.applicationName }}
        image: {{ .Values.deployment.image.repository }}:{{ .Values.deployment.image.tag }}
        imagePullPolicy: {{ .Values.deployment.image.pullPolicy }}

        ports:
        - name: {{ .Values.deployment.ports.name }}
          containerPort: {{ .Values.deployment.ports.containerPort }}
          protocol: TCP

        env:
        {{- range $key, $value := .Values.deployment.env }}
        - name: {{ $key }}
          value: {{ $value | quote }}
        {{- end }}
        - name: KUBECONFIG
          value: "/etc/kubernetes/ops/kubeconfig"

        resources:
          {{- toYaml .Values.deployment.resources | nindent 10 }}

        {{- if .Values.deployment.livenessProbe.enabled }}
        livenessProbe:
          {{- toYaml .Values.deployment.livenessProbe | nindent 10 }}
        {{- end }}

        {{- if .Values.deployment.readinessProbe.enabled }}
        readinessProbe:
          {{- toYaml .Values.deployment.readinessProbe | nindent 10 }}
        {{- end }}

        volumeMounts:
        {{- toYaml .Values.deployment.volumeMounts | nindent 8 }}

      volumes:
      {{- toYaml .Values.deployment.volumes | nindent 6 }}
```

### 2.6 templates/serviceaccount.yaml

```yaml
{{- if .Values.deployment.serviceAccount.create }}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ .Values.deployment.serviceAccount.name }}
  namespace: {{ .Values.namespace }}
  annotations:
    {{- toYaml .Values.deployment.serviceAccount.annotations | nindent 4 }}
{{- end }}
```

## 3. Cross-Cluster Access Setup

### 3.1 Architecture Pattern

**Problem**: Kova backend in `dev01-eks-kova` needs to create/manage pods in `dev01-eks-ops`

**Solution**: Cross-cluster kubectl access via:
1. **Pod Identity**: IAM role for authentication to ops cluster
2. **RBAC**: ClusterRole in ops cluster granting pod CRUD permissions
3. **Kubeconfig**: Mounted secret with ops cluster configuration

### 3.2 IAM Role Setup (Kova Cluster)

**Role Name**: `dev-kova-backend-role`

**Trust Policy** (allows Pod Identity):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "pods.eks.amazonaws.com"
      },
      "Action": [
        "sts:AssumeRole",
        "sts:TagSession"
      ]
    }
  ]
}
```

**IAM Policy** (Bedrock + EKS access):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockAccess",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-*"
      ]
    },
    {
      "Sid": "EKSOpsClusterAccess",
      "Effect": "Allow",
      "Action": [
        "eks:DescribeCluster"
      ],
      "Resource": [
        "arn:aws:eks:us-east-1:851725519214:cluster/dev01-eks-ops"
      ]
    }
  ]
}
```

**Pod Identity Association** (EKS):
```bash
aws eks create-pod-identity-association \
  --cluster-name dev01-eks-kova \
  --namespace kova \
  --service-account kova-backend \
  --role-arn arn:aws:iam::851725519214:role/dev-kova-backend-role \
  --region us-east-1
```

### 3.3 RBAC Setup (Ops Cluster)

**Apply in `dev01-eks-ops` cluster**:

**ClusterRole** (pod management permissions):
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kova-orchestrator
rules:
# Pod management
- apiGroups: [""]
  resources: ["pods", "pods/log", "pods/status"]
  verbs: ["create", "get", "list", "watch", "delete", "update", "patch"]

# Deployment management (for user apps)
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["create", "get", "list", "watch", "delete", "update", "patch"]

# Service management (NodePort services for apps)
- apiGroups: [""]
  resources: ["services"]
  verbs: ["create", "get", "list", "watch", "delete", "update", "patch"]

# Istio VirtualService management (for preview URLs)
- apiGroups: ["networking.istio.io"]
  resources: ["virtualservices"]
  verbs: ["create", "get", "list", "watch", "delete", "update", "patch"]

# Namespace operations
- apiGroups: [""]
  resources: ["namespaces"]
  verbs: ["get", "list"]

# Events (for debugging)
- apiGroups: [""]
  resources: ["events"]
  verbs: ["get", "list", "watch"]
```

**ClusterRoleBinding** (bind to Kova's IAM role):
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: kova-orchestrator-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: kova-orchestrator
subjects:
# This binds to the IAM role via AWS auth mapping
- kind: User
  name: arn:aws:iam::851725519214:role/dev-kova-backend-role
  apiGroup: rbac.authorization.k8s.io
```

**AWS Auth ConfigMap Update** (ops cluster):
```bash
# Add Kova IAM role to aws-auth ConfigMap in dev01-eks-ops
kubectl edit -n kube-system configmap/aws-auth

# Add this under mapRoles:
- rolearn: arn:aws:iam::851725519214:role/dev-kova-backend-role
  username: kova-backend
  groups:
    - system:authenticated
```

### 3.4 Kubeconfig Secret

**Generate kubeconfig for ops cluster**:
```bash
# Generate kubeconfig for dev01-eks-ops
aws eks update-kubeconfig \
  --region us-east-1 \
  --name dev01-eks-ops \
  --kubeconfig /tmp/ops-kubeconfig

# Create secret in kova cluster
kubectl create secret generic ops-kubeconfig \
  --from-file=kubeconfig=/tmp/ops-kubeconfig \
  --namespace=kova \
  --context=dev01-eks-kova

# Clean up temp file
rm /tmp/ops-kubeconfig
```

**Secret structure**:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: ops-kubeconfig
  namespace: kova
type: Opaque
data:
  kubeconfig: <base64-encoded kubeconfig>
```

## 4. Backend Configuration Updates

### 4.1 New Environment Variables

Add to `backend/src/config/index.ts`:

```typescript
// Cross-cluster orchestration
K8S_OPS_CLUSTER_CONTEXT: z.string().optional(),
K8S_OPS_CLUSTER_NAMESPACE: z.string().default("kova-apps"),
```

### 4.2 K8s Environment Service Update

Update `backend/src/services/k8s-environment.service.ts`:

```typescript
export type K8sEnvironment = "local" | "eks-ops-dev" | "eks-ops-test" | "eks-ops-prod";

const ENVIRONMENT_DEFAULTS: Record<K8sEnvironment, EnvironmentDefaults> = {
  local: {
    context: "k3d-kova-dev",
    namespace: "kova-apps",
    previewDomain: "dev.toolkit.co",
    previewPort: 8443,
  },

  // Kova in dev01-eks-kova, orchestrates in dev01-eks-ops
  "eks-ops-dev": {
    context: "arn:aws:eks:us-east-1:851725519214:cluster/dev01-eks-ops",
    namespace: "kova-apps",
    previewDomain: "kova-apps.eks.dev01.tk.dev",
    previewPort: 443,
  },

  // Similar for test and prod...
};
```

### 4.3 Orchestrator Context Override

Update `backend/src/services/orchestrator/kubectl.orchestrator.ts`:

```typescript
// Use K8S_OPS_CLUSTER_CONTEXT if provided (cross-cluster mode)
const context = config.K8S_OPS_CLUSTER_CONTEXT || k8sEnv.context;

// When using cross-cluster, kubectl uses the mounted kubeconfig
// KUBECONFIG env var set to /etc/kubernetes/ops/kubeconfig
```

## 5. User App Pod Configuration

### 5.1 App Container ServiceAccount

**Applied in ops cluster** (`dev01-eks-ops`):

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kova-app-container
  namespace: kova-apps
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::851725519214:role/dev-kova-app-role
```

### 5.2 App Container IAM Role

**Role Name**: `dev-kova-app-role`

**Trust Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "pods.eks.amazonaws.com"
      },
      "Action": [
        "sts:AssumeRole",
        "sts:TagSession"
      ]
    }
  ]
}
```

**IAM Policy** (Bedrock access only):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockAccess",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-*"
      ]
    }
  ]
}
```

### 5.3 Orchestrator Update

Update `kubectl.orchestrator.ts` to use cross-cluster ServiceAccount:

```typescript
// In createDeploymentManifest()
spec: {
  serviceAccountName: "kova-app-container",  // Use dedicated SA for apps
  hostNetwork: true,  // For VPN compatibility (local only?)
  // ...
}
```

## 6. Security Considerations

### 6.1 Least Privilege

**Kova Backend Role**:
- ✅ Bedrock access (LLM calls)
- ✅ EKS:DescribeCluster (ops cluster metadata)
- ❌ NO pod management (handled by RBAC in ops cluster)
- ❌ NO AWS resource creation beyond Bedrock

**App Container Role**:
- ✅ Bedrock access only
- ❌ NO EKS access
- ❌ NO pod creation
- ❌ NO AWS resource access

### 6.2 Network Segmentation

**Kova Cluster** (`dev01-eks-kova`):
- Public subnet for LoadBalancer (UI access)
- Private subnet for pods
- Security group: Allow outbound to ops cluster API

**Ops Cluster** (`dev01-eks-ops`):
- Private subnet only
- Security group: Allow inbound from kova cluster
- Istio Gateway for user app preview URLs

### 6.3 Secrets Management

**Sensitive Data**:
- Database passwords: GitLab CI/CD variables (masked)
- JWT secret: GitLab CI/CD variables (masked)
- Encryption key: GitLab CI/CD variables (masked)
- Ops kubeconfig: Kubernetes Secret (mounted read-only)
- AWS credentials: Pod Identity (no secrets in cluster)

**Best Practices**:
- ✅ Use GitLab masked variables for secrets
- ✅ Never commit secrets to git
- ✅ Rotate secrets regularly
- ✅ Use AWS Secrets Manager for production (future enhancement)

## 7. Deployment Flow

### 7.1 Initial Setup (One-Time)

```bash
# 1. Create IAM roles
aws iam create-role --role-name dev-kova-backend-role --assume-role-policy-document file://trust-policy.json
aws iam create-policy --policy-name KovaBackendPolicy --policy-document file://backend-policy.json
aws iam attach-role-policy --role-name dev-kova-backend-role --policy-arn arn:aws:iam::851725519214:policy/KovaBackendPolicy

aws iam create-role --role-name dev-kova-app-role --assume-role-policy-document file://trust-policy.json
aws iam create-policy --policy-name KovaAppPolicy --policy-document file://app-policy.json
aws iam attach-role-policy --role-name dev-kova-app-role --policy-arn arn:aws:iam::851725519214:policy/KovaAppPolicy

# 2. Create Pod Identity associations
aws eks create-pod-identity-association \
  --cluster-name dev01-eks-kova \
  --namespace kova \
  --service-account kova-backend \
  --role-arn arn:aws:iam::851725519214:role/dev-kova-backend-role

aws eks create-pod-identity-association \
  --cluster-name dev01-eks-ops \
  --namespace kova-apps \
  --service-account kova-app-container \
  --role-arn arn:aws:iam::851725519214:role/dev-kova-app-role

# 3. Apply RBAC in ops cluster
kubectl apply -f rbac-ops-cluster.yaml --context=dev01-eks-ops-ro

# 4. Update aws-auth ConfigMap
kubectl edit -n kube-system configmap/aws-auth --context=dev01-eks-ops-ro

# 5. Create ops kubeconfig secret
aws eks update-kubeconfig --name dev01-eks-ops --kubeconfig /tmp/ops-kubeconfig
kubectl create secret generic ops-kubeconfig \
  --from-file=kubeconfig=/tmp/ops-kubeconfig \
  --namespace=kova \
  --context=dev01-eks-kova

# 6. Create kova-apps namespace in ops cluster
kubectl create namespace kova-apps --context=dev01-eks-ops-ro
kubectl apply -f app-serviceaccount.yaml --context=dev01-eks-ops-ro
```

### 7.2 CI/CD Deployment Flow

```
┌─────────────────────────────────────────────────────────┐
│ GitLab CI/CD Pipeline                                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. fetch_dependencies                                  │
│     └─> bun install                                     │
│                                                         │
│  2. npm_run_test                                        │
│     └─> bun test                                        │
│                                                         │
│  3. npm_run_lint                                        │
│     └─> bun run lint                                    │
│                                                         │
│  4. npm_run_build                                       │
│     └─> bun run build:backend                           │
│                                                         │
│  5. image_build                                         │
│     └─> docker build -t kova-backend:${CI_PIPELINE_IID} │
│     └─> docker push to dev ECR                          │
│                                                         │
│  6. secret_detection_scan (GitLeaks)                    │
│                                                         │
│  7. dependency_scan (Snyk)                              │
│                                                         │
│  8. sast_scan (Snyk)                                    │
│                                                         │
│  9. image_scan (Snyk)                                   │
│                                                         │
│ 10. release_dev_aws (MANUAL)                            │
│     └─> helm upgrade --install kova                     │
│         --namespace kova                                │
│         --values helm/kova/values-default.yaml          │
│         --values helm/kova/values-dev.yaml              │
│         --set deployment.image.tag=${CI_PIPELINE_IID}   │
│         --set deployment.env.* (all runtime config)     │
│         --context dev01-eks-kova                        │
│                                                         │
│ 11. release_test_aws (MANUAL, on main branch)           │
│                                                         │
│ 12. release_prod_aws (MANUAL, on main branch)           │
│     └─> docker-publish (promote image to prod ECR)     │
│     └─> helm upgrade (to prod cluster)                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 7.3 Verification Steps

```bash
# 1. Check backend pod is running
kubectl get pods -n kova --context=dev01-eks-kova

# 2. Check backend can assume IAM role
kubectl exec -it kova-backend-xxx -n kova --context=dev01-eks-kova -- \
  aws sts get-caller-identity
# Should show: arn:aws:iam::851725519214:role/dev-kova-backend-role

# 3. Check backend can access ops cluster
kubectl exec -it kova-backend-xxx -n kova --context=dev01-eks-kova -- \
  kubectl get nodes --kubeconfig=/etc/kubernetes/ops/kubeconfig
# Should list dev01-eks-ops nodes

# 4. Create test app via UI
# Check pod created in ops cluster
kubectl get pods -n kova-apps --context=dev01-eks-ops-ro

# 5. Check app pod can assume IAM role
kubectl exec -it kova-app-5-xxx -n kova-apps --context=dev01-eks-ops-ro -- \
  aws sts get-caller-identity
# Should show: arn:aws:iam::851725519214:role/dev-kova-app-role

# 6. Check Bedrock access works
kubectl logs -f kova-app-5-xxx -n kova-apps --context=dev01-eks-ops-ro
# Should see successful Bedrock API calls
```

## 8. Migration Path

### Phase 1: Local Development (Current)
```bash
# k3d cluster
bun run cluster:up
bun run dev:full
```

### Phase 2: Deploy to EKS Dev
```bash
# Push to GitLab
git push origin feat/eks-deployment

# Trigger pipeline
# In GitLab UI: Run release_dev_aws job manually
```

### Phase 3: Verify Cross-Cluster Orchestration
```bash
# Create test app via Kova UI
# Verify pod created in ops cluster
# Verify Bedrock access works
# Verify preview URL accessible
```

### Phase 4: Deploy to Test/Prod
```bash
# Merge to main
git checkout main
git merge feat/eks-deployment
git push origin main

# In GitLab UI: Run release_test_aws, then release_prod_aws
```

## 9. Outstanding Questions & Next Steps

### Questions for Discussion

1. **PostgreSQL Database**:
   - Use RDS or run in cluster?
   - If RDS: Need connection details for each environment
   - If in-cluster: Need PersistentVolume configuration

2. **Istio Gateway**:
   - Already deployed in ops cluster?
   - What's the Gateway configuration?
   - TLS certificate setup?

3. **Monitoring & Logging**:
   - DataDog integration needed?
   - CloudWatch logs configuration?
   - Metrics collection (Prometheus?)

4. **Backup & Disaster Recovery**:
   - Database backup strategy?
   - Cluster state backup (Velero?)

5. **Autoscaling**:
   - HPA for backend pods?
   - Cluster autoscaling (Karpenter?)

### Next Steps

#### Immediate (Before Implementation)
- [ ] Review and approve this plan
- [ ] Confirm cluster names and namespaces
- [ ] Get database connection strings
- [ ] Verify Istio Gateway setup
- [ ] Confirm IAM role naming conventions

#### Implementation Tasks
- [ ] Create IAM roles and policies
- [ ] Set up Pod Identity associations
- [ ] Apply RBAC in ops cluster
- [ ] Create ops kubeconfig secret
- [ ] Create Helm charts
- [ ] Write .gitlab-ci.yml
- [ ] Test in dev environment

#### Post-Deployment
- [ ] Monitor logs for errors
- [ ] Verify cross-cluster access works
- [ ] Create runbook for common issues
- [ ] Set up alerts and dashboards
- [ ] Document operational procedures

## Appendix A: Resource Checklist

### AWS Resources Needed

**IAM Roles**:
- [ ] `dev-kova-backend-role` (in kova cluster)
- [ ] `dev-kova-app-role` (in ops cluster)
- [ ] `test-kova-backend-role`
- [ ] `test-kova-app-role`
- [ ] `prod-kova-backend-role`
- [ ] `prod-kova-app-role`

**IAM Policies**:
- [ ] KovaBackendPolicy (Bedrock + EKS describe)
- [ ] KovaAppPolicy (Bedrock only)

**Pod Identity Associations**:
- [ ] kova-backend in dev01-eks-kova
- [ ] kova-app-container in dev01-eks-ops
- [ ] Similar for test and prod

**RDS Databases** (if using RDS):
- [ ] dev-kova-pg (dev environment)
- [ ] test-kova-pg (test environment)
- [ ] prod-kova-pg (prod environment)

### Kubernetes Resources Needed

**In Kova Cluster** (`dev01-eks-kova`):
- [ ] Namespace: `kova`
- [ ] ServiceAccount: `kova-backend`
- [ ] Secret: `ops-kubeconfig`
- [ ] Deployment: `kova`
- [ ] Service: `kova`
- [ ] Ingress/VirtualService: `kova`

**In Ops Cluster** (`dev01-eks-ops`):
- [ ] Namespace: `kova-apps`
- [ ] ServiceAccount: `kova-app-container`
- [ ] ClusterRole: `kova-orchestrator`
- [ ] ClusterRoleBinding: `kova-orchestrator-binding`
- [ ] AWS auth ConfigMap update (add Kova IAM role)

### GitLab CI/CD Variables

**Project Variables** (masked):
- [ ] `ANTHROPIC_API_KEY` (dev/test/prod)
- [ ] `JWT_SECRET` (dev/test/prod)
- [ ] `ENCRYPTION_KEY` (dev/test/prod)
- [ ] `DB_PASSWORD` (dev/test/prod)
- [ ] `PROGET_API_KEY`
- [ ] `DATA_PLATFORM_PASSWORD`

## Appendix B: Troubleshooting Guide

### Backend Pod Can't Assume IAM Role

**Symptom**: `kubectl exec aws sts get-caller-identity` fails

**Checks**:
```bash
# 1. Verify ServiceAccount has annotation
kubectl get sa kova-backend -n kova -o yaml --context=dev01-eks-kova
# Should have: eks.amazonaws.com/role-arn

# 2. Verify Pod Identity association exists
aws eks list-pod-identity-associations \
  --cluster-name dev01-eks-kova \
  --namespace kova

# 3. Check pod logs for IAM errors
kubectl logs -f kova-backend-xxx -n kova --context=dev01-eks-kova
```

### Backend Can't Access Ops Cluster

**Symptom**: `kubectl get nodes` fails with authentication error

**Checks**:
```bash
# 1. Verify ops kubeconfig secret exists
kubectl get secret ops-kubeconfig -n kova --context=dev01-eks-kova

# 2. Verify secret is mounted correctly
kubectl describe pod kova-backend-xxx -n kova --context=dev01-eks-kova
# Check Mounts section

# 3. Verify KUBECONFIG env var is set
kubectl exec kova-backend-xxx -n kova --context=dev01-eks-kova -- env | grep KUBECONFIG

# 4. Verify Kova IAM role is in aws-auth ConfigMap
kubectl get cm aws-auth -n kube-system -o yaml --context=dev01-eks-ops-ro
# Should include dev-kova-backend-role
```

### User App Pods Can't Call Bedrock

**Symptom**: Agent queries fail with authentication errors

**Checks**:
```bash
# 1. Verify app pod has correct ServiceAccount
kubectl get pod kova-app-5-xxx -n kova-apps -o yaml --context=dev01-eks-ops-ro
# Should use: serviceAccountName: kova-app-container

# 2. Verify ServiceAccount has Pod Identity annotation
kubectl get sa kova-app-container -n kova-apps -o yaml --context=dev01-eks-ops-ro

# 3. Check app pod can assume role
kubectl exec kova-app-5-xxx -n kova-apps --context=dev01-eks-ops-ro -- \
  aws sts get-caller-identity

# 4. Check IAM role has Bedrock permissions
aws iam get-role-policy --role-name dev-kova-app-role --policy-name KovaAppPolicy
```

---

**Status**: Ready for review and implementation
**Last Updated**: 2026-02-06
**Author**: Claude (AI Agent) + Gabe
**Reviewers**: TBD
