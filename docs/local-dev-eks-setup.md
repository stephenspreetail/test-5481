# Local Development Against dev01-eks-app-admin

## Overview

You can now run Kova locally (backend + frontend on your machine) while orchestrating user app pods in the real `dev01-eks-app-admin` EKS cluster. This is a stepping stone to understanding the full cross-cluster deployment pattern.

## What Changed

### Key Differences from Local k3d

| Aspect | Local (k3d) | EKS (dev01-eks-app-admin) |
|--------|-------------|---------------------------|
| **Networking** | `hostNetwork: true` | Standard pod networking |
| **Ports** | Unique per app (31000+appId) | Fixed (3100 agent, 3000 dev) |
| **Service Type** | NodePort | ClusterIP |
| **Agent Access** | Pod IP directly | Service DNS |
| **Preview URLs** | `kova-app-5.dev.toolkit.co:8443` | `app-5.app.eks.dev01.tk.dev` |
| **Deployment Strategy** | Recreate (avoid port conflicts) | RollingUpdate (zero-downtime) |

### Code Changes Summary

1. **New Environment**: Added `eks-app-admin` to `K8sEnvironment` type
2. **isEKS Flag**: Orchestrator now knows when it's in EKS mode
3. **Fixed Ports**: No port incrementing in EKS (always 3100/3000)
4. **ClusterIP Services**: Uses proper K8s service networking
5. **Service DNS**: Backend accesses apps via service DNS instead of pod IP
6. **Preview URLs**: Pattern changed to `app-{id}.app.eks.dev01.tk.dev`

## Setup Instructions

### 1. Prerequisites

```bash
# Verify you have the context
kubectl config get-contexts | grep dev01-eks-app-admin

# Verify you can access the cluster
kubectl get nodes --context=dev01-eks-app-admin

# Verify namespace exists
kubectl get namespace kova-apps --context=dev01-eks-app-admin

# If namespace doesn't exist, create it
kubectl create namespace kova-apps --context=dev01-eks-app-admin
```

### 2. Configure Environment

Update your `.env` file:

```bash
# LLM Provider (use whatever you have configured)
LLM_PROVIDER=azure
ANTHROPIC_API_KEY=your-key
# or LLM_PROVIDER=bedrock with AWS credentials

# Database (keep local or use dev RDS)
DATABASE_URL=postgresql://kova:kova_dev_password@localhost:5433/kova

# Security keys
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-encryption-key

# **NEW: Kubernetes Environment**
K8S_ENVIRONMENT=eks-app-admin

# Optional: Override context if needed
# K8S_CONTEXT=dev01-eks-app-admin

# Spreetail Internal
PROGET_API_KEY=your-proget-key
DATA_PLATFORM_HOST=spreetail.routing.trino.galaxy.starburst.io
DATA_PLATFORM_USER=your-user
DATA_PLATFORM_PASSWORD=your-password
```

### 3. Start Local Backend

```bash
# Start local PostgreSQL (if using local DB)
kubectl apply -f manifests/kova/ --context=k3d-kova-dev

# Run backend locally
bun run dev:backend

# In another terminal, run frontend
bun run dev:web
```

### 4. Create Test App

1. Open http://localhost:5174 in browser
2. Login with dev credentials
3. Create a new app
4. Backend will create pod in `dev01-eks-app-admin` cluster

### 5. Verify Deployment

```bash
# Check pod was created in EKS
kubectl get pods -n kova-apps --context=dev01-eks-app-admin

# Check service was created
kubectl get svc -n kova-apps --context=dev01-eks-app-admin

# Check VirtualService
kubectl get virtualservice -n kova-apps --context=dev01-eks-app-admin

# Check pod logs
kubectl logs -f app-5-xxx -n kova-apps --context=dev01-eks-app-admin
```

### 6. Access Preview URL

The preview URL will be: `https://app-5.app.eks.dev01.tk.dev`

**Note**: This requires:
- Istio Gateway deployed in the cluster
- DNS configured for `*.app.eks.dev01.tk.dev`
- TLS certificate for the domain

## Architecture

