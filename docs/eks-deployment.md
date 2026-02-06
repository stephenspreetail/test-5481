# EKS Deployment with Pod Identity

This guide explains how to deploy Kova to Amazon EKS with Pod Identity for Bedrock authentication, while maintaining compatibility with local development using AWS SSO.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  LOCAL DEVELOPMENT                                      │
│                                                         │
│  1. source ./scripts/refresh-aws-sso.sh                │
│     → Script does aws sso login                        │
│     → Exports AWS_ACCESS_KEY_ID, etc.                  │
│     → Sets AWS_AUTH_MODE=explicit                      │
│  2. Backend passes credentials to containers           │
│                                                         │
│  ┌─────────────────────────────────────────┐           │
│  │  App Container                          │           │
│  │  • Receives explicit credentials        │           │
│  │  • CLAUDE_CODE_USE_BEDROCK=1            │           │
│  │  • AWS SDK uses provided credentials    │           │
│  └─────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  EKS DEPLOYMENT                                         │
│                                                         │
│  1. IAM Role with Bedrock access                       │
│  2. Pod Identity configured                            │
│  3. AWS_AUTH_MODE=pod-identity                         │
│  4. Backend does NOT pass credentials                  │
│                                                         │
│  ┌─────────────────────────────────────────┐           │
│  │  Kova Backend Pod                       │           │
│  │  ✅ Has Pod Identity                    │           │
│  │  ✅ Can call Bedrock API                │           │
│  │  ✅ Title generation works              │           │
│  │                                         │           │
│  │  Spawns ↓                               │           │
│  └─────────────────────────────────────────┘           │
│       ↓                                                 │
│  ┌─────────────────────────────────────────┐           │
│  │  App Container Pod                      │           │
│  │  ✅ Has its own Pod Identity            │           │
│  │  ✅ AWS SDK auto-discovers credentials  │           │
│  │  ✅ CLAUDE_CODE_USE_BEDROCK=1           │           │
│  │  ✅ Agent calls Bedrock API             │           │
│  └─────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────┘
```

## How It Works

### Local Development (Explicit Mode)

**Configuration:**
```bash
# Run the helper script (sets all required variables)
# Linux/macOS: source ./scripts/refresh-aws-sso.sh
# Windows:     .\scripts\refresh-aws-sso.ps1

# Script automatically exports:
# - CLAUDE_CODE_USE_BEDROCK=1
# - AWS_AUTH_MODE=explicit
# - AWS_REGION=us-east-1
# - AGENT_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
# - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN (from SSO)
```

**Flow:**
1. You run `source ./scripts/refresh-aws-sso.sh`
2. Script logs into AWS SSO and exports all required variables
3. Backend reads these from `process.env`
4. Backend **passes credentials** to containers via environment variables
5. Containers use the explicit credentials

### EKS Deployment (Pod Identity Mode)

**Configuration:**
```bash
# ConfigMap or Environment
AWS_AUTH_MODE=pod-identity
CLAUDE_CODE_USE_BEDROCK=1
AWS_REGION=us-east-1
# NO AWS_ACCESS_KEY_ID, etc. - Pod Identity provides these
```

**Flow:**
1. IAM Role associated with ServiceAccount via Pod Identity
2. Backend pod gets credentials automatically from IMDS
3. Backend **does NOT pass credentials** to app containers
4. App container pods have their own Pod Identity
5. AWS SDK in containers auto-discovers credentials from IMDS

## Code Changes Summary

### Backend Config (`backend/src/config/index.ts`)

Added `AWS_AUTH_MODE`:
```typescript
AWS_AUTH_MODE: z.enum(["explicit", "pod-identity"]).default("explicit")
```

### Container Service (`backend/src/services/app-container.service.ts`)

Conditionally passes credentials:
```typescript
// Always pass these
envArray.push(
  `CLAUDE_CODE_USE_BEDROCK=${config.CLAUDE_CODE_USE_BEDROCK}`,
  `AWS_REGION=${config.AWS_REGION}`
);

// Only pass explicit credentials in "explicit" mode
if (config.AWS_AUTH_MODE === "explicit") {
  envArray.push(
    `AWS_ACCESS_KEY_ID=${config.AWS_ACCESS_KEY_ID}`,
    `AWS_SECRET_ACCESS_KEY=${config.AWS_SECRET_ACCESS_KEY}`,
    `AWS_SESSION_TOKEN=${config.AWS_SESSION_TOKEN}`
  );
}
// In "pod-identity" mode, AWS SDK discovers credentials automatically
```

## EKS Setup Requirements

### 1. Create IAM Role for Bedrock Access

```bash
# Create IAM policy for Bedrock
cat > bedrock-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
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
EOF

aws iam create-policy \
  --policy-name KovaBedrockAccess \
  --policy-document file://bedrock-policy.json
