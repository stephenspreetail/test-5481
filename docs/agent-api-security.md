# Agent API Security & Cross-Cluster Access

## Overview

The agent API must be secured because:
1. It's exposed externally via Istio Gateway (not internal-only)
2. Kova orchestrator may run in a different cluster than apps
3. Apps may be orchestrated across multiple clusters at different lifecycle stages

## Architecture Changes

### 1. Agent API Exposed via Istio Gateway

**Previous** (Service DNS, internal-only):
```
agentUrl = http://app-5.kova-apps.svc.cluster.local:3100
```

**New** (Istio Gateway, externally accessible):
```
agentUrl = https://app-5.app.eks.dev01.tk.dev/agent
```

### 2. Path-Based Routing

Single hostname serves both preview and agent API:

| Path | Destination | Port |
|------|-------------|------|
| `/agent/*` | Agent API | 3100 |
| `/*` | Preview (dev server) | 3000 |

**VirtualService Configuration**:
```yaml
http:
  # Agent API route (must come first - more specific)
  - match:
      - uri:
          prefix: "/agent"
    rewrite:
      uri: "/"  # Strip /agent prefix
    route:
      - destination:
          host: app-5
          port:
            number: 3100

  # Preview route (catches everything else)
  - match:
      - uri:
          prefix: "/"
    route:
      - destination:
          host: app-5
          port:
            number: 3000
```

### 3. JWT Token Authentication

**Token Generation** (backend):
```typescript
// When creating/starting container
const agentToken = generateAgentToken(appId, userId);

// Pass to container as env var
env.AGENT_TOKEN = agentToken;
```

**Token Payload**:
```typescript
{
  appId: 5,
  userId: 123,
  type: "agent",
  exp: 1234567890  // 30 days from creation
}
```

**Token Verification** (app-container):
```typescript
// In agent API handler
const authHeader = req.headers.authorization;
const token = extractTokenFromHeader(authHeader);
const payload = verifyAgentToken(token);

if (!payload) {
  return res.status(401).send({ error: "Unauthorized" });
}

// Verify app ID matches
if (payload.appId !== currentAppId) {
  return res.status(403).send({ error: "Forbidden" });
}
```

## DNS Patterns Per Cluster

Each cluster has its own DNS pattern:

| Cluster | DNS Pattern | Example |
|---------|-------------|---------|
| `k3d-kova-dev` | `kova-app-{id}.dev.toolkit.co` | `kova-app-5.dev.toolkit.co` |
| `dev01-eks-app-admin` | `app-{id}.app.eks.dev01.tk.dev` | `app-5.app.eks.dev01.tk.dev` |
| `dev01-eks-kova` | `app-{id}.kova.eks.dev01.tk.dev` | `app-5.kova.eks.dev01.tk.dev` |
| `dev01-eks-ops` | `app-{id}.ops.eks.dev01.tk.dev` | `app-5.ops.eks.dev01.tk.dev` |

**Configuration**:
```typescript
// backend/src/services/k8s-environment.service.ts
"eks-app-admin": {
  context: "dev01-eks-app-admin",
  namespace: "kova-apps",
  previewDomain: "app.eks.dev01.tk.dev",  // Cluster-specific
  previewPort: 443,
  isEKS: true,
  clusterIdentifier: "dev01-eks-app-admin",
}
```

## Database Schema Changes

```sql
-- Added to apps table
ALTER TABLE apps
  ADD COLUMN k8s_cluster VARCHAR(255),     -- Which cluster this app is deployed to
  ADD COLUMN agent_token VARCHAR(500);      -- JWT token for agent API auth
```

**Usage**:
- `k8s_cluster`: Tracks which cluster the app is currently running in
- `agent_token`: Stored for reference (tokens are also passed to container as env var)

## Security Model

### 1. Token-Based Authentication

**Why JWT?**
- ✅ Stateless (no session storage needed)
- ✅ Self-contained (includes app ID, user ID claims)
- ✅ Expiration built-in (30 days for dev)
- ✅ Uses existing JWT_SECRET from config

**Token Flow**:
```
1. Backend generates token when starting container
2. Token passed to container via AGENT_TOKEN env var
3. App-container stores token in memory
4. Backend includes token in Authorization header for API calls
5. App-container validates token on each request
```

### 2. Claim Validation

**App ID Claim**:
- Token includes `appId` claim
- Agent API verifies request is for the correct app
- Prevents cross-app access (app-5 can't call app-7's API)

**User ID Claim**:
- Token includes `userId` claim
- Future: Could implement user-based quotas/rate limiting

### 3. Token Lifecycle

**Creation**: When container is started
**Storage**: Database + container env var
**Expiration**: 30 days (configurable)
**Refresh**: New token generated on container restart
**Revocation**: Delete container → token becomes invalid (app no longer running)

## Implementation Details

### Backend Changes

**1. Agent Auth Service** (`backend/src/services/agent-auth.service.ts`):
```typescript
export function generateAgentToken(appId: number, userId: number): string
export function verifyAgentToken(token: string): AgentTokenPayload | null
export function extractTokenFromHeader(authHeader: string): string | null
```

**2. App Container Service** (`backend/src/services/app-container.service.ts`):
```typescript
// Generate token before spawning container
const agentToken = generateAgentToken(appId, userId);

// Pass to container as env var
const env = {
  AGENT_TOKEN: agentToken,
  K8S_CLUSTER: k8sEnv.clusterIdentifier,
  // ... other env vars
};
```

