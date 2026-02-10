# Model Alias Examples

This document shows practical examples of how model aliases work with different LLM providers in Kova.

## What are Model Aliases?

Model aliases are convenient shortcuts provided by the Claude Agent SDK:

- **`sonnet`** - Latest Sonnet model for daily coding tasks
- **`opus`** - Latest Opus model for complex reasoning
- **`haiku`** - Fast and efficient Haiku model for simple tasks
- **`opusplan`** - Uses Opus during plan mode, switches to Sonnet for execution
- **`sonnet[1m]`** - Sonnet with 1 million token context window

## How It Works

When you configure `LLM_PROVIDER`, Kova automatically sets up the correct model names for each alias based on your provider's naming scheme.

## Example 1: Azure Foundry (Spreetail Internal)

### Configuration (.env)
```bash
LLM_PROVIDER=azure
ANTHROPIC_API_KEY=your-azure-foundry-key
# ANTHROPIC_BASE_URL automatically uses Spreetail's Foundry endpoint
# AGENT_MODEL defaults to claude-opus-4-6
```

### What Gets Passed to Containers
```bash
# Model aliases automatically mapped to Azure deployment names
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-6
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-5
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-4-5
CLAUDE_CODE_SUBAGENT_MODEL=claude-sonnet-4-5
```

### Usage in Agent
```bash
# User can use aliases in the chat
/model sonnet     # → Uses claude-sonnet-4-5
/model opus       # → Uses claude-opus-4-6
/model haiku      # → Uses claude-haiku-4-5
/model opusplan   # → Opus for planning, Sonnet for execution
```

## Example 2: Direct Anthropic API

### Configuration (.env)
```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-api-key
# AGENT_MODEL defaults to claude-opus-4-6 for Anthropic
```

### What Gets Passed to Containers
```bash
# Model aliases automatically mapped to full Anthropic model names
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-6
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-4-5
CLAUDE_CODE_SUBAGENT_MODEL=claude-sonnet-4-5-20250929
```

### Usage in Agent
```bash
# User can use aliases in the chat
/model sonnet     # → Uses claude-sonnet-4-5-20250929
/model opus       # → Uses claude-opus-4-6
/model haiku      # → Uses claude-haiku-4-5
```

## Example 3: AWS Bedrock

### Configuration (.env)
```bash
LLM_PROVIDER=bedrock
CLAUDE_CODE_USE_BEDROCK=1
AWS_REGION=us-east-1
AWS_AUTH_MODE=explicit
# AGENT_MODEL defaults to us.anthropic.claude-sonnet-4-5-20250929-v1:0 for Bedrock
```

### What Gets Passed to Containers
```bash
# Model aliases automatically mapped to Bedrock inference profile ARNs
ANTHROPIC_DEFAULT_OPUS_MODEL=us.anthropic.claude-opus-4-6-v1:0
ANTHROPIC_DEFAULT_SONNET_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
ANTHROPIC_DEFAULT_HAIKU_MODEL=us.anthropic.claude-haiku-4-5-v1:0
CLAUDE_CODE_SUBAGENT_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
```

### Usage in Agent
```bash
# User can use aliases in the chat
/model sonnet     # → Uses us.anthropic.claude-sonnet-4-5-20250929-v1:0
/model opus       # → Uses us.anthropic.claude-opus-4-6-v1:0
/model haiku      # → Uses us.anthropic.claude-haiku-4-5-v1:0
```

## Example 4: Custom Model Alias Overrides

You can override the default mappings if you need to use different models:

### Configuration (.env)
```bash
LLM_PROVIDER=azure
ANTHROPIC_API_KEY=your-azure-foundry-key
ANTHROPIC_BASE_URL=https://foundry.openai.azure.com/anthropic
AGENT_MODEL=claude-sonnet-4-5

# Override: Use a custom experimental model for opus alias
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-5-experimental
```

### What Gets Passed to Containers
```bash
# Opus alias uses custom model, others use defaults
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-5-experimental  # ← Overridden
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-5
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-3-5
CLAUDE_CODE_SUBAGENT_MODEL=claude-sonnet-4-5
```

### Usage in Agent
```bash
/model opus    # → Uses claude-opus-4-5-experimental (custom)
/model sonnet  # → Uses claude-sonnet-4-5 (default)
```

## Benefits

1. **Consistency**: Users can use the same aliases (`sonnet`, `opus`, `haiku`) regardless of provider
2. **Simplicity**: No need to remember provider-specific model naming schemes
3. **Flexibility**: Provider-specific mappings are automatically configured
4. **Control**: Can override defaults when needed for testing or custom deployments

## Model Alias Mapping Table

| Alias | Anthropic API | Azure Foundry | AWS Bedrock |
|-------|--------------|---------------|-------------|
| **opus** | claude-opus-4-6 | claude-opus-4-6 | us.anthropic.claude-opus-4-6-v1:0 |
| **sonnet** | claude-sonnet-4-5-20250929 | claude-sonnet-4-5 | us.anthropic.claude-sonnet-4-5-20250929-v1:0 |
| **haiku** | claude-haiku-4-5 | claude-haiku-4-5 | us.anthropic.claude-haiku-4-5-v1:0 |
| **subagent** | claude-sonnet-4-5-20250929 | claude-sonnet-4-5 | us.anthropic.claude-sonnet-4-5-20250929-v1:0 |

**Default Models by Provider:**
- **Anthropic API**: `claude-opus-4-6`
- **Azure Foundry**: `claude-opus-4-6`
- **AWS Bedrock**: `us.anthropic.claude-sonnet-4-5-20250929-v1:0`

## Troubleshooting

### Issue: Model alias returns "model not found"

**Cause**: The provider doesn't have the model deployed or the mapping is incorrect.

**Solution**: Override the alias with a model that exists in your deployment:
```bash
ANTHROPIC_DEFAULT_OPUS_MODEL=your-actual-opus-deployment-name
```

### Issue: Want to use different models for different aliases

**Solution**: Override multiple aliases:
```bash
# Use Opus for complex tasks, Sonnet for everything else
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-5
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-5
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-sonnet-4-5  # Use Sonnet instead of Haiku
CLAUDE_CODE_SUBAGENT_MODEL=claude-haiku-3-5      # Use Haiku for background tasks
```

### Issue: Testing a new model version

**Solution**: Override the alias temporarily:
```bash
# Test new Sonnet version
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-6-beta
```
