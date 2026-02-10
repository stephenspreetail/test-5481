/**
 * LLM Provider Service
 *
 * Maps application LLM provider configuration to container environment variables.
 * This provides a clean abstraction layer between Kova's config and the Claude Agent SDK's
 * expected environment variables.
 *
 * Supported providers:
 * - anthropic: Direct Anthropic API (full model names)
 * - azure: Azure Foundry Anthropic endpoint (deployment names)
 * - bedrock: AWS Bedrock with Claude models (inference profile ARNs)
 *
 * Model Aliases:
 * The Claude Agent SDK supports model aliases (sonnet, opus, haiku, opusplan)
 * that map to provider-specific model names via environment variables:
 * - ANTHROPIC_DEFAULT_SONNET_MODEL
 * - ANTHROPIC_DEFAULT_OPUS_MODEL
 * - ANTHROPIC_DEFAULT_HAIKU_MODEL
 * - CLAUDE_CODE_SUBAGENT_MODEL
 */

import { config } from "../config/index.js";

export type LlmProvider = "anthropic" | "azure" | "bedrock";

/**
 * Default Azure Foundry base URL (Spreetail internal)
 */
const DEFAULT_AZURE_BASE_URL =
  "https://tk-dot-dev-foundry-resource.openai.azure.com/anthropic";

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

/**
 * Model alias mappings per provider
 * These map Claude Code's model aliases to provider-specific model names
 */
interface ProviderModelMap {
  default: string; // Default model for this provider
  opus: string;
  sonnet: string;
  haiku: string;
  subagent: string; // For background tasks and subagents
}

/**
 * Provider-specific model name mappings
 */
const PROVIDER_MODELS: Record<LlmProvider, ProviderModelMap> = {
  // Anthropic API: Full model names
  anthropic: {
    default: "claude-opus-4-6", // Default to Opus for API
    opus: "claude-opus-4-6",
    sonnet: "claude-sonnet-4-5-20250929",
    haiku: "claude-haiku-4-5",
    subagent: "claude-sonnet-4-5-20250929",
  },

  // Azure Foundry: Deployment names (Spreetail internal)
  azure: {
    default: "claude-opus-4-6", // Default to Opus for Foundry
    opus: "claude-opus-4-6",
    sonnet: "claude-sonnet-4-5",
    haiku: "claude-haiku-4-5",
    subagent: "claude-sonnet-4-5",
  },

  // AWS Bedrock: Inference profile ARNs
  bedrock: {
    default: "us.anthropic.claude-sonnet-4-5-20250929-v1:0", // Default to Sonnet for Bedrock
    opus: "us.anthropic.claude-opus-4-6-v1:0",
    sonnet: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    haiku: "us.anthropic.claude-haiku-4-5-v1:0",
    subagent: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  },
};

/**
 * Build environment variables for the app container based on LLM provider
 */