```
┌─────────────────────────────────┐
│ Your Local Machine              │
│                                 │
│  ┌──────────────────────────┐   │
│  │ Backend (bun dev)        │   │
│  │ Port: 3002               │   │
│  │ Uses kubectl to manage   │   │
│  │ pods in EKS cluster      │   │
│  └───────────┬──────────────┘   │
│              │                  │
│  ┌───────────▼──────────────┐   │
│  │ Frontend (Vite dev)      │   │
│  │ Port: 5174               │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘
              │
              │ kubectl
              │ (creates pods)
              ↓
┌─────────────────────────────────┐
│ dev01-eks-app-admin Cluster     │
│                                 │
│  ┌──────────────────────────┐   │
│  │ app-5 Pod                │   │
│  │ • Deployment             │   │
│  │ • Service (ClusterIP)    │   │
│  │ • PVC (workspace)        │   │
│  │ • VirtualService (Istio) │   │
│  └──────────────────────────┘   │
│                                 │
│  Preview: app-5.app.eks.dev01.tk.dev
└─────────────────────────────────┘
```

## Key Behaviors

### 1. Agent URL Construction

**Local k3d**:
```typescript
agentUrl = `http://${podIp}:${uniquePort}`;
// Example: http://10.42.0.5:30900
```

**EKS**:
```typescript
agentUrl = `http://${serviceName}.${namespace}.svc.cluster.local:3100`;
// Example: http://app-5.kova-apps.svc.cluster.local:3100
```

### 2. Service Creation

**Local k3d** (NodePort):
```yaml
spec:
  type: NodePort
  ports:
    - port: 30900
      targetPort: 30900
      nodePort: 30900  # Same as container port
```

**EKS** (ClusterIP):
```yaml
spec:
  type: ClusterIP
  ports:
    - port: 3100
      targetPort: 3100
      protocol: TCP
```

### 3. Deployment Strategy

**Local k3d**:
```yaml
strategy:
  type: Recreate  # Avoid hostNetwork port conflicts
```

**EKS**:
```yaml
strategy:
  type: RollingUpdate  # Zero-downtime updates
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
```

## Troubleshooting

### Pod Can't Be Created

```bash
# Check backend logs
bun run dev:backend
# Look for kubectl errors

# Verify kubectl context is correct
kubectl config current-context

# Check RBAC permissions
kubectl auth can-i create pods --namespace=kova-apps --context=dev01-eks-app-admin
```

### Agent URL Not Accessible

```bash
# From your local machine, you can't directly access ClusterIP services
# Backend accesses via kubectl port-forward internally (not implemented yet)
# Or backend needs to be IN the cluster

# Check service exists
kubectl get svc app-5 -n kova-apps --context=dev01-eks-app-admin

# Check pod is running
kubectl get pods -l kova.app-id=5 -n kova-apps --context=dev01-eks-app-admin
```

**Current Limitation**: Backend running locally can't access ClusterIP services in EKS directly. Solutions:

1. **kubectl port-forward** (implement in orchestrator)
2. **VPC Peering** (infrastructure change)
3. **Run backend in EKS** (full deployment)

For now, you may see connection errors when backend tries to call agent API.

### Preview URL Not Working

```bash
# Check VirtualService exists
kubectl get virtualservice app-5 -n kova-apps --context=dev01-eks-app-admin

# Check Istio Gateway
kubectl get gateway -n istio-system --context=dev01-eks-app-admin

# Check DNS resolution
nslookup app-5.app.eks.dev01.tk.dev

# Check TLS certificate
curl -v https://app-5.app.eks.dev01.tk.dev
```

## Next Steps

### Short Term
- [x] Configure local dev to orchestrate against EKS
- [ ] Test app creation in EKS
- [ ] Verify preview URLs work
- [ ] Add kubectl port-forward support for agent access

### Medium Term
- [ ] Deploy backend to `dev01-eks-kova` cluster
- [ ] Set up cross-cluster orchestration (kova → ops)
- [ ] Configure Pod Identity for Bedrock access
- [ ] Set up VPC Peering for service access

### Long Term
- [ ] Full EKS deployment with CI/CD
- [ ] Production rollout
- [ ] Multi-cluster support

## Environment Comparison

| Feature | Local k3d | Local→EKS | Backend in EKS (future) |
|---------|-----------|-----------|------------------------|
| Backend Location | Local | Local | EKS kova cluster |
| Apps Location | Local k3d | EKS app cluster | EKS ops cluster |
| Agent Access | Pod IP | **Service DNS*** | Service DNS |
| Preview Access | localhost:8081 | Istio Gateway | Istio Gateway |
| Networking | hostNetwork | ClusterIP | ClusterIP |
| Development Speed | ⚡ Fast | 🐢 Slower | 🐢 Slower |
| Production Parity | ❌ No | ⚠️ Partial | ✅ Yes |

*Service DNS access from local requires port-forward or VPC connectivity

---

**Status**: Ready for testing
**Last Updated**: 2026-02-06
**Related**: [eks-deployment-plan.md](./eks-deployment-plan.md)
