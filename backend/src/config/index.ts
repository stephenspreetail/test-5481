import { z } from "zod";

const configSchema = z.object({
  // Server
  BACKEND_PORT: z.coerce.number().default(3002),
  BACKEND_HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  CORS_ORIGIN: z.string().optional(),

  // Database
  DB_AUTH_MODE: z.enum(["password", "iam"]).default("password"),
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_REGION: z.string().default("us-east-1"),
  DB_SSL_CA_PATH: z.string().optional(),

  // Security
  // JWT expiration uses duration format: e.g., 60s, 15m, 2h, 7d
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, "JWT_ACCESS_EXPIRES_IN must be in time format (e.g., 60s, 15m, 2h, 7d)")
    .default("15m"),
  JWT_REFRESH_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, "JWT_REFRESH_EXPIRES_IN must be in time format (e.g., 60s, 15m, 2h, 7d)")
    .default("7d"),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be 64 hex characters (32 bytes)"),

  // LLM Provider Configuration
  // Explicit provider selection: "anthropic" | "azure" | "bedrock"
  // If not set, provider is auto-detected from other env vars (backward compatibility)
  LLM_PROVIDER: z.enum(["anthropic", "azure", "bedrock"]).optional(),

  // Claude Agent SDK / Anthropic API
  ANTHROPIC_API_KEY: z.string().optional(),
  // Azure Foundry Anthropic endpoint (optional)
  ANTHROPIC_BASE_URL: z.string().optional(),
  // Model deployment name (for Azure) or model ID (for Anthropic API)
  AGENT_MODEL: z.string().default("claude-opus-4-6"),

  // Model alias overrides (optional - defaults are provider-specific)
  ANTHROPIC_DEFAULT_OPUS_MODEL: z.string().optional(),
  ANTHROPIC_DEFAULT_SONNET_MODEL: z.string().optional(),
  ANTHROPIC_DEFAULT_HAIKU_MODEL: z.string().optional(),
  CLAUDE_CODE_SUBAGENT_MODEL: z.string().optional(),

  // AWS Bedrock (alternative to Anthropic API)
  CLAUDE_CODE_USE_BEDROCK: z.string().optional(),
  AWS_AUTH_MODE: z.enum(["explicit", "pod-identity"]).optional(),
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_SESSION_TOKEN: z.string().optional(),

  // ProGet API key for @spreetail npm packages
  PROGET_API_KEY: z.string().min(1, "PROGET_API_KEY is required"),

  // Container Settings
  CONTAINER_IMAGE: z.string().default("kova-app-container:latest"),
  CONTAINER_IDLE_TIMEOUT_MS: z.coerce.number().default(15 * 60 * 1000),
  CONTAINER_NETWORK: z.string().default("kova-network"),
  CONTAINER_AGENT_PORT: z.coerce.number().default(3100),
  CONTAINER_DEV_PORT: z.coerce.number().default(3000),
  CONTAINER_SCAN_INTERVAL_MS: z.coerce.number().default(60 * 1000),
  APPS_BASE_PATH: z.string().default("/data/kova-apps"),

  // Data Platform (Starburst Galaxy / Trino)
  DATA_PLATFORM_HOST: z.string().min(1, "DATA_PLATFORM_HOST is required"),
  DATA_PLATFORM_USER: z.string().min(1, "DATA_PLATFORM_USER is required"),
  DATA_PLATFORM_PASSWORD: z.string().min(1, "DATA_PLATFORM_PASSWORD is required"),
  DATA_PLATFORM_PORT: z.coerce.number().default(443),
  DATA_PLATFORM_SSL: z.string().default("true"),

  // Kubernetes Environment
  K8S_ENVIRONMENT: z.enum(["local", "eks-app-admin", "eks-dev", "eks-prod"]).optional(),
  K8S_CONTEXT: z.string().optional(),
  K8S_NAMESPACE: z.string().optional(),
  PREVIEW_DOMAIN: z.string().optional(),
  PREVIEW_PORT: z.coerce.number().optional(),

  // GitLab token for private plugin marketplace (read_repository scope)
  GITLAB_TOKEN: z.string().min(1, "GITLAB_TOKEN is required"),
  // HTTPS git URL of the plugin marketplace repo (cloned at container startup)
  KOVA_PLUGIN_REPO: z.string().url().startsWith("https://", "KOVA_PLUGIN_REPO must be an HTTPS URL"),
  // Plugin directory name within the marketplace repo
  KOVA_PLUGIN_NAME: z.string().min(1, "KOVA_PLUGIN_NAME is required"),

  // Logging
  VERBOSE_AGENT_LOGGING: z.enum(["0", "1"]).default("0"),
}).refine(
  (data) => {
    // Database config validation
    if (data.DB_AUTH_MODE === "password") {
      return !!data.DATABASE_URL;
    }
    // IAM mode requires individual connection fields
    return !!data.DB_HOST && !!data.DB_NAME && !!data.DB_USER;
  },
  {
    message:
      "Database config required: set DATABASE_URL for password mode, or DB_HOST + DB_NAME + DB_USER for IAM mode",
  },
).refine(
  (data) => {
    // LLM provider validation: must have valid credentials for at least one provider
    // Skip validation if LLM_PROVIDER is explicitly set (provider service handles it)
    if (data.LLM_PROVIDER) return true;

    // Auto-detect: Anthropic API key OR Bedrock credentials
    const hasAnthropicKey = !!data.ANTHROPIC_API_KEY;
    const hasBedrockConfig =
      data.CLAUDE_CODE_USE_BEDROCK === "1" &&
      !!data.AWS_REGION;

    return hasAnthropicKey || hasBedrockConfig;
  },
  {
    message:
      "LLM credentials required: set LLM_PROVIDER, or provide ANTHROPIC_API_KEY, or set CLAUDE_CODE_USE_BEDROCK=1 with AWS_REGION",
  },
);

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    console.error("Invalid configuration:");
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
