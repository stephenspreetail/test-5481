# LLM Provider Refactor Summary

## Overview

Refactored the messy credential passing system to use a clean provider-based abstraction with proper model alias support. The previous implementation scattered credential logic across the codebase; the new implementation centralizes it in a dedicated service with automatic model alias mapping per provider.

## Changes Made

### 1. New Service Layer (`backend/src/services/llm-provider.service.ts`)

Created a new service that provides:

- **`LlmProviderConfig` interface**: Typed configuration for all provider types
- **`PROVIDER_MODELS` map**: Provider-specific model alias mappings
- **`detectLlmProvider()`**: Auto-detects provider from environment (backward compatibility)
- **`buildLlmProviderConfig()`**: Builds provider config from app config
- **`buildLlmEnvironment()`**: Maps provider config → container environment variables + model aliases

**Model Alias Support**: The service automatically maps Claude Agent SDK aliases (`sonnet`, `opus`, `haiku`, `opusplan`) to provider-specific model names:

| Alias | Anthropic API | Azure Foundry | AWS Bedrock |
|-------|--------------|---------------|-------------|
| opus | claude-opus-4-5-20251101 | claude-opus-4-5 | us.anthropic.claude-opus-4-5-20251101-v1:0 |
| sonnet | claude-sonnet-4-5-20250929 | claude-sonnet-4-5 | us.anthropic.claude-sonnet-4-5-20250929-v1:0 |
| haiku | claude-haiku-3-5-20241205 | claude-haiku-3-5 | us.anthropic.claude-haiku-3-5-20241205-v1:0 |

### 2. Updated Backend Config (`backend/src/config/index.ts`)

Added optional `LLM_PROVIDER` enum:
```typescript
LLM_PROVIDER: z.enum(["anthropic", "azure", "bedrock"]).optional()
```

Added optional model alias overrides:
```typescript
ANTHROPIC_DEFAULT_OPUS_MODEL: z.string().optional()
ANTHROPIC_DEFAULT_SONNET_MODEL: z.string().optional()
ANTHROPIC_DEFAULT_HAIKU_MODEL: z.string().optional()
CLAUDE_CODE_SUBAGENT_MODEL: z.string().optional()
```

These allow overriding the default provider-specific model mappings when needed.

### 3. Simplified Container Service (`backend/src/services/app-container.service.ts`)

**Before** (31 lines of credential logic):
```typescript
const env = {
  ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY || "",
  ...(config.ANTHROPIC_BASE_URL && {
    ANTHROPIC_BASE_URL: config.ANTHROPIC_BASE_URL,
  }),
  AGENT_MODEL: config.AGENT_MODEL,
  ANTHROPIC_MODEL: config.AGENT_MODEL,
  // ... 20 more lines of credential conditionals
};
```

**After** (3 lines):
```typescript
const llmProviderConfig = buildLlmProviderConfig();
const llmEnv = buildLlmEnvironment(llmProviderConfig);
const env = { ...llmEnv, /* other vars */ };
```

### 4. Updated Environment Configuration (`.env.example`)

Restructured to clearly show three provider options:

```bash
# OPTION 1: Azure Foundry (Spreetail Internal)
LLM_PROVIDER=azure
ANTHROPIC_API_KEY=key
ANTHROPIC_BASE_URL=https://...
AGENT_MODEL=claude-sonnet-4-5

# OPTION 2: Direct Anthropic API
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
AGENT_MODEL=claude-opus-4-5-20251101

# OPTION 3: AWS Bedrock
LLM_PROVIDER=bedrock
CLAUDE_CODE_USE_BEDROCK=1
AWS_REGION=us-east-1
AWS_AUTH_MODE=explicit
AGENT_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
```

### 5. Documentation

Added comprehensive documentation:

- **`docs/llm-provider-architecture.md`**: Complete architecture guide
  - How the system works
  - Supported providers
  - Adding new providers
  - Migration guide

- **Updated `README.md`**: Reflects new configuration pattern

### 6. Tests

Created test suite with 5 test cases:
- Anthropic provider environment mapping
- Azure provider environment mapping
- Bedrock provider with explicit auth
- Bedrock provider with pod-identity auth
- Graceful handling of missing optional fields

All tests pass ✓

## Backward Compatibility

✅ **Existing configurations continue to work** via auto-detection:

- No `LLM_PROVIDER` set → Provider detected from other env vars
- `CLAUDE_CODE_USE_BEDROCK=1` → bedrock
- `ANTHROPIC_BASE_URL` set → azure
- Otherwise → anthropic (default)

## Benefits

1. **Cleaner**: Single source of truth for provider configuration
2. **Extensible**: Add new providers with minimal code changes
3. **Testable**: Pure functions with clear inputs/outputs
4. **Maintainable**: Credential logic in one place, not scattered
5. **Safe**: Backward compatible with existing deployments
6. **Smart**: Automatic model alias mapping per provider (sonnet, opus, haiku, opusplan)
7. **Flexible**: Support for overriding default model aliases when needed

## Future Additions

To add a new provider (e.g., OpenRouter, Vertex AI):

1. Add to `LlmProvider` enum in service
2. Add case in `buildLlmEnvironment()` switch
3. Update detection logic if needed
4. Add tests
5. Update docs

The architecture is designed to make this straightforward.

## Testing

```bash
# Run provider service tests
bun test backend/src/services/__tests__/llm-provider.service.test.ts

# Check TypeScript types
cd backend && bun run tsc --noEmit
```

All tests pass ✓
All types valid ✓

## Files Changed

**New Files**:
- `backend/src/services/llm-provider.service.ts` - Provider abstraction service
- `backend/src/services/__tests__/llm-provider.service.test.ts` - Test suite
- `docs/llm-provider-architecture.md` - Architecture documentation
- `docs/model-alias-examples.md` - Practical model alias examples

**Modified Files**:
- `backend/src/config/index.ts` - Added LLM_PROVIDER and model alias configs
- `backend/src/services/app-container.service.ts` - Simplified credential passing
- `.env.example` - Restructured with model alias documentation
- `README.md` - Updated environment setup section
- `REFACTOR_SUMMARY.md` - This summary document
