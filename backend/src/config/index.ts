import { and } from "drizzle-orm/sql/expressions/conditions";
import { z } from "zod";

const configSchema = z.object({
  // AI / LLM - Claude Agent SDK
  //
  // Configure EITHER (A) Anthropic API OR (B) AWS Bedrock - not both.
  // See docs/getting-started.md for setup instructions.
  AGENT_MODEL: z.string().min(1, "AGENT_MODEL is required"),
  CLAUDE_CODE_USE_BEDROCK: z.enum(["0", "1"]),
  //
  // (A) Claude Agent SDK: Anthropic direct API
  ANTHROPIC_API_KEY: z.string().optional(),
  //
  // (B) Claude Agent SDK: AWS Bedrock
  AWS_AUTH_MODE: z.enum(["explicit", "pod-identity"]).optional(),
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_SESSION_TOKEN: z.string().optional(),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Security
  // JWT expiration uses ms format: e.g., 60s, 15m, 2h, 7d, 1w, 1y
  JWT_ACCESS_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, "JWT_ACCESS_EXPIRES_IN must be in time format (e.g., 60s, 15m, 2h, 7d)"),
  JWT_REFRESH_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, "JWT_REFRESH_EXPIRES_IN must be in time format (e.g., 60s, 15m, 2h, 7d)"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be 64 hex characters (32 bytes)"),

  // ProGet API key for @spreetail npm packages
  PROGET_API_KEY: z.string().min(1, "PROGET_API_KEY is required"),

  // Data Platform (Starburst Galaxy / Trino)
  // These are passed to app containers for data access
  // Required - backend will crash on startup if not configured
  DATA_PLATFORM_HOST: z.string().min(1, "DATA_PLATFORM_HOST is required"),
  DATA_PLATFORM_USER: z.string().min(1, "DATA_PLATFORM_USER is required"),
  DATA_PLATFORM_PASSWORD: z.string().min(1, "DATA_PLATFORM_PASSWORD is required"),
  DATA_PLATFORM_PORT: z.coerce.number().default(443),
  DATA_PLATFORM_SSL: z.string().default("true"),

  // Server
  NODE_ENV: z.enum(["development", "production", "test"]),
  BACKEND_PORT: z.coerce.number().min(1, "BACKEND_PORT is required"),
  BACKEND_HOST: z.string().min(1, "BACKEND_HOST is required"),
  CORS_ORIGIN: z.string().optional(),
  
  // Docker-Compliant Host Configuration
  // Set DOCKER_USE_SOCKET=1 with DOCKER_SOCKET,
  // or DOCKER_USE_SOCKET=0 with DOCKER_URL_HOST and DOCKER_URL_PORT for TCP
  DOCKER_USE_SOCKET: z.enum(["0", "1"]),
  DOCKER_SOCKET: z.string().optional(),
  DOCKER_URL_HOST: z.string().optional(),
  DOCKER_URL_PORT: z.string().optional(),

  // Container Settings
  CONTAINER_IMAGE: z.string().min(1, "CONTAINER_IMAGE is required"),
  CONTAINER_NETWORK: z.string().min(1, "CONTAINER_NETWORK is required"),
  CONTAINER_IDLE_TIMEOUT_MS: z.coerce.number().min(1, "CONTAINER_IDLE_TIMEOUT_MS is required"),
  CONTAINER_SCAN_INTERVAL_MS: z.coerce.number().min(1, "CONTAINER_SCAN_INTERVAL_MS is required"),
  CONTAINER_AGENT_PORT: z.coerce.number().min(1, "CONTAINER_AGENT_PORT is required"),
  CONTAINER_DEV_PORT: z.coerce.number().min(1, "CONTAINER_DEV_PORT is required"),
  APPS_BASE_PATH: z.string().min(1, "APPS_BASE_PATH is required"),

  // Preview App build
  PREVIEW_DOMAIN: z.string().min(1, "PREVIEW_DOMAIN is required"),
  PREVIEW_PORT: z.coerce.number().min(1, "PREVIEW_PORT is required"),

  // Logging levels for Agent
  VERBOSE_AGENT_LOGGING: z.enum(["0", "1"])

}).refine(
  (data) => {
    // Option A: Anthropic API
    const hasAnthropicConfig = data.CLAUDE_CODE_USE_BEDROCK === "0" && !!data.ANTHROPIC_API_KEY;

    // Option B: AWS Bedrock (requires STS credentials from SSO)
    const hasBedrockConfig =
      data.CLAUDE_CODE_USE_BEDROCK === "1" &&
      !!data.AWS_AUTH_MODE &&
      !!data.AWS_REGION &&
      !!data.AWS_ACCESS_KEY_ID &&
      !!data.AWS_SECRET_ACCESS_KEY &&
      !!data.AWS_SESSION_TOKEN;

    return hasAnthropicConfig || hasBedrockConfig;
  },
  {
    message:
      "Either CLAUDE_CODE_USE_BEDROCK = 0 with ANTHROPIC_API_KEY -OR- CLAUDE_CODE_USE_BEDROCK = 1 with complete AWS Bedrock config (AWS_AUTH_MODE, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN) is required",
  }
).refine(
  (data) => {
    // Socket mode: requires DOCKER_SOCKET
    const hasSocketConfig = data.DOCKER_USE_SOCKET === "1" && !!data.DOCKER_SOCKET;

    // TCP mode: requires DOCKER_URL_HOST and DOCKER_URL_PORT
    const hasTcpConfig = data.DOCKER_USE_SOCKET === "0" &&
    !!data.DOCKER_URL_HOST &&
    !!data.DOCKER_URL_PORT;

    return hasSocketConfig || hasTcpConfig;
  },
  {
    message:
      "Either DOCKER_USE_SOCKET = 1 with DOCKER_SOCKET -OR- DOCKER_USE_SOCKET = 0 with DOCKER_URL_HOST and DOCKER_URL_PORT is required",
  }
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
