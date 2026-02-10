# Model Update Summary - Opus 4.6 & Haiku 4.5

## Overview

Updated model names to latest versions (Opus 4.6, Haiku 4.5) and implemented provider-specific default models to optimize for cost vs. capability based on provider choice.

## Model Updates

### Opus 4.6
- **Anthropic API**: `claude-opus-4-6`
- **Azure Foundry**: `claude-opus-4-6`
- **AWS Bedrock**: `us.anthropic.claude-opus-4-6-v1:0`

### Haiku 4.5
- **Anthropic API**: `claude-haiku-4-5`
- **Azure Foundry**: `claude-haiku-4-5`
- **AWS Bedrock**: `us.anthropic.claude-haiku-4-5-v1:0`

### Sonnet 4.5 (unchanged)
- **Anthropic API**: `claude-sonnet-4-5-20250929`
- **Azure Foundry**: `claude-sonnet-4-5`
- **AWS Bedrock**: `us.anthropic.claude-sonnet-4-5-20250929-v1:0`

## Provider-Specific Defaults

When `AGENT_MODEL` is not explicitly set, each provider now uses an optimized default:

| Provider | Default Model | Reason |
|----------|--------------|--------|
| **Azure Foundry** | `claude-opus-4-6` | Capability-optimized (Spreetail internal) |
| **Anthropic API** | `claude-opus-4-6` | Capability-optimized |
| **AWS Bedrock** | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | Cost-optimized |

This allows you to optimize for:
- **Capability**: Azure Foundry and Anthropic API default to Opus 4.6
- **Cost**: Bedrock defaults to Sonnet 4.5

## Implementation Details

### Backend Service (`backend/src/services/llm-provider.service.ts`)

Added `default` field to `ProviderModelMap`:
```typescript
interface ProviderModelMap {
  default: string; // Default model for this provider
  opus: string;
  sonnet: string;
  haiku: string;
  subagent: string;
}
```

Updated `buildLlmProviderConfig()` to use provider-specific defaults:
```typescript
const modelMap = PROVIDER_MODELS[provider];
const isDefaultModel =
  agentModel === "claude-opus-4-5-20251101" || // Old schema default
  agentModel === "claude-opus-4-6"; // New schema default

const providerConfig: LlmProviderConfig = {
  provider,
  model: isDefaultModel ? modelMap.default : agentModel,
};
```

### Configuration (`backend/src/config/index.ts`)

Updated schema default to Opus 4.6:
```typescript
AGENT_MODEL: z.string().default("claude-opus-4-6")
```

Added comment explaining provider-specific defaults:
```typescript
// Note: If not explicitly set, provider-specific defaults are used:
//   - Azure Foundry: claude-opus-4-6
//   - Anthropic API: claude-opus-4-6
//   - Bedrock: us.anthropic.claude-sonnet-4-5-20250929-v1:0
```

## Updated Model Alias Mappings

All model aliases now use the latest versions:

| Alias | Anthropic API | Azure Foundry | AWS Bedrock |
|-------|--------------|---------------|-------------|
| opus | claude-opus-4-6 | claude-opus-4-6 | us.anthropic.claude-opus-4-6-v1:0 |
| sonnet | claude-sonnet-4-5-20250929 | claude-sonnet-4-5 | us.anthropic.claude-sonnet-4-5-20250929-v1:0 |
| haiku | claude-haiku-4-5 | claude-haiku-4-5 | us.anthropic.claude-haiku-4-5-v1:0 |
| subagent | claude-sonnet-4-5-20250929 | claude-sonnet-4-5 | us.anthropic.claude-sonnet-4-5-20250929-v1:0 |

## Configuration Examples

### Azure Foundry (Defaults to Opus 4.6)
```bash
LLM_PROVIDER=azure
ANTHROPIC_API_KEY=your-azure-foundry-key
ANTHROPIC_BASE_URL=https://foundry.openai.azure.com/anthropic
# AGENT_MODEL automatically defaults to claude-opus-4-6
```

### AWS Bedrock (Defaults to Sonnet 4.5 - Cost Optimized)
```bash
LLM_PROVIDER=bedrock
CLAUDE_CODE_USE_BEDROCK=1
AWS_REGION=us-east-1
AWS_AUTH_MODE=explicit
# AGENT_MODEL automatically defaults to us.anthropic.claude-sonnet-4-5-20250929-v1:0
```

### Anthropic API (Defaults to Opus 4.6)
```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-api-key
# AGENT_MODEL automatically defaults to claude-opus-4-6
```

## Overriding Defaults

You can still explicitly set the model if needed:

```bash
# Use Opus on Bedrock instead of default Sonnet
LLM_PROVIDER=bedrock
AGENT_MODEL=us.anthropic.claude-opus-4-6-v1:0

# Use Sonnet on Azure instead of default Opus
LLM_PROVIDER=azure
AGENT_MODEL=claude-sonnet-4-5
```

## Files Updated

**Backend Service**:
- `backend/src/services/llm-provider.service.ts` - Updated model names, added defaults
- `backend/src/services/__tests__/llm-provider.service.test.ts` - Updated tests
- `backend/src/config/index.ts` - Updated schema default

**Documentation**:
- `docs/llm-provider-architecture.md` - Updated model names, added default section
- `docs/model-alias-examples.md` - Updated all examples
- `.env.example` - Updated model names, added default explanations
- `README.md` - Updated environment setup section
- `MODEL_UPDATE_SUMMARY.md` - This document

## Testing

All tests pass ✓
```bash
bun test backend/src/services/__tests__/llm-provider.service.test.ts
# 5 pass, 0 fail
```

All types valid ✓
```bash
cd backend && bun run tsc --noEmit
# No errors
```

## Backward Compatibility

✅ Existing configurations continue to work
✅ Explicit `AGENT_MODEL` settings override provider defaults
✅ Old model names are recognized and mapped to provider defaults

## Benefits

1. **Cost Optimization**: Bedrock defaults to Sonnet (cost-effective)
2. **Capability Optimization**: Azure/Anthropic default to Opus (best performance)
3. **Latest Models**: All aliases use Opus 4.6 and Haiku 4.5
4. **Flexibility**: Can override defaults when needed
5. **Simplicity**: No need to specify model for common use cases
