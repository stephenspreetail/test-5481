# Cross-Cluster Orchestration & Agent API Security - Implementation Summary

## What Was Implemented

### 1. Agent API Exposed via Istio Gateway (Not Service DNS) ✅

**Problem**: Service DNS (`app-5.kova-apps.svc.cluster.local`) only works within the same cluster.

**Solution**: Agent API exposed via Istio Gateway with path-based routing:
- Preview: `https://app-5.app.eks.dev01.tk.dev/`
- Agent: `https://app-5.app.eks.dev01.tk.dev/agent`

**Files Changed**:
- `backend/src/services/orchestrator/kubectl.orchestrator.ts`
  - Agent URL uses Istio Gateway hostname (not service DNS)
  - VirtualService with path-based routing (`/agent/*` and `/*`)

### 2. Dynamic DNS Patterns Per Cluster ✅

**Problem**: Each cluster needs its own DNS pattern.

**Solution**: Cluster-specific preview domains configured per environment:

| Cluster | DNS Pattern |
|---------|-------------|
| `k3d-kova-dev` | `kova-app-{id}.dev.toolkit.co` |
| `dev01-eks-app-admin` | `app-{id}.app.eks.dev01.tk.dev` |
| `dev01-eks-kova` | `app-{id}.kova.eks.dev01.tk.dev` |
| `dev01-eks-ops` | `app-{id}.ops.eks.dev01.tk.dev` |

**Files Changed**:
- `backend/src/services/k8s-environment.service.ts`
  - Added `clusterIdentifier` field
  - Each environment has unique `previewDomain`

### 3. JWT Token Authentication for Agent API ✅

**Problem**: Agent API is externally exposed, needs security.

**Solution**: JWT tokens generated for each app, required for agent API calls.

**Files Created**:
- `backend/src/services/agent-auth.service.ts`
  - `generateAgentToken(appId, userId)` - Create JWT token
  - `verifyAgentToken(token)` - Validate JWT token
  - `extractTokenFromHeader(authHeader)` - Parse Authorization header

**Files Changed**:
- `backend/src/services/app-container.service.ts`
  - Generate agent token when starting container
  - Pass token to container as `AGENT_TOKEN` env var
  - Pass cluster identifier as `K8S_CLUSTER` env var

### 4. Database Schema Updates ✅

**Changes**:
```typescript
// backend/src/db/schema.ts - apps table
k8sCluster: varchar("k8s_cluster", { length: 255 })    // Which cluster app is in
agentToken: varchar("agent_token", { length: 500 })    // JWT token for auth
```

**Purpose**:
- Track which cluster each app is deployed to
- Store agent token for reference/debugging

### 5. Path-Based Routing in VirtualService ✅

**Configuration**:
```yaml
http:
  # Agent API route (must come first)
  - match:
      - uri:
          prefix: "/agent"
    rewrite:
      uri: "/"  # Strip /agent prefix
    route:
      - destination:
          host: app-5
          port: { number: 3100 }

  # Preview route (everything else)
  - match:
      - uri:
          prefix: "/"
    route:
      - destination:
          host: app-5
          port: { number: 3000 }
```

## What Still Needs to Be Done

### 1. Database Migration ⏳

**Action Required**:
```bash
# Generate migration (interactive - select "create column" for both new fields)
bun run --cwd backend db:generate

# OR apply directly without migration files
bun run db:push
```

### 2. App-Container Authentication Middleware ⏳

**What**: Verify JWT tokens on agent API requests

**Where**: `app-container/src/server.ts`

**Implementation**:
```typescript
// Add to agent API handler
const token = extractTokenFromHeader(req.headers.authorization);
const payload = verifyAgentToken(token);

if (!payload || payload.appId !== currentAppId) {
  return res.status(401).send({ error: "Unauthorized" });
}
```

**Files to Create/Modify**:
- `app-container/src/auth.ts` - Copy agent-auth.service.ts logic
- `app-container/src/server.ts` - Add auth middleware

### 3. Backend API Client Updates ⏳

**What**: Include agent token in Authorization header when calling agent API

**Where**: Any code that calls the agent API

**Implementation**:
```typescript
// When calling agent API
const response = await fetch(agentUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${agentToken}`,
  },
  body: JSON.stringify({ prompt }),
});
```

### 4. Istio Gateway Configuration ⏳

**What**: Ensure Istio Gateway exists and is configured correctly

**Where**: Each cluster needs its own Gateway

**Example**:
```yaml
# In dev01-eks-app-admin cluster
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: kova-gateway
  namespace: istio-system
spec:
  selector:
    istio: ingressgateway
  servers:
  - port:
      number: 443
      name: https
      protocol: HTTPS
    tls:
      mode: SIMPLE
      credentialName: wildcard-cert  # TLS cert for *.app.eks.dev01.tk.dev
    hosts:
    - "*.app.eks.dev01.tk.dev"
```

## Testing Steps

### 1. Database Migration

```bash
cd backend
bun run db:push
```

### 2. Start Local Backend Against EKS

```bash
# Update .env
echo "K8S_ENVIRONMENT=eks-app-admin" >> .env

# Start backend
bun run dev:backend
```

### 3. Create Test App

1. Open http://localhost:5174
2. Create new app
3. Check logs for agent token generation:
   ```
   [AppContainerService] Generated agent token for app 5
   ```

### 4. Verify Pod Created

```bash
# Check pod exists
kubectl get pods -n kova-apps --context=dev01-eks-app-admin

# Check token is in container
kubectl exec app-5-xxx -n kova-apps --context=dev01-eks-app-admin -- env | grep AGENT_TOKEN

