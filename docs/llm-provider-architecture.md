# LLM Provider Architecture

## Overview

Kova uses a clean provider abstraction layer to configure LLM credentials for app containers. This document explains how the system works and how to add new providers.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Application Configuration                   │
│  .env file with LLM_PROVIDER + provider-specific credentials    │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│              backend/src/config/index.ts                        │
│  Validates and loads environment variables into Config object   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│         backend/src/services/llm-provider.service.ts            │
│  • detectLlmProvider()     - Auto-detect from env vars          │
│  • buildLlmProviderConfig() - Build provider config             │
│  • buildLlmEnvironment()    - Map to container env vars         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│       backend/src/services/app-container.service.ts             │
│  Spawns containers with provider-specific environment variables │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    App Container (Kubernetes Pod)               │
│  Environment variables consumed by @kova/agent and Claude SDK   │
└─────────────────────────────────────────────────────────────────┘
```

## Model Aliases

The Claude Agent SDK supports model aliases that provide convenient shortcuts for model selection:

- **`sonnet`** - Latest Sonnet model for daily coding tasks
- **`opus`** - Latest Opus model for complex reasoning
- **`haiku`** - Fast and efficient Haiku model for simple tasks
- **`opusplan`** - Uses Opus during plan mode, switches to Sonnet for execution
- **`sonnet[1m]`** - Sonnet with 1 million token context window

These aliases map to provider-specific model names via environment variables:
- `ANTHROPIC_DEFAULT_OPUS_MODEL`
- `ANTHROPIC_DEFAULT_SONNET_MODEL`
- `ANTHROPIC_DEFAULT_HAIKU_MODEL`
- `CLAUDE_CODE_SUBAGENT_MODEL` (for background tasks and subagents)

### Provider-Specific Model Mappings

Each provider has different naming conventions, so the service automatically maps aliases to the correct format:

| Alias | Anthropic API | Azure Foundry | AWS Bedrock |
|-------|--------------|---------------|-------------|
| opus | claude-opus-4-6 | claude-opus-4-6 | us.anthropic.claude-opus-4-6-v1:0 |
| sonnet | claude-sonnet-4-5-20250929 | claude-sonnet-4-5 | us.anthropic.claude-sonnet-4-5-20250929-v1:0 |
| haiku | claude-haiku-4-5 | claude-haiku-4-5 | us.anthropic.claude-haiku-4-5-v1:0 |
| subagent | claude-sonnet-4-5-20250929 | claude-sonnet-4-5 | us.anthropic.claude-sonnet-4-5-20250929-v1:0 |

### Provider-Specific Defaults

When `AGENT_MODEL` is not explicitly set, each provider uses a different default:

- **Anthropic API**: `claude-opus-4-6` (Opus)
- **Azure Foundry**: `claude-opus-4-6` (Opus)
- **AWS Bedrock**: `us.anthropic.claude-sonnet-4-5-20250929-v1:0` (Sonnet)

This allows you to optimize for cost (Bedrock defaults to Sonnet) or capability (Azure/Anthropic default to Opus) based on your provider choice.

### Overriding Model Aliases

You can override the default mappings by setting environment variables:

```bash
# Example: Use a custom model for the "opus" alias
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-6-custom
```

This allows fine-grained control when needed while maintaining sensible defaults.

## Supported Providers

### 1. Anthropic (Direct API)

**Use Case**: Direct access to Anthropic's Claude API

**Configuration**:
```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
AGENT_MODEL=claude-opus-4-6
```

**Container Environment**:
```bash
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
AGENT_MODEL=claude-opus-4-6
ANTHROPIC_MODEL=claude-opus-4-6
# Model alias mappings (Anthropic full model names)
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-6
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-4-5
CLAUDE_CODE_SUBAGENT_MODEL=claude-sonnet-4-5-20250929
```

### 2. Azure (Azure Foundry)

**Use Case**: Azure OpenAI Service with Anthropic models via Foundry endpoint (Spreetail internal)

**Configuration**:
```bash
LLM_PROVIDER=azure
ANTHROPIC_API_KEY=your-azure-foundry-api-key
# ANTHROPIC_BASE_URL defaults to Spreetail's Azure Foundry endpoint
# AGENT_MODEL defaults to claude-opus-4-6
```

**Defaults**:
- Base URL: `https://tk-dot-dev-foundry-resource.openai.azure.com/anthropic` (Spreetail internal)
- Model: `claude-opus-4-6`

**Container Environment**:
```bash
ANTHROPIC_API_KEY=your-azure-foundry-api-key
ANTHROPIC_BASE_URL=https://your-foundry-resource.openai.azure.com/anthropic
AGENT_MODEL=claude-opus-4-6
ANTHROPIC_MODEL=claude-opus-4-6
# Model alias mappings (Azure deployment names)
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-6
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-5
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-4-5
CLAUDE_CODE_SUBAGENT_MODEL=claude-sonnet-4-5
```

### 3. Bedrock (AWS Bedrock)

**Use Case**: Claude models via AWS Bedrock (requires AWS credentials)

**Configuration**:
```bash
LLM_PROVIDER=bedrock
CLAUDE_CODE_USE_BEDROCK=1
AWS_REGION=us-east-1
AWS_AUTH_MODE=explicit  # or "pod-identity" for EKS
# AGENT_MODEL defaults to us.anthropic.claude-sonnet-4-5-20250929-v1:0 for Bedrock

# For explicit auth mode (local dev):
AWS_ACCESS_KEY_ID=AKIATEST
AWS_SECRET_ACCESS_KEY=secret-key
AWS_SESSION_TOKEN=session-token
```

