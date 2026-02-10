# Agent Container Authorization Architecture

## Overview

The agent container (running user apps) and Kova backend communicate via a **JWT token-based authorization system**. Since the agent API is exposed externally via Istio Gateway (not internal service DNS), it requires authentication to prevent unauthorized access.

## Token Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Container Creation                                       │
│    Kova Backend generates JWT token                         │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Token Storage                                            │
│    • Database: apps.agent_token column (reference)          │
│    • Container: AGENT_TOKEN env var (runtime use)           │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Backend → Agent API Calls                                │
│    Authorization: Bearer <token>                            │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Container Validates Token (TODO)                         │
│    • Verify JWT signature                                   │
│    • Check appId claim matches                              │
│    • Return 401/403 if invalid                              │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Token Generation (Backend)

**Location**: `backend/src/services/agent-auth.service.ts:24`

```typescript
export function generateAgentToken(appId: number, userId: number): string {
  const payload: AgentTokenPayload = {
    appId,         // Which app this token is for
    userId,        // Who created the app
    type: "agent", // Token type identifier
  };

  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: "30d",  // Long-lived for dev containers
  });
}
```

**When**: Token generated when container is created/started

**Triggered by**: `app-container.service.ts` when spawning new containers

### 2. Token Delivery to Container

**Location**: `backend/src/services/app-container.service.ts`

The token is passed as an environment variable:

```typescript
const agentToken = generateAgentToken(appId, userId);

const env = {
  AGENT_TOKEN: agentToken,                   // Token for auth
  K8S_CLUSTER: k8sEnv.clusterIdentifier,     // Which cluster
  APP_ID: appId.toString(),                  // App identifier
  // ... other env vars
};
```

**Storage**:
- **Database**: `apps.agent_token` column (for reference/debugging)
- **Container Runtime**: `AGENT_TOKEN` environment variable (for validation)

### 3. Backend → Agent API Communication

When Kova backend calls the agent API, it must include the token in the Authorization header:

```typescript
const response = await fetch(agentUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${agentToken}`,
  },
  body: JSON.stringify({ prompt }),
});
```

⏳ **Status**: NOT YET IMPLEMENTED - Backend does not currently send Authorization header

### 4. Token Verification (App-Container)

**Location**: `app-container/src/server.ts` (needs to be added)

⏳ **Status**: NOT YET IMPLEMENTED

**Required Implementation**:

```typescript
import { verifyAgentToken, extractTokenFromHeader } from './auth.js';

