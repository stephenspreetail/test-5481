/**
 * Language Model Constants
 */

export interface ModelOption {
  name: string;
  displayName: string;
  description: string;
  dollarSigns?: number;
  temperature?: number;
  tag?: string;
  tagColor?: string;
  maxOutputTokens?: number;
  contextWindow?: number;
}

export interface LanguageModel {
  id?: number;
  apiName: string;
  displayName: string;
  description?: string;
  tag?: string;
  tagColor?: string;
  maxOutputTokens?: number;
  contextWindow?: number;
  temperature?: number;
  dollarSigns?: number;
  type: "cloud" | "custom" | "local";
}

export interface LanguageModelProvider {
  id: string;
  name: string;
  apiBaseUrl?: string;
  envVarName?: string;
  hasFreeTier?: boolean;
  websiteUrl?: string;
  gatewayPrefix?: string;
  secondary?: boolean;
  type: "cloud" | "custom" | "local";
}

export const MODEL_OPTIONS: Record<string, ModelOption[]> = {
  openai: [
    {
      name: "gpt-5.2",
      displayName: "GPT 5.2",
      description: "OpenAI's latest model",
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 3,
    },
    {
      name: "gpt-5.1",
      displayName: "GPT 5.1",
      description:
        "OpenAI's flagship model- smarter, faster, and more conversational",
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 3,
    },
    {
      name: "gpt-5.1-codex",
      displayName: "GPT 5.1 Codex",
      description: "OpenAI's advanced coding workflows",
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 3,
    },
    {
      name: "gpt-5.1-codex-mini",
      displayName: "GPT 5.1 Codex Mini",
      description: "OpenAI's compact and efficient coding model",
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 2,
    },
    {
      name: "gpt-5",
      displayName: "GPT 5",
      description: "OpenAI's flagship model",
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 3,
    },
    {
      name: "gpt-5-codex",
      displayName: "GPT 5 Codex",
      description: "OpenAI's flagship model optimized for coding",
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 3,
    },
    {
      name: "gpt-5-mini",
      displayName: "GPT 5 Mini",
      description: "OpenAI's lightweight, but intelligent model",
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      temperature: 1,
      dollarSigns: 2,
    },
  ],
  anthropic: [
    {
      name: "claude-opus-4-5",
      displayName: "Claude Opus 4.5",
      description:
        "Anthropic's best model for coding (note: this model is very expensive!)",
      maxOutputTokens: 32_000,
      contextWindow: 200_000,
      temperature: 0,
      dollarSigns: 5,
    },
    {
      name: "claude-sonnet-4-5-20250929",
      displayName: "Claude Sonnet 4.5",
      description:
        "Anthropic's best model for coding (note: >200k tokens is very expensive!)",
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 0,
      dollarSigns: 5,
    },
    {
      name: "claude-sonnet-4-20250514",
      displayName: "Claude Sonnet 4",
      description: "Excellent coder (note: >200k tokens is very expensive!)",
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 0,
      dollarSigns: 5,
    },
  ],
  google: [
    {
      name: "gemini-3-pro-preview",
      displayName: "Gemini 3 Pro (Preview)",
      description: "Google's latest Gemini model",
      maxOutputTokens: 65_536 - 1,
      contextWindow: 1_048_576,
      temperature: 1.0,
      dollarSigns: 4,
    },
    {
      name: "gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      description: "Google's Gemini 2.5 Pro model",
      maxOutputTokens: 65_536 - 1,
      contextWindow: 1_048_576,
      temperature: 0,
      dollarSigns: 3,
    },
    {
      name: "gemini-flash-latest",
      displayName: "Gemini 2.5 Flash",
      description: "Google's Gemini 2.5 Flash model (free tier available)",
      maxOutputTokens: 65_536 - 1,
      contextWindow: 1_048_576,
      temperature: 0,
      dollarSigns: 2,
    },
  ],
  vertex: [
    {
      name: "gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      description: "Vertex Gemini 2.5 Pro",
      maxOutputTokens: 65_536 - 1,
      contextWindow: 1_048_576,
      temperature: 0,
    },
    {
      name: "gemini-flash-latest",
      displayName: "Gemini 2.5 Flash",
      description: "Vertex Gemini 2.5 Flash",
      maxOutputTokens: 65_536 - 1,
      contextWindow: 1_048_576,
      temperature: 0,
    },
  ],
  openrouter: [
    {
      name: "qwen/qwen3-coder:free",
      displayName: "Qwen3 Coder (free)",
      description: "Use for free (data may be used for training)",
      maxOutputTokens: 32_000,
      contextWindow: 262_000,
      temperature: 0,
      dollarSigns: 0,
    },
    {
      name: "deepseek/deepseek-chat-v3.1:free",
      displayName: "DeepSeek v3.1 (free)",
      description: "Use for free (data may be used for training)",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      temperature: 0,
      dollarSigns: 0,
    },
    {
      name: "deepseek/deepseek-chat-v3-0324:free",
      displayName: "DeepSeek v3 (free)",
      description: "Use for free (data may be used for training)",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      temperature: 0,
      dollarSigns: 0,
    },
    {
      name: "z-ai/glm-4.6",
      displayName: "GLM 4.6",
      description: "Z-AI's best coding model",
      maxOutputTokens: 32_000,
      contextWindow: 200_000,
      temperature: 0,
      dollarSigns: 2,
    },
    {
      name: "qwen/qwen3-coder",
      displayName: "Qwen3 Coder",
      description: "Qwen's best coding model",
      maxOutputTokens: 32_000,
      contextWindow: 262_000,
      temperature: 0,
      dollarSigns: 2,
    },
    {
      name: "deepseek/deepseek-chat-v3.1",
      displayName: "DeepSeek v3.1",
      description: "Strong cost-effective model with optional thinking",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      temperature: 0,
      dollarSigns: 2,
    },
    {
      name: "moonshotai/kimi-k2-0905",
      displayName: "Kimi K2",
      description: "Powerful cost-effective model (updated to 0905)",
      maxOutputTokens: 32_000,
      contextWindow: 256_000,
      temperature: 0,
      dollarSigns: 2,
    },
  ],
  auto: [
    {
      name: "auto",
      displayName: "Auto",
      description: "Automatically selects the best model",
      tag: "Default",
      maxOutputTokens: 32_000,
      contextWindow: 200_000,
      temperature: 0,
    },
    {
      name: "free",
      displayName: "Free (OpenRouter)",
      description: "Selects from one of the free OpenRouter models",
      tag: "Free",
      maxOutputTokens: 32_000,
      contextWindow: 128_000,
      temperature: 0,
    },
    {
      name: "turbo",
      displayName: "Turbo (Pro)",
      description: "Use very fast open-source frontier models",
      maxOutputTokens: 32_000,
      contextWindow: 256_000,
      temperature: 0,
      tag: "Fast",
      tagColor: "bg-rose-800 text-white",
    },
    {
      name: "value",
      displayName: "Super Value (Pro)",
      description: "Uses the most cost-effective models available",
      maxOutputTokens: 32_000,
      contextWindow: 256_000,
      temperature: 0,
      tag: "Budget",
      tagColor: "bg-emerald-700 text-white",
    },
  ],
  azure: [
    {
      name: "gpt-5.1",
      displayName: "GPT-5.1",
      description: "Azure OpenAI GPT-5.1 model",
      contextWindow: 400_000,
      temperature: 1,
    },
    {
      name: "gpt-5.1-codex",
      displayName: "GPT-5.1 Codex",
      description: "Azure OpenAI GPT-5.1 Codex model",
      contextWindow: 400_000,
      temperature: 1,
    },
    {
      name: "gpt-5.1-codex-mini",
      displayName: "GPT-5.1 Codex Mini",
      description: "Azure OpenAI GPT-5.1 Codex Mini model",
      contextWindow: 400_000,
      temperature: 1,
    },
    {
      name: "gpt-5-codex",
      displayName: "GPT-5 Codex",
      description: "Azure OpenAI GPT-5 Codex model",
      contextWindow: 400_000,
      temperature: 1,
    },
    {
      name: "gpt-5",
      displayName: "GPT-5",
      description: "Azure OpenAI GPT-5 model with reasoning capabilities",
      contextWindow: 400_000,
      temperature: 1,
    },
    {
      name: "gpt-5-mini",
      displayName: "GPT-5 Mini",
      description: "Azure OpenAI GPT-5 Mini model",
      contextWindow: 400_000,
      temperature: 1,
    },
    {
      name: "gpt-5-nano",
      displayName: "GPT-5 Nano",
      description: "Azure OpenAI GPT-5 Nano model",
      contextWindow: 400_000,
      temperature: 1,
    },
    {
      name: "gpt-5-chat",
      displayName: "GPT-5 Chat",
      description: "Azure OpenAI GPT-5 Chat model",
      contextWindow: 128_000,
      temperature: 1,
    },
  ],
  xai: [
    {
      name: "grok-code-fast-1",
      displayName: "Grok Code Fast",
      description: "Fast coding model",
      maxOutputTokens: 32_000,
      contextWindow: 256_000,
      temperature: 0,
      dollarSigns: 1,
    },
    {
      name: "grok-4",
      displayName: "Grok 4",
      description: "Most capable coding model",
      maxOutputTokens: 32_000,
      contextWindow: 256_000,
      temperature: 0,
      dollarSigns: 4,
    },
    {
      name: "grok-3",
      displayName: "Grok 3",
      description: "Powerful coding model",
      maxOutputTokens: 32_000,
      contextWindow: 131_072,
      temperature: 0,
      dollarSigns: 4,
    },
  ],
  bedrock: [
    {
      name: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
      displayName: "Claude 4.5 Sonnet",
      description:
        "Anthropic's best model for coding (note: >200k tokens is very expensive!)",
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 0,
    },
    {
      name: "us.anthropic.claude-sonnet-4-20250514-v1:0",
      displayName: "Claude 4 Sonnet",
      description: "Excellent coder (note: >200k tokens is very expensive!)",
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 0,
    },
  ],
};