**Container Environment (explicit mode)**:
```bash
CLAUDE_CODE_USE_BEDROCK=1
AWS_REGION=us-east-1
AGENT_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
ANTHROPIC_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
AWS_ACCESS_KEY_ID=AKIATEST
AWS_SECRET_ACCESS_KEY=secret-key
AWS_SESSION_TOKEN=session-token
# Model alias mappings (Bedrock inference profile ARNs)
ANTHROPIC_DEFAULT_OPUS_MODEL=us.anthropic.claude-opus-4-6-v1:0
ANTHROPIC_DEFAULT_SONNET_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
ANTHROPIC_DEFAULT_HAIKU_MODEL=us.anthropic.claude-haiku-4-5-v1:0
CLAUDE_CODE_SUBAGENT_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
```

**Container Environment (pod-identity mode)**:
```bash
CLAUDE_CODE_USE_BEDROCK=1
AWS_REGION=us-east-1
AGENT_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
ANTHROPIC_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
# Model alias mappings (Bedrock inference profile ARNs)
ANTHROPIC_DEFAULT_OPUS_MODEL=us.anthropic.claude-opus-4-6-v1:0
ANTHROPIC_DEFAULT_SONNET_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
ANTHROPIC_DEFAULT_HAIKU_MODEL=us.anthropic.claude-haiku-4-5-v1:0
CLAUDE_CODE_SUBAGENT_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
# No AWS credentials - EKS Pod Identity injects them
```

## Backward Compatibility

The system maintains backward compatibility with existing configurations:

1. **Explicit provider**: If `LLM_PROVIDER` is set, it takes precedence
2. **Auto-detection**: If `LLM_PROVIDER` is not set, the provider is detected from:
   - `CLAUDE_CODE_USE_BEDROCK=1` → bedrock
   - `ANTHROPIC_BASE_URL` is set → azure
   - Otherwise → anthropic (default)

This allows existing `.env` files to work without modification while encouraging new deployments to use the cleaner `LLM_PROVIDER` pattern.

## Adding a New Provider

To add support for a new LLM provider:

1. **Add provider to config schema** (`backend/src/config/index.ts`):
   ```typescript
   LLM_PROVIDER: z.enum(["anthropic", "azure", "bedrock", "newprovider"]).optional(),
   ```

2. **Add provider case in service** (`backend/src/services/llm-provider.service.ts`):
   ```typescript
   export type LlmProvider = "anthropic" | "azure" | "bedrock" | "newprovider";

   // In buildLlmEnvironment():
   case "newprovider":
     env.NEWPROVIDER_API_KEY = providerConfig.apiKey;
     env.AGENT_MODEL = providerConfig.model;
     break;
   ```

3. **Update detection logic** (if auto-detection is needed):
   ```typescript
   // In detectLlmProvider():
   if (config.NEWPROVIDER_ENABLED === "1") {
     return "newprovider";
   }
   ```

4. **Update documentation**:
   - `.env.example` - Add configuration example
   - `README.md` - Update environment setup section
   - This file - Add provider details

5. **Add tests** (`backend/src/services/__tests__/llm-provider.service.test.ts`):
   ```typescript
   it("should build environment for newprovider", () => {
     // Test the provider's environment mapping
   });
   ```

## Implementation Details

### LlmProviderConfig Interface

```typescript
export interface LlmProviderConfig {
  provider: LlmProvider;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  awsRegion?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsSessionToken?: string;
  awsAuthMode?: "explicit" | "pod-identity";
}
```

### Key Functions

- **`detectLlmProvider()`**: Auto-detects provider from environment variables
- **`buildLlmProviderConfig()`**: Builds provider config from app config
- **`buildLlmEnvironment()`**: Maps provider config to container environment variables

### Design Principles

1. **Single source of truth**: `LLM_PROVIDER` determines which credentials to use
2. **Clean separation**: App config → Provider config → Container environment
3. **Extensible**: Adding new providers requires minimal code changes
4. **Testable**: Pure functions with clear inputs/outputs
5. **Backward compatible**: Existing configs continue to work

## Migration Guide

### From Legacy Configuration

**Before**:
```bash
# Azure (implicit)
ANTHROPIC_API_KEY=key
ANTHROPIC_BASE_URL=https://...
AGENT_MODEL=claude-sonnet-4-5
```

**After**:
```bash
# Azure (explicit)
LLM_PROVIDER=azure
ANTHROPIC_API_KEY=key
ANTHROPIC_BASE_URL=https://...
AGENT_MODEL=claude-sonnet-4-5
```

**Before**:
```bash
# Bedrock (implicit via script)
CLAUDE_CODE_USE_BEDROCK=1
AWS_REGION=us-east-1
AWS_AUTH_MODE=explicit
AGENT_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
```

**After**:
```bash
# Bedrock (explicit)
LLM_PROVIDER=bedrock
CLAUDE_CODE_USE_BEDROCK=1
AWS_REGION=us-east-1
AWS_AUTH_MODE=explicit
AGENT_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
```

The legacy format continues to work via auto-detection, but the explicit format is recommended for clarity.

## Testing

Run the provider service tests:
```bash
bun test backend/src/services/__tests__/llm-provider.service.test.ts
```

Tests verify:
- Correct environment mapping for each provider
- Proper handling of auth modes (explicit vs pod-identity)
- Missing optional fields are handled gracefully
- All providers produce valid container environments
