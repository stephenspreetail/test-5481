# Claude Agent SDK Model Configuration & Vercel AI Gateway Compatibility

## Claude Agent SDK: Model Configuration

### Specifying a Model

Both Python and TypeScript SDKs accept a `model` parameter in the options configuration:

**Python:**

```python
from claude_agent_sdk import query, ClaudeAgentOptions

async for message in query(
    prompt="Your prompt here",
    options=ClaudeAgentOptions(
        model="claude-opus-4-6"
    )
):
    print(message)
```

**TypeScript:**

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Your prompt here",
  options: {
    model: "claude-opus-4-6",
  },
})) {
  console.log(message);
}
```

### Model Parameters

| Parameter        | Type             | Description                                  |
| ---------------- | ---------------- | -------------------------------------------- |
| `model`          | `string \| None` | Claude model to use                          |
| `fallback_model` | `string \| None` | Fallback model if the primary model fails    |

Example with fallback:

```python
options = ClaudeAgentOptions(
    model="claude-opus-4-6",
    fallback_model="claude-sonnet-4-5-20250929"
)
```

### Available Models

| Model             | ID                              | Alias               |
| ----------------- | ------------------------------- | -------------------- |
| Claude Opus 4.6   | `claude-opus-4-6`              | `claude-opus-4-6`    |
| Claude Sonnet 4.5 | `claude-sonnet-4-5-20250929`   | `claude-sonnet-4-5`  |
| Claude Haiku 4.5  | `claude-haiku-4-5-20251001`    | `claude-haiku-4-5`   |

Either the full ID or the alias can be used.

### Environment Variables

| Variable              | Purpose                                  |
| --------------------- | ---------------------------------------- |
| `ANTHROPIC_API_KEY`   | API key for Anthropic's API              |
| `ANTHROPIC_BASE_URL`  | Custom API endpoint (for proxies/gateways) |
| `ANTHROPIC_AUTH_TOKEN` | Auth token (used when `ANTHROPIC_API_KEY` is empty) |

For third-party cloud providers:

| Provider           | Variable                      |
| ------------------ | ----------------------------- |
| Amazon Bedrock     | `CLAUDE_CODE_USE_BEDROCK=1`   |
| Google Vertex AI   | `CLAUDE_CODE_USE_VERTEX=1`    |
| Microsoft Azure    | `CLAUDE_CODE_USE_FOUNDRY=1`   |

---

## Vercel AI Gateway Compatibility

### Can the Claude Agent SDK Use the Vercel AI Gateway?

**Yes.** The Vercel AI Gateway provides an Anthropic-compatible API that implements the same Messages API specification as Anthropic's native API. The Claude Agent SDK can be configured to route requests through the gateway with only environment variable changes.

### How It Works

The Vercel AI Gateway (`https://ai-gateway.vercel.sh`) acts as a unified proxy supporting multiple AI providers. Its Anthropic-compatible endpoint supports:

- `POST /v1/messages` (the Messages API)
- Streaming responses
- Tool calls / function calling
- Extended thinking
- File attachments

This is the same API surface the Claude Agent SDK uses, making the gateway a drop-in proxy.

### Configuration

Set the following environment variables to route the Claude Agent SDK (or Claude Code) through Vercel AI Gateway:

```bash
export ANTHROPIC_BASE_URL="https://ai-gateway.vercel.sh"
export ANTHROPIC_AUTH_TOKEN="<your-vercel-ai-gateway-api-key>"
export ANTHROPIC_API_KEY=""
```

Setting `ANTHROPIC_API_KEY` to an empty string is required because Claude Code checks this variable first and would bypass `ANTHROPIC_AUTH_TOKEN` if it has a value.

### Shell Alias Shortcut

```bash
alias claude-vercel='ANTHROPIC_BASE_URL="https://ai-gateway.vercel.sh" ANTHROPIC_AUTH_TOKEN="your-api-key" ANTHROPIC_API_KEY="" claude'
```

### Using the Anthropic SDK Directly

The gateway also works with the Anthropic SDK outside of the Agent SDK context:

**TypeScript:**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  baseURL: "https://ai-gateway.vercel.sh",
});

const message = await anthropic.messages.create({
  model: "anthropic/claude-sonnet-4.5",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello, world!" }],
});
```

**Python:**

```python
import anthropic

client = anthropic.Anthropic(
    api_key=os.getenv("AI_GATEWAY_API_KEY"),
    base_url="https://ai-gateway.vercel.sh",
)

message = client.messages.create(
    model="anthropic/claude-sonnet-4.5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello, world!"}],
)
```

### Model Naming

When using the Vercel AI Gateway, models use a `provider/model` format:

- `anthropic/claude-sonnet-4.5`
- `anthropic/claude-opus-4-6`
- `openai/gpt-5.2`
- `xai/grok-4`

### Key Benefits of Using the Gateway

- **Unified billing** across all AI providers with no token markup
- **Automatic failover** during provider outages
- **Observability** via Vercel's tracing and monitoring dashboard
- **One API key** for hundreds of models from multiple providers
- **No rate limits** imposed by Vercel (upstream provider limits still apply)

### Limitations to Consider

- Model IDs must use the `provider/model` prefix format (e.g., `anthropic/claude-sonnet-4.5` instead of `claude-sonnet-4-5`)
- Requires a Vercel account and AI Gateway API key
- Only the `POST /v1/messages` Anthropic endpoint is supported (which is sufficient for the Agent SDK)
- Requests are proxied through Vercel's infrastructure, which may add minor latency

---

## Summary

The Claude Agent SDK configures models via the `model` parameter in `ClaudeAgentOptions` (Python) or `Options` (TypeScript), with an optional `fallback_model`. Custom API endpoints are supported through the `ANTHROPIC_BASE_URL` environment variable, which makes the SDK fully compatible with the Vercel AI Gateway. The gateway implements the Anthropic Messages API specification, supports all features the Agent SDK requires (streaming, tool calls, extended thinking), and can be enabled with three environment variables and zero code changes.