export function buildLlmEnvironment(
  providerConfig: LlmProviderConfig
): Record<string, string> {
  const env: Record<string, string> = {};

  // Get provider-specific model mappings (with config overrides)
  const modelMap = PROVIDER_MODELS[providerConfig.provider];

  // Set model alias environment variables for Claude Agent SDK
  // Allow explicit config overrides to take precedence over provider defaults
  env.ANTHROPIC_DEFAULT_OPUS_MODEL =
    config.ANTHROPIC_DEFAULT_OPUS_MODEL || modelMap.opus;
  env.ANTHROPIC_DEFAULT_SONNET_MODEL =
    config.ANTHROPIC_DEFAULT_SONNET_MODEL || modelMap.sonnet;
  env.ANTHROPIC_DEFAULT_HAIKU_MODEL =
    config.ANTHROPIC_DEFAULT_HAIKU_MODEL || modelMap.haiku;
  env.CLAUDE_CODE_SUBAGENT_MODEL =
    config.CLAUDE_CODE_SUBAGENT_MODEL || modelMap.subagent;

  switch (providerConfig.provider) {
    case "anthropic":
      // Direct Anthropic API (https://api.anthropic.com)
      if (providerConfig.apiKey) {
        env.ANTHROPIC_API_KEY = providerConfig.apiKey;
      }
      env.AGENT_MODEL = providerConfig.model;
      env.ANTHROPIC_MODEL = providerConfig.model;
      break;

    case "azure":
      // Azure Foundry Anthropic endpoint
      if (providerConfig.apiKey) {
        env.ANTHROPIC_API_KEY = providerConfig.apiKey;
      }
      if (providerConfig.baseUrl) {
        env.ANTHROPIC_BASE_URL = providerConfig.baseUrl;
      }
      env.AGENT_MODEL = providerConfig.model;
      env.ANTHROPIC_MODEL = providerConfig.model;
      break;

    case "bedrock":
      // AWS Bedrock
      env.CLAUDE_CODE_USE_BEDROCK = "1";
      env.AGENT_MODEL = providerConfig.model;
      env.ANTHROPIC_MODEL = providerConfig.model;

      if (providerConfig.awsRegion) {
        env.AWS_REGION = providerConfig.awsRegion;
      }

      // AWS credentials - only pass if using explicit auth mode
      // In pod-identity mode, omit credentials and let Pod Identity inject them
      if (providerConfig.awsAuthMode === "explicit") {
        if (providerConfig.awsAccessKeyId) {
          env.AWS_ACCESS_KEY_ID = providerConfig.awsAccessKeyId;
        }
        if (providerConfig.awsSecretAccessKey) {
          env.AWS_SECRET_ACCESS_KEY = providerConfig.awsSecretAccessKey;
        }
        if (providerConfig.awsSessionToken) {
          env.AWS_SESSION_TOKEN = providerConfig.awsSessionToken;
        }
      }
      break;
  }

  return env;
}

/**
 * Detect LLM provider from environment configuration
 * This provides backward compatibility with existing configs
 */
export function detectLlmProvider(): LlmProvider {
  // Explicit provider config takes precedence
  if (config.LLM_PROVIDER) {
    return config.LLM_PROVIDER as LlmProvider;
  }

  // Legacy detection: infer from environment variables
  if (config.CLAUDE_CODE_USE_BEDROCK === "1") {
    return "bedrock";
  }

  if (config.ANTHROPIC_BASE_URL) {
    // If base URL is set, assume Azure (most common case)
    // Direct Anthropic API uses default URL
    return "azure";
  }

  // Default to direct Anthropic API
  return "anthropic";
}

/**
 * Build LLM provider config from application config
 */
export function buildLlmProviderConfig(): LlmProviderConfig {
  const provider = detectLlmProvider();

  // Use provider-specific default model if AGENT_MODEL is not explicitly set
  // or if it's set to the old schema default
  const modelMap = PROVIDER_MODELS[provider];
  const agentModel = config.AGENT_MODEL;
  const isDefaultModel =
    agentModel === "claude-opus-4-5-20251101" || // Old schema default
    agentModel === "claude-opus-4-6"; // New schema default

  const providerConfig: LlmProviderConfig = {
    provider,
    model: isDefaultModel ? modelMap.default : agentModel,
  };

  switch (provider) {
    case "anthropic":
      providerConfig.apiKey = config.ANTHROPIC_API_KEY;
      break;

    case "azure":
      providerConfig.apiKey = config.ANTHROPIC_API_KEY;
      // Use Spreetail Azure Foundry URL as default if not explicitly set
      providerConfig.baseUrl =
        config.ANTHROPIC_BASE_URL || DEFAULT_AZURE_BASE_URL;
      break;

    case "bedrock":
      providerConfig.awsRegion = config.AWS_REGION;
      providerConfig.awsAuthMode = config.AWS_AUTH_MODE;
      providerConfig.awsAccessKeyId = config.AWS_ACCESS_KEY_ID;
      providerConfig.awsSecretAccessKey = config.AWS_SECRET_ACCESS_KEY;
      providerConfig.awsSessionToken = config.AWS_SESSION_TOKEN;
      break;
  }

  return providerConfig;
}