app.post('/query', async (req, res) => {
  // 1. Extract token from Authorization header
  const token = extractTokenFromHeader(req.headers.authorization);
  if (!token) {
    return res.status(401).send({ error: 'Missing authorization token' });
  }

  // 2. Verify token signature and expiration
  const payload = verifyAgentToken(token);
  if (!payload) {
    return res.status(401).send({ error: 'Invalid or expired token' });
  }

  // 3. Verify app ID matches this container
  const currentAppId = parseInt(process.env.APP_ID || "0");
  if (payload.appId !== currentAppId) {
    return res.status(403).send({
      error: 'Token not valid for this app',
      expectedAppId: currentAppId,
      tokenAppId: payload.appId
    });
  }

  // 4. Process request (token is valid)
  // ... handle agent query
});
```

**Required Files**:
- Copy `backend/src/services/agent-auth.service.ts` to `app-container/src/auth.ts`
- Add auth middleware to all agent API endpoints

## Token Claims

The JWT token contains the following claims:

```json
{
  "appId": 5,                  // Which app this token authorizes
  "userId": 123,               // User who created the app
  "type": "agent",             // Token type (vs "user" tokens)
  "iat": 1234567890,           // Issued at timestamp
  "exp": 1237246290            // Expiration (30 days later)
}
```

## Security Properties

### Protection Mechanisms

| Threat | Protection | Status |
|--------|-----------|--------|
| **Unauthorized access** | JWT signature verification (requires JWT_SECRET) | ✅ Backend generates<br>⏳ Container validates |
| **Cross-app access** | `appId` claim validation (app-5 can't call app-7) | ✅ Claims included<br>⏳ Validation pending |
| **Token expiration** | 30-day TTL (configurable) | ✅ Implemented |
| **Token reuse after deletion** | Container deletion invalidates token (app stops running) | ✅ Automatic |
| **Token theft** | HTTPS-only transport | ⏳ Istio Gateway config |

### Why JWT Tokens?

**Problem**: Agent API exposed via Istio Gateway means it's accessible from outside the pod (potentially cross-cluster). Service DNS (`app-5.kova-apps.svc.cluster.local`) would only work within the same cluster.

**Why JWT**:
- ✅ **Stateless authentication** (no session storage needed)
- ✅ **Self-contained claims** (app ID, user ID embedded)
- ✅ **Built-in expiration** (30 days for dev, configurable)
- ✅ **Reuses existing JWT_SECRET** (same as user authentication)
- ✅ **Standard format** (Bearer token in Authorization header)

## Network Context

The agent API is exposed via **path-based routing** on the same hostname as the preview:

| Path | Destination | Port | Purpose |
|------|-------------|------|---------|
| `/agent/*` | Agent API | 3100 | Kova backend → agent communication |
| `/*` | Preview | 3000 | User viewing their app in iframe |

**Example URLs** (for app ID 5 in `dev01-eks-app-admin` cluster):
- Preview: `https://app-5.app.eks.dev01.tk.dev/`
- Agent API: `https://app-5.app.eks.dev01.tk.dev/agent/query`

The VirtualService configuration strips the `/agent` prefix when routing to port 3100, so the agent container sees requests at `/query`, not `/agent/query`.

## Current Implementation Status

### ✅ Implemented

- Token generation in backend (`agent-auth.service.ts`)
- Token storage in database (`apps.agent_token` column)
- Token delivery to container (AGENT_TOKEN env var)
- Database schema includes `k8s_cluster` and `agent_token` columns
- VirtualService path-based routing for agent API

### ⏳ TODO

1. **App-Container Middleware**:
   - Copy `agent-auth.service.ts` → `app-container/src/auth.ts`
   - Add authentication middleware to agent API endpoints
   - Validate `appId` claim matches `APP_ID` env var

2. **Backend API Client**:
   - Include `Authorization: Bearer <token>` header in agent API calls
   - Retrieve token from database when making requests
   - Handle 401/403 responses gracefully

3. **Testing**:
   - Verify 401 response without token
   - Verify 403 response with wrong app's token
   - Verify 200 response with correct token
   - Test token expiration behavior

## Testing the Authorization Flow

### 1. Generate Token (Backend)

```bash
# Start backend - tokens generated on container creation
bun run dev:backend

# Create app via UI - check logs for:
# [AppContainerService] Generated agent token for app 5
```

### 2. Verify Token in Container

```bash
# Check token exists in container
kubectl exec app-5-xxx -n kova-apps --context=dev01-eks-app-admin -- env | grep AGENT_TOKEN

# Expected output:
# AGENT_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Test Authentication (After Middleware Implementation)

```bash
# Get token from database or container
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Test WITH token (should succeed)
curl -X POST https://app-5.app.eks.dev01.tk.dev/agent/query \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"create a hello world page"}'
# Expected: 200 OK

# Test WITHOUT token (should fail)
curl -X POST https://app-5.app.eks.dev01.tk.dev/agent/query \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test"}'
# Expected: 401 Unauthorized

# Test with WRONG APP's token (should fail)
curl -X POST https://app-7.app.eks.dev01.tk.dev/agent/query \
  -H "Authorization: Bearer $TOKEN_FROM_APP_5" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test"}'
# Expected: 403 Forbidden
```

## Troubleshooting

### Agent API Returns 401

**Cause**: Missing or invalid token

**Check**:
```bash
# Verify token exists in container
kubectl exec app-5-xxx -n kova-apps -- env | grep AGENT_TOKEN

# Decode JWT to inspect claims (use https://jwt.io)
echo $TOKEN | base64 -d
```

**Fix**: Restart container to generate new token

### Agent API Returns 403

**Cause**: Token valid but app ID doesn't match

**Check**:
```bash
# Check APP_ID in container
kubectl exec app-5-xxx -n kova-apps -- env | grep APP_ID

# Decode token and compare appId claim
```

**Fix**: Use the correct token for this specific app

### Token Expired

**Cause**: Token older than 30 days

**Fix**: Restart container to generate new token with fresh expiration

## Configuration

### Environment Variables

**Backend** (`.env`):
```bash
JWT_SECRET=<32+ character random string>  # Used for token signing
```

**Container** (auto-injected by backend):
```bash
AGENT_TOKEN=<jwt token>       # For validating incoming requests
APP_ID=5                      # For verifying appId claim
K8S_CLUSTER=dev01-eks-app-admin  # For tracking/debugging
```

### Token Lifetime

Default: 30 days (configurable in `agent-auth.service.ts:32`)

For production, consider shorter TTLs:
- Development: 30 days (current)
- Production: 7 days (recommended)

## Security Considerations

### For Development

Current implementation is appropriate for:
- Internal corporate network only
- Trusted users with kubectl access
- Development/testing environments

### For Production

Additional hardening required:
- [ ] Shorter token TTL (7 days or less)
- [ ] Token rotation on container restart
- [ ] Audit logging of all agent API calls
- [ ] Rate limiting per token/app
- [ ] HTTPS-only enforcement at Gateway level
- [ ] IP allowlisting (if needed)
- [ ] DDoS protection at Gateway level

## Related Documentation

- `docs/agent-api-security.md` - Comprehensive security architecture
- `IMPLEMENTATION_SUMMARY.md` - Implementation checklist and testing steps
- `docs/local-dev-eks-setup.md` - EKS orchestration setup guide

---

**Status**: Backend generates and stores tokens. Container validation pending implementation.
**Last Updated**: 2026-02-07
**Next Steps**: Implement authentication middleware in app-container