```

### 2. Configure Pod Identity

You'll need to set up Pod Identity for:
- **Kova Backend Pod** - For title generation
- **App Container Pods** - For agent queries

Example ServiceAccount configuration:
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kova-backend
  namespace: kova
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT_ID:role/KovaBedrockRole

---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kova-app-container
  namespace: kova
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT_ID:role/KovaBedrockRole
```

### 3. Backend Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kova-backend
  namespace: kova
spec:
  template:
    spec:
      serviceAccountName: kova-backend
      containers:
      - name: backend
        image: your-registry/kova-backend:latest
        env:
        - name: AWS_AUTH_MODE
          value: "pod-identity"
        - name: CLAUDE_CODE_USE_BEDROCK
          value: "1"
        - name: AWS_REGION
          value: "us-east-1"
        - name: AGENT_MODEL
          value: "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
        # Other environment variables...
```

### 4. Container Orchestration in EKS

When backend spawns app containers in EKS, it should:
- Create pods (not Docker containers)
- Use the `kova-app-container` ServiceAccount
- The Pod Identity will automatically inject credentials

**Note:** You'll need to modify `app-container.service.ts` to support Kubernetes pod creation alongside Docker container creation. This is beyond the current Docker-only implementation.

## Testing in EKS

### 1. Verify Pod Identity Works

```bash
# Exec into backend pod
kubectl exec -it kova-backend-xxx -n kova -- sh

# Check that credentials are auto-discovered
aws sts get-caller-identity

# Should show the IAM role, not an error
```

### 2. Verify Bedrock Access

```bash
# In backend pod
aws bedrock list-foundation-models --region us-east-1 | grep claude

# Should list Claude models
```

### 3. Create a Test App

1. Access Kova UI (via LoadBalancer/Ingress)
2. Create a new app
3. Check app container pod logs:
   ```bash
   kubectl logs -f app-5-xxx -n kova
   ```
4. Look for Bedrock model ID: `us.anthropic.claude-sonnet-4-5-20250929-v1:0`

## Comparison: Local vs EKS

| Aspect | Local Dev | EKS |
|--------|-----------|-----|
| **Auth Method** | AWS SSO (temporary creds) | Pod Identity (IAM role) |
| **AWS_AUTH_MODE** | `explicit` (set by script) | `pod-identity` (set in K8s config) |
| **Credentials Passed?** | ✅ Yes (env vars) | ❌ No (auto-discovery) |
| **Credential Refresh** | Every 8-12 hours | Automatic |
| **Setup Complexity** | Low (run script) | Medium (IAM + K8s config) |
| **Security** | Good (temp creds) | Better (no cred exposure) |

## Migration Path

### Phase 1: Local Development (Current)
```bash
# Script automatically sets AWS_AUTH_MODE=explicit
# Linux/macOS: source ./scripts/refresh-aws-sso.sh
# Windows:     .\scripts\refresh-aws-sso.ps1
bun run dev:full
```

### Phase 2: Staging/EKS
```yaml
# ConfigMap
AWS_AUTH_MODE: pod-identity
CLAUDE_CODE_USE_BEDROCK: "1"
AWS_REGION: us-east-1
```

### Phase 3: Production/EKS
Same as staging, with production IAM roles and tighter permissions.

## Troubleshooting

### Backend can't assume role

**Symptom:** Backend logs show credential errors

**Check:**
```bash
# Verify ServiceAccount annotation
kubectl get sa kova-backend -n kova -o yaml

# Should have: eks.amazonaws.com/role-arn annotation
```

### App containers can't call Bedrock

**Symptom:** Agent queries fail with authentication errors

**Possible causes:**
1. App container pods don't have Pod Identity configured
2. Backend is still passing empty credentials (check `AWS_AUTH_MODE`)
3. IAM role lacks Bedrock permissions

**Fix:**
```bash
# Verify AWS_AUTH_MODE is set correctly
kubectl exec kova-backend-xxx -n kova -- env | grep AWS_AUTH_MODE
# Should show: AWS_AUTH_MODE=pod-identity
```

### Credentials work in backend but not containers

**Symptom:** Title generation works, but agent queries fail

**Root cause:** App container pods need their own Pod Identity

**Solution:** Ensure app container pods are created with the correct ServiceAccount that has Pod Identity configured.

## Security Best Practices

1. **Least Privilege**: IAM role should only allow Bedrock API access, nothing else
2. **Regional Restriction**: Limit Bedrock access to specific regions
3. **Model Restriction**: Restrict to specific Claude model ARNs
4. **Audit CloudTrail**: Monitor all Bedrock API calls
5. **Separate Roles**: Use different IAM roles for dev/staging/prod

## Next Steps

1. ✅ **Code is ready** - Backend supports both modes
2. ⏳ **Your task**: Set up Pod Identity in EKS
3. ⏳ **Your task**: Modify container orchestration for K8s pods (if needed)
4. ⏳ **Your task**: Create K8s manifests with ServiceAccounts

The current code changes make Kova **ready** for Pod Identity - you just need to configure the Kubernetes resources!