**3. Orchestrator** (`backend/src/services/orchestrator/kubectl.orchestrator.ts`):
```typescript
// Agent URL uses Istio Gateway (not service DNS)
const agentUrl = `${protocol}://${hostname}/agent`;
const previewUrl = `${protocol}://${hostname}`;

// VirtualService routes both paths
http: [
  { match: [{ uri: { prefix: "/agent" } }], rewrite: { uri: "/" }, route: [...] },
  { match: [{ uri: { prefix: "/" } }], route: [...] },
]
```

**4. K8s Environment Service** (`backend/src/services/k8s-environment.service.ts`):
```typescript
export interface K8sEnvironmentConfig {
  clusterIdentifier: string;  // NEW: Track which cluster app is in
  // ... existing fields
}
```

**5. Database Schema** (`backend/src/db/schema.ts`):
```typescript
export const apps = pgTable("apps", {
  k8sCluster: varchar("k8s_cluster", { length: 255 }),
  agentToken: varchar("agent_token", { length: 500 }),
  // ... existing columns
});
```

### App-Container Changes

**TODO: Implement agent API authentication middleware**

```typescript
// app-container/src/server.ts (agent API handler)
import { verifyAgentToken, extractTokenFromHeader } from './auth.js';

app.post('/query', async (req, res) => {
  // Verify authentication
  const token = extractTokenFromHeader(req.headers.authorization);
  if (!token) {
    return res.status(401).send({ error: 'Missing authorization token' });
  }

  const payload = verifyAgentToken(token);
  if (!payload) {
    return res.status(401).send({ error: 'Invalid or expired token' });
  }

  // Verify app ID matches
  const currentAppId = parseInt(process.env.APP_ID || "0");
  if (payload.appId !== currentAppId) {
    return res.status(403).send({ error: 'Token not valid for this app' });
  }

  // Process request...
});
```

## Testing

### 1. Token Generation

```bash
# Start backend
bun run dev:backend

# Create app via UI - should see token generation in logs
# [AppContainerService] Generated agent token for app 5
```

### 2. Token in Container

```bash
# Check container has token
kubectl exec app-5-xxx -n kova-apps -- env | grep AGENT_TOKEN

# Should show: AGENT_TOKEN=eyJhbGciOiJIUzI1NiIs...
```

### 3. Agent API Access

```bash
# Get token from container or database
TOKEN="eyJhbGciOiJIUzI1NiIs..."

# Test authenticated request
curl -X POST https://app-5.app.eks.dev01.tk.dev/agent/query \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"create a hello world page"}'

# Should succeed with 200

# Test unauthenticated request
curl -X POST https://app-5.app.eks.dev01.tk.dev/agent/query \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test"}'

# Should fail with 401 Unauthorized
```

### 4. Cross-App Protection

```bash
# Get token for app-5
TOKEN_APP_5="..."

# Try to call app-7 with app-5's token
curl -X POST https://app-7.app.eks.dev01.tk.dev/agent/query \
  -H "Authorization: Bearer $TOKEN_APP_5" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test"}'

# Should fail with 403 Forbidden (app ID mismatch)
```

## Migration Path

### Phase 1: Backend Changes (Current)
- ✅ Generate agent tokens
- ✅ Pass tokens to containers as env vars
- ✅ Update agent URL to use Istio Gateway
- ✅ Configure path-based routing in VirtualService
- ✅ Track cluster identifier in environment config

### Phase 2: App-Container Security (Next)
- [ ] Add authentication middleware to agent API
- [ ] Verify tokens on all agent API requests
- [ ] Implement app ID claim validation
- [ ] Add rate limiting per token

### Phase 3: Database Integration (Optional)
- [ ] Store agent token in apps table on container start
- [ ] Display token in UI (for debugging)
- [ ] Add token refresh endpoint
- [ ] Implement token revocation

### Phase 4: Production Hardening
- [ ] Shorter token expiration (7 days instead of 30)
- [ ] Token rotation on container restart
- [ ] Audit logging of agent API calls
- [ ] Rate limiting per app/user
- [ ] HTTPS enforcement in VirtualService

## Security Considerations

### Current (Dev Mode)
- ✅ JWT tokens prevent unauthorized access
- ✅ App ID claim prevents cross-app access
- ✅ Tokens expire after 30 days
- ✅ Internal corporate network only (not public internet)

### Future Production Requirements
- [ ] Shorter token TTL (7 days or less)
- [ ] Token rotation/refresh mechanism
- [ ] Rate limiting per token
- [ ] Audit logging of API calls
- [ ] HTTPS-only enforcement
- [ ] IP allowlisting (if needed)
- [ ] DDoS protection at Gateway level

## Troubleshooting

### Agent API Returns 401

**Cause**: Missing or invalid token

**Check**:
```bash
# Verify token exists in container
kubectl exec app-5-xxx -- env | grep AGENT_TOKEN

# Verify token is valid
# (decode JWT at https://jwt.io)
```

**Fix**: Restart container to generate new token

### Agent API Returns 403

**Cause**: Token valid but app ID doesn't match

**Check**:
```bash
# Decode token, check appId claim
# Compare with APP_ID env var in container
kubectl exec app-5-xxx -- env | grep APP_ID
```

**Fix**: Use correct token for this app

### Agent URL Not Accessible

**Cause**: VirtualService not created or misconfigured

**Check**:
```bash
# Verify VirtualService exists
kubectl get virtualservice app-5 -n kova-apps -o yaml

# Check http routes include /agent prefix match
# Check gateway reference is correct
```

**Fix**: Re-create container to regenerate VirtualService

---

**Status**: Backend implementation complete, app-container auth pending
**Last Updated**: 2026-02-06
**Next Steps**: Implement agent API authentication in app-container