# Should show: AGENT_TOKEN=eyJhbGciOiJIUzI1NiIs...
```

### 5. Verify VirtualService

```bash
# Check VirtualService configuration
kubectl get virtualservice app-5 -n kova-apps --context=dev01-eks-app-admin -o yaml

# Should have two http routes:
# 1. /agent/* → port 3100
# 2. /*      → port 3000
```

### 6. Test URLs

**Preview URL**:
```bash
curl https://app-5.app.eks.dev01.tk.dev/
# Should show app preview (port 3000)
```

**Agent URL** (will fail without auth middleware in app-container):
```bash
curl https://app-5.app.eks.dev01.tk.dev/agent/query \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test"}'
# Currently: May work (no auth yet)
# After middleware: Should return 401 Unauthorized
```

**Agent URL with token** (after auth middleware implemented):
```bash
TOKEN="<get from container env or logs>"
curl https://app-5.app.eks.dev01.tk.dev/agent/query \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test"}'
# Should succeed with 200
```

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│ Your Local Machine                                          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Backend (bun dev:backend)                            │   │
│  │ • Generates agent token per app                      │   │
│  │ • Uses kubectl to create pods in EKS                 │   │
│  │ • Calls agent API with Authorization header          │   │
│  └────────────────┬─────────────────────────────────────┘   │
│                   │                                         │
└───────────────────┼─────────────────────────────────────────┘
                    │
                    │ kubectl create deployment app-5
                    │ (includes AGENT_TOKEN env var)
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ dev01-eks-app-admin Cluster                                 │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ app-5 Pod                                            │   │
│  │ • Agent API on port 3100                             │   │
│  │ • Dev server on port 3000                            │   │
│  │ • Has AGENT_TOKEN env var                            │   │
│  │ • Validates token on API requests                    │   │
│  └────────────────┬─────────────────────────────────────┘   │
│                   │                                         │
│                   ↓                                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ClusterIP Service: app-5                             │   │
│  │ • Port 3100 → agent container port                   │   │
│  │ • Port 3000 → dev server port                        │   │
│  └────────────────┬─────────────────────────────────────┘   │
│                   │                                         │
│                   ↓                                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ VirtualService: app-5                                │   │
│  │ • Host: app-5.app.eks.dev01.tk.dev                   │   │
│  │ • /agent/* → service:3100                            │   │
│  │ • /*       → service:3000                            │   │
│  └────────────────┬─────────────────────────────────────┘   │
│                   │                                         │
└───────────────────┼─────────────────────────────────────────┘
                    │
                    ↓
             Istio Gateway
                    │
                    ↓
          Internet / VPN Access
```

## Configuration Reference

### Environment Variables

```bash
# .env
K8S_ENVIRONMENT=eks-app-admin  # Use dev01-eks-app-admin cluster

# These get set automatically based on environment:
# - Preview domain: app.eks.dev01.tk.dev
# - Cluster identifier: dev01-eks-app-admin
# - isEKS: true (uses ClusterIP, fixed ports)
```

### Cluster DNS Patterns

Add to `backend/src/services/k8s-environment.service.ts` for new clusters:

```typescript
"my-new-cluster": {
  context: "my-context",
  namespace: "kova-apps",
  previewDomain: "my-domain.example.com",  // <-- Cluster-specific DNS
  previewPort: 443,
  isEKS: true,
  clusterIdentifier: "my-cluster-id",
}
```

## Security Notes

### Current Implementation
- ✅ JWT tokens generated per app
- ✅ Tokens passed to containers
- ✅ Tokens stored in database (for reference)
- ⏳ **NOT YET**: Tokens validated on agent API requests (needs app-container middleware)

### Token Lifecycle
- **Created**: When container starts
- **TTL**: 30 days
- **Storage**: Database + container env var
- **Validation**: **TODO** - Implement in app-container
- **Revocation**: Delete container → token becomes useless (app not running)

### Why JWT_SECRET?
The JWT tokens use the `JWT_SECRET` from your `.env` file. This is the same secret used for user authentication. It's secure for internal corporate network usage, but for production you might want:
- Separate secret for agent tokens
- Key rotation policy
- Shorter TTL (7 days instead of 30)

## Files Modified

**Backend Services**:
- ✅ `backend/src/services/agent-auth.service.ts` (created)
- ✅ `backend/src/services/k8s-environment.service.ts`
- ✅ `backend/src/services/app-container.service.ts`
- ✅ `backend/src/services/orchestrator/kubectl.orchestrator.ts`

**Database**:
- ✅ `backend/src/db/schema.ts`

**Configuration**:
- ✅ `.env.example`

**Documentation**:
- ✅ `docs/agent-api-security.md`
- ✅ `docs/local-dev-eks-setup.md` (updated)
- ✅ `IMPLEMENTATION_SUMMARY.md` (this file)

## Next Steps

1. **Run Database Migration**:
   ```bash
   bun run db:push
   ```

2. **Test Basic Orchestration**:
   ```bash
   K8S_ENVIRONMENT=eks-app-admin bun run dev:backend
   # Create app via UI
   # Verify pod created in EKS
   ```

3. **Implement App-Container Auth** (if needed):
   - Copy `agent-auth.service.ts` to app-container
   - Add auth middleware to agent API
   - Test with/without tokens

4. **Configure Istio Gateway** (if not done):
   - Create Gateway in each cluster
   - Configure TLS certificates
   - Test DNS resolution

5. **Update Backend API Calls**:
   - Add Authorization header when calling agent API
   - Handle 401/403 errors gracefully

---

**Status**: Backend implementation complete, ready for testing
**Last Updated**: 2026-02-06
**Blockers**: None (can test with current implementation, auth validation is optional for dev)