export const PROVIDER_TO_ENV_VAR: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  azure: "AZURE_API_KEY",
  xai: "XAI_API_KEY",
  bedrock: "AWS_BEARER_TOKEN_BEDROCK",
};

export const CLOUD_PROVIDERS: Record<
  string,
  {
    displayName: string;
    hasFreeTier?: boolean;
    websiteUrl?: string;
    gatewayPrefix: string;
    secondary?: boolean;
  }
> = {
  openai: {
    displayName: "OpenAI",
    hasFreeTier: false,
    websiteUrl: "https://platform.openai.com/api-keys",
    gatewayPrefix: "",
  },
  anthropic: {
    displayName: "Anthropic",
    hasFreeTier: false,
    websiteUrl: "https://console.anthropic.com/settings/keys",
    gatewayPrefix: "anthropic/",
  },
  google: {
    displayName: "Google",
    hasFreeTier: true,
    websiteUrl: "https://aistudio.google.com/app/apikey",
    gatewayPrefix: "gemini/",
  },
  vertex: {
    displayName: "Google Vertex AI",
    hasFreeTier: false,
    websiteUrl: "https://console.cloud.google.com/vertex-ai",
    gatewayPrefix: "gemini/",
    secondary: true,
  },
  openrouter: {
    displayName: "OpenRouter",
    hasFreeTier: true,
    websiteUrl: "https://openrouter.ai/settings/keys",
    gatewayPrefix: "openrouter/",
  },
  azure: {
    displayName: "Azure OpenAI",
    hasFreeTier: false,
    websiteUrl: "https://portal.azure.com/",
    gatewayPrefix: "",
    secondary: true,
  },
  xai: {
    displayName: "xAI",
    hasFreeTier: false,
    websiteUrl: "https://console.x.ai/",
    gatewayPrefix: "xai/",
    secondary: true,
  },
  bedrock: {
    displayName: "AWS Bedrock",
    hasFreeTier: false,
    websiteUrl: "https://console.aws.amazon.com/bedrock/",
    gatewayPrefix: "bedrock/",
    secondary: true,
  },
};

export const LOCAL_PROVIDERS: Record<
  string,
  {
    displayName: string;
    hasFreeTier: boolean;
  }
> = {
  ollama: {
    displayName: "Ollama",
    hasFreeTier: true,
  },
  lmstudio: {
    displayName: "LM Studio",
    hasFreeTier: true,
  },
};

export const CUSTOM_PROVIDER_PREFIX = "custom::";

export function isCustomProvider(providerId: string): boolean {
  return providerId.startsWith(CUSTOM_PROVIDER_PREFIX);
}
