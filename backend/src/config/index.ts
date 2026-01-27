import { z } from "zod";

const configSchema = z.object({
  // Server
  BACKEND_PORT: z.coerce.number().default(3002),
  BACKEND_HOST: z.string().default("0.0.0.0"),
  // TODO: when is this set to non-development?
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // JWT
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  // Encryption
  ENCRYPTION_KEY: z
    .string()
    .length(64, "ENCRYPTION_KEY must be 64 hex characters (32 bytes)"),

  // Docker
  // If DOCKER_SOCKET is explicitly set, that path is used.
  // Otherwise, auto-detection tries these locations in order:
  //   1. /var/run/docker.sock (default Linux/macOS)
  //   2. ~/.rd/docker.sock (Rancher Desktop)
  //   3. ~/.docker/run/docker.sock (Docker Desktop newer versions)
  DOCKER_SOCKET: z.string().default("/var/run/docker.sock"),
  DOCKER_SOCKET_WIN32: z.string().default("//./pipe/docker_engine"),
  APPS_BASE_PATH: z.string().default("/data/kova-apps"),

  // CORS
  CORS_ORIGIN: z.string().default("http://localhost:5175"),

  // Claude Agent SDK
  ANTHROPIC_API_KEY: z.string().optional(),
  AGENT_MODEL: z.string().default("claude-opus-4-5-20251101"),

  // ProGet (Internal npm registry)
  // Required for @spreetail scoped packages in app containers
  PROGET_API_KEY: z.string().min(1, "PROGET_API_KEY is required"),

  // Container Settings
  CONTAINER_IMAGE: z.string().default("kova-app-container:latest"),
  CONTAINER_IDLE_TIMEOUT_MS: z.coerce.number().default(15 * 60 * 1000),
  CONTAINER_NETWORK: z.string().default("kova-network"),
  CONTAINER_AGENT_PORT: z.coerce.number().default(3100),
  CONTAINER_DEV_PORT: z.coerce.number().default(3000),
  CONTAINER_SCAN_INTERVAL_MS: z.coerce.number().default(60 * 1000),

  // Preview (Traefik)
  PREVIEW_DOMAIN: z.string().default("localhost"),
  PREVIEW_PORT: z.coerce.number().default(8081),
  TRAEFIK_HEARTBEAT_INTERVAL_MS: z.coerce.number().default(60 * 1000),

  // Data Platform (Starburst Galaxy / Trino)
  // These are passed to app containers for data access
  // Required - backend will crash on startup if not configured
  DATA_PLATFORM_HOST: z.string().min(1, "DATA_PLATFORM_HOST is required"),
  DATA_PLATFORM_USER: z.string().min(1, "DATA_PLATFORM_USER is required"),
  DATA_PLATFORM_PASSWORD: z.string().min(1, "DATA_PLATFORM_PASSWORD is required"),
});

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
