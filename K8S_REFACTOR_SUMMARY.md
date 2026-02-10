# Kubernetes Environment Refactor Summary

## Overview

Refactored Kubernetes configuration to use the same provider pattern as LLM configuration. Instead of scattered config variables, we now have environment-based defaults with optional overrides.

## The Problem

**Before**: Kubernetes configuration was complex and error-prone:
- Had to manually specify context, namespace, preview domain, preview port
- `K8S_CLUSTER_MODE` didn't map to actual deployment scenarios
- Easy to forget settings or have context switching issues
- Configuration didn't match deployment reality

```bash
# Old way - verbose and error-prone
K8S_CLUSTER_MODE=local
K8S_OPS_CLUSTER_CONTEXT=k3d-kova-dev
K8S_NAMESPACE=kova-apps
PREVIEW_DOMAIN=dev.toolkit.co
PREVIEW_PORT=8443
```

## The Solution

**After**: Environment-based configuration with sensible defaults (exactly like LLM providers):

```bash
# New way - simple and safe
K8S_ENVIRONMENT=local  # That's it!
```

## Environment Definitions

Just like `LLM_PROVIDER` has `azure`, `anthropic`, and `bedrock`, `K8S_ENVIRONMENT` has:

| Environment | Use Case | Context | Namespace | Domain |
|------------|----------|---------|-----------|---------|
| **local** | k3d development | `k3d-kova-dev` | `kova-apps` | `dev.toolkit.co` |
| **eks-dev** | EKS development | EKS dev ARN | `kova-apps` | `kova-apps.eks.dev01.tk.dev` |
| **eks-prod** | EKS production | EKS prod ARN | `kova-apps` | `kova-apps.eks.prod.tk.dev` |

## Implementation

### New Service Layer

Created `backend/src/services/k8s-environment.service.ts`:

```typescript
export type K8sEnvironment = "local" | "eks-dev" | "eks-prod";

export interface K8sEnvironmentConfig {
  environment: K8sEnvironment;
  context: string;
  namespace: string;
  previewDomain: string;
  previewPort: number;
}

// Environment-specific defaults
const ENVIRONMENT_DEFAULTS: Record<K8sEnvironment, EnvironmentDefaults> = {
  local: {
    context: "k3d-kova-dev",
    namespace: "kova-apps",
    previewDomain: "dev.toolkit.co",
    previewPort: 8443,
  },
  // ... eks-dev, eks-prod
};

export function buildK8sEnvironmentConfig(): K8sEnvironmentConfig {
  const environment = detectK8sEnvironment();
  const defaults = ENVIRONMENT_DEFAULTS[environment];

  return {
    environment,
    // Allow explicit overrides, otherwise use environment defaults
    context: config.K8S_CONTEXT || defaults.context,
    namespace: config.K8S_NAMESPACE || defaults.namespace,
    previewDomain: config.PREVIEW_DOMAIN || defaults.previewDomain,
    previewPort: config.PREVIEW_PORT || defaults.previewPort,
  };
}
```

### Updated Config Schema

`backend/src/config/index.ts`:

```typescript
// Old - scattered config
K8S_CLUSTER_MODE: z.enum(["local", "multi"]).default("local"),
K8S_NAMESPACE: z.string().default("kova-apps"),
K8S_OPS_CLUSTER_CONTEXT: z.string().optional(),
PREVIEW_DOMAIN: z.string().default("dev.toolkit.co"),
PREVIEW_PORT: z.coerce.number().default(8443),

// New - environment + optional overrides
K8S_ENVIRONMENT: z.enum(["local", "eks-dev", "eks-prod"]).optional(),
K8S_CONTEXT: z.string().optional(),
K8S_NAMESPACE: z.string().optional(),
PREVIEW_DOMAIN: z.string().optional(),
PREVIEW_PORT: z.coerce.number().optional(),
```

### Orchestrator Integration

`backend/src/services/orchestrator/index.ts`:

