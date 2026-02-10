# Kubernetes Environment Architecture

## Overview

Kubernetes environments are configured using the same provider pattern as LLM configuration. Each environment has sensible defaults that can be overridden when needed.

## Supported Environments

### local (Default)
Local k3d development cluster

**Defaults:**
- Context: `k3d-kova-dev`
- Namespace: `kova-apps`
- Preview Domain: `dev.toolkit.co`
- Preview Port: `8443`

**Configuration:**
```bash
K8S_ENVIRONMENT=local  # Optional, this is the default
```

### eks-dev
EKS development cluster

**Defaults:**
- Context: `arn:aws:eks:us-east-1:123456789:cluster/kova-dev`
- Namespace: `kova-apps`
- Preview Domain: `kova-apps.eks.dev01.tk.dev`
- Preview Port: `443`

**Configuration:**
```bash
K8S_ENVIRONMENT=eks-dev
```

### eks-prod
EKS production cluster

**Defaults:**
- Context: `arn:aws:eks:us-east-1:123456789:cluster/kova-prod`
- Namespace: `kova-apps`
- Preview Domain: `kova-apps.eks.prod.tk.dev`
- Preview Port: `443`

**Configuration:**
```bash
K8S_ENVIRONMENT=eks-prod
```

## Configuration Pattern

Just like LLM providers, you:
1. Choose an environment
2. Get sensible defaults automatically
3. Override specific settings if needed

### Minimal Configuration

```bash
# Uses all local defaults
K8S_ENVIRONMENT=local
```

### With Overrides

```bash
# Use local environment but with custom namespace
K8S_ENVIRONMENT=local
K8S_NAMESPACE=my-custom-namespace
```

## Available Overrides

All settings can be overridden per deployment:

```bash
K8S_CONTEXT=custom-context        # Override Kubernetes context
K8S_NAMESPACE=custom-namespace    # Override namespace
PREVIEW_DOMAIN=custom.domain.com  # Override preview domain
PREVIEW_PORT=9443                 # Override preview port
```

## Implementation

### Service Layer

`backend/src/services/k8s-environment.service.ts` provides:
- `K8sEnvironment` type: `"local" | "eks-dev" | "eks-prod"`
- `detectK8sEnvironment()`: Detects environment from config
- `buildK8sEnvironmentConfig()`: Builds config with defaults + overrides

### Configuration

`backend/src/config/index.ts`:
```typescript
K8S_ENVIRONMENT: z.enum(["local", "eks-dev", "eks-prod"]).optional()
K8S_CONTEXT: z.string().optional()
K8S_NAMESPACE: z.string().optional()
PREVIEW_DOMAIN: z.string().optional()
PREVIEW_PORT: z.coerce.number().optional()
```

### Orchestrator Integration

`backend/src/services/orchestrator/index.ts` uses the environment service to configure kubectl:

```typescript
const k8sEnv = buildK8sEnvironmentConfig();

return new KubectlOrchestrator({
  context: k8sEnv.context,
  namespace: k8sEnv.namespace,
  previewDomain: k8sEnv.previewDomain,
  previewPort: k8sEnv.previewPort,
  // ...
});
```

## Benefits

1. **Simplified Configuration**: Choose environment, get defaults
2. **Consistent Pattern**: Same as LLM provider configuration
3. **Context Safety**: Always pinned to specific context, no accidental switches
4. **Environment Parity**: Easy to switch between local/dev/prod
5. **Override Flexibility**: Can customize specific settings when needed

## Migration from Old Config

**Before:**
```bash
K8S_CLUSTER_MODE=local
K8S_OPS_CLUSTER_CONTEXT=k3d-kova-dev
K8S_NAMESPACE=kova-apps
PREVIEW_DOMAIN=dev.toolkit.co
PREVIEW_PORT=8443
```

**After:**
```bash
K8S_ENVIRONMENT=local  # All defaults handled automatically
```

## Testing

Run the environment service tests:
```bash
bun test backend/src/services/__tests__/k8s-environment.service.test.ts
```

Tests verify:
- Default environment detection
- Environment-specific defaults
- Override behavior
- Multiple simultaneous overrides
