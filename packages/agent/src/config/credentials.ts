/**
 * Credentials Management for Kova Agent
 *
 * Manages data platform credentials stored in the kova data directory.
 * Credentials are loaded from ~/.local/share/kova/data-platform.env
 * and injected into the environment for CLI-created projects.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../projects/paths.js";

/**
 * Path to the data platform credentials file
 * Stored in config directory (~/.config/kova/) not data directory
 * This follows XDG conventions: credentials are configuration, not data
 */
export function getCredentialsPath(): string {
  return join(getConfigDir(), "data-platform.env");
}

/**
 * Data platform credentials
 */
export interface DataPlatformCredentials {
  host: string;
  user: string;
  password: string;
}

/**
 * Load data platform credentials from the credentials file
 * Returns undefined if credentials file doesn't exist or is incomplete
 */
export function loadDataPlatformCredentials(): DataPlatformCredentials | undefined {
  const credentialsPath = getCredentialsPath();

  // First check environment variables (allows override)
  const envHost = process.env.DATA_PLATFORM_HOST;
  const envUser = process.env.DATA_PLATFORM_USER;
  const envPassword = process.env.DATA_PLATFORM_PASSWORD;

  if (envHost && envUser && envPassword) {
    return {
      host: envHost,
      user: envUser,
      password: envPassword,
    };
  }

  // Then check credentials file
  if (!existsSync(credentialsPath)) {
    return undefined;
  }

  try {
    const content = readFileSync(credentialsPath, "utf-8");
    const credentials: Partial<DataPlatformCredentials> = {};

    // Parse .env format
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").trim();

      // Remove quotes if present
      const unquoted = value.replace(/^["']|["']$/g, "");

      switch (key.trim()) {
        case "DATA_PLATFORM_HOST":
          credentials.host = unquoted;
          break;
        case "DATA_PLATFORM_USER":
          credentials.user = unquoted;
          break;
        case "DATA_PLATFORM_PASSWORD":
          credentials.password = unquoted;
          break;
      }
    }

    if (credentials.host && credentials.user && credentials.password) {
      return credentials as DataPlatformCredentials;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Inject data platform credentials into process.env
 * Call this before starting the agent to ensure credentials are available
 */
export function injectDataPlatformCredentials(): boolean {
  const credentials = loadDataPlatformCredentials();

  if (!credentials) {
    return false;
  }

  process.env.DATA_PLATFORM_HOST = credentials.host;
  process.env.DATA_PLATFORM_USER = credentials.user;
  process.env.DATA_PLATFORM_PASSWORD = credentials.password;

  return true;
}

/**
 * Check if data platform credentials are configured
 */
export function hasDataPlatformCredentials(): boolean {
  return loadDataPlatformCredentials() !== undefined;
}

/**
 * Create a template credentials file if it doesn't exist
 */
export function createCredentialsTemplate(): string {
  const credentialsPath = getCredentialsPath();

  if (existsSync(credentialsPath)) {
    return credentialsPath;
  }

  // Ensure directory exists
  const dir = getConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const template = `# Kova Data Platform Credentials
#
# These credentials are used by the Kova CLI to connect to the data platform.
# Fill in your Starburst Galaxy service account credentials below.
#
# SECURITY: This file contains sensitive credentials.
# - Do NOT commit this file to version control
# - Keep this file readable only by your user
#

DATA_PLATFORM_HOST=your-galaxy-cluster.trino.galaxy.starburst.io
DATA_PLATFORM_USER=your-service-account@company.com
DATA_PLATFORM_PASSWORD=your-password-here
`;

  writeFileSync(credentialsPath, template, { mode: 0o600 });
  return credentialsPath;
}

/**
 * Get a helpful message about setting up credentials
 */
export function getCredentialsSetupMessage(): string {
  const credentialsPath = getCredentialsPath();

  return `
Data Platform credentials not found.

To use data platform features, create a credentials file:

  ${credentialsPath}

With the following content:

  DATA_PLATFORM_HOST=your-galaxy-cluster.trino.galaxy.starburst.io
  DATA_PLATFORM_USER=your-service-account@company.com
  DATA_PLATFORM_PASSWORD=your-password-here

Or set these as environment variables before running the CLI.
`.trim();
}

/**
 * Create or update a local .env file in a project directory with data platform credentials
 * This allows the app to run standalone (outside the CLI)
 *
 * If .env exists, only DATA_PLATFORM_* variables are updated - other variables are preserved.
 *
 * @param projectDir - The project directory path
 * @returns true if file was created/updated, false if credentials not available
 */
export function createProjectEnvFile(projectDir: string): boolean {
  const credentials = loadDataPlatformCredentials();

  if (!credentials) {
    return false;
  }

  const envPath = join(projectDir, ".env");
  let existingVars: Map<string, string> = new Map();
  let existingComments: string[] = [];

  // If .env exists, parse it to preserve non-DATA_PLATFORM variables
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();

      // Preserve comments that aren't our auto-generated header
      if (trimmed.startsWith("#") && !trimmed.includes("Auto-generated by Kova")) {
        if (!trimmed.includes("Data Platform Credentials") &&
            !trimmed.includes("Do not commit this file")) {
          existingComments.push(line);
        }
        continue;
      }

      // Skip empty lines
      if (!trimmed) continue;

      // Parse variable, skip DATA_PLATFORM_* (we'll replace them)
      const [key, ...valueParts] = trimmed.split("=");
      const keyTrimmed = key.trim();
      if (!keyTrimmed.startsWith("DATA_PLATFORM_")) {
        existingVars.set(keyTrimmed, valueParts.join("="));
      }
    }
  }

  // Build new content
  const lines: string[] = [
    "# Data Platform Credentials",
    "# Auto-generated by Kova CLI from ~/.config/kova/data-platform.env",
    "# WARNING: Do not commit this file to version control",
    "",
    `DATA_PLATFORM_HOST=${credentials.host}`,
    `DATA_PLATFORM_USER=${credentials.user}`,
    `DATA_PLATFORM_PASSWORD=${credentials.password}`,
  ];

  // Add preserved comments
  if (existingComments.length > 0) {
    lines.push("", "# User-defined variables");
    lines.push(...existingComments);
  }

  // Add preserved variables
  if (existingVars.size > 0) {
    if (existingComments.length === 0) {
      lines.push("", "# User-defined variables");
    }
    for (const [key, value] of existingVars) {
      lines.push(`${key}=${value}`);
    }
  }

  lines.push(""); // Trailing newline

  writeFileSync(envPath, lines.join("\n"), { mode: 0o600 });

  // Also ensure .env is in .gitignore
  const gitignorePath = join(projectDir, ".gitignore");
  if (existsSync(gitignorePath)) {
    const gitignore = readFileSync(gitignorePath, "utf-8");
    if (!gitignore.includes(".env")) {
      writeFileSync(gitignorePath, gitignore + "\n.env\n");
    }
  }

  return true;
}