```typescript
// Before - manual config assembly
return new KubectlOrchestrator({
  context: config.K8S_CLUSTER_MODE === "local"
    ? undefined
    : config.K8S_OPS_CLUSTER_CONTEXT,
  namespace: config.K8S_NAMESPACE,
  previewDomain: config.PREVIEW_DOMAIN,
  previewPort: config.PREVIEW_PORT,
});

// After - use environment service
const k8sEnv = buildK8sEnvironmentConfig();

return new KubectlOrchestrator({
  context: k8sEnv.context,
  namespace: k8sEnv.namespace,
  previewDomain: k8sEnv.previewDomain,
  previewPort: k8sEnv.previewPort,
});
```

## Configuration Examples

### Minimal (Most Common)

```bash
# Local development with all defaults
K8S_ENVIRONMENT=local

# Or just omit it - defaults to local
```

### With Overrides

```bash
# Use local environment but with custom namespace
K8S_ENVIRONMENT=local
K8S_NAMESPACE=my-custom-namespace
```

### EKS Deployment

```bash
# Production deployment - just set environment
K8S_ENVIRONMENT=eks-prod
```

## Benefits

1. **Consistent Pattern**: Same as LLM provider configuration
2. **Simplified Defaults**: Choose environment, get everything configured
3. **Context Safety**: Always pinned to specific context
4. **Override Flexibility**: Can customize when needed
5. **Clear Deployment Mapping**: Environment names match actual deployments
6. **Reduced Errors**: Fewer config variables = fewer mistakes

## Migration Guide

**Your `.env` Before:**
```bash
K8S_CLUSTER_MODE=local
K8S_OPS_CLUSTER_CONTEXT=k3d-kova-dev
K8S_NAMESPACE=kova-apps
PREVIEW_DOMAIN=dev.toolkit.co
PREVIEW_PORT=8443
```

**Your `.env` After:**
```bash
K8S_ENVIRONMENT=local
```

**EKS Deployment Before:**
```bash
K8S_CLUSTER_MODE=multi
K8S_OPS_CLUSTER_CONTEXT=arn:aws:eks:...
K8S_NAMESPACE=kova-apps
PREVIEW_DOMAIN=kova-apps.eks.dev01.tk.dev
PREVIEW_PORT=443
```

**EKS Deployment After:**
```bash
K8S_ENVIRONMENT=eks-dev
```

## Testing

Created comprehensive test suite:
```bash
bun test backend/src/services/__tests__/k8s-environment.service.test.ts
```

8 tests covering:
- Default environment detection
- Environment-specific defaults
- Override behavior
- Multiple simultaneous overrides

All tests pass ✓

## Files Changed

**New Files:**
- `backend/src/services/k8s-environment.service.ts` - Environment service
- `backend/src/services/__tests__/k8s-environment.service.test.ts` - Tests
- `docs/k8s-environment-architecture.md` - Documentation
- `K8S_REFACTOR_SUMMARY.md` - This document

**Modified Files:**
- `backend/src/config/index.ts` - Simplified config schema
- `backend/src/services/orchestrator/index.ts` - Uses environment service
- `backend/src/services/orchestrator/kubectl.orchestrator.ts` - Updated logging
- `.env` - Simplified to just `K8S_ENVIRONMENT=local`
- `.env.example` - Updated with new pattern
- `README.md` - Updated environment setup section

## Parallel with LLM Provider Refactor

This refactor follows the exact same pattern we used for LLM providers:

| Aspect | LLM Provider | K8s Environment |
|--------|--------------|-----------------|
| **Enum** | `LLM_PROVIDER` | `K8S_ENVIRONMENT` |
| **Options** | `azure` / `anthropic` / `bedrock` | `local` / `eks-dev` / `eks-prod` |
| **Service** | `llm-provider.service.ts` | `k8s-environment.service.ts` |
| **Defaults** | Model names per provider | Context/namespace/domain per env |
| **Overrides** | Optional model/credential overrides | Optional context/namespace/domain overrides |
| **Pattern** | Choose provider → get defaults | Choose environment → get defaults |

Both follow: **Environment-specific defaults + optional overrides**

This creates a consistent, predictable configuration pattern across the entire application.
