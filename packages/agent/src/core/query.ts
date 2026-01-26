/**
 * kovaQuery - Thin wrapper around Claude Agent SDK with Spreetail defaults
 *
 * This is the core function that:
 * - Copies bundled skills to project's .claude/skills/
 * - Initializes data catalog MCP server
 * - Configures Spreetail-specific MCP servers and system prompts
 * - Yields raw SDKMessage events from the SDK
 *
 * Used by:
 * - CLI: consumes SDKMessage directly
 * - App-container: transforms to AgentStreamEvent before sending to backend
 */

import { query, type Options as SDKOptions } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage as SDKMessageType } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, mkdirSync, cpSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_TOOLS } from "../tools/constants.js";
import { DEFAULT_KOVA_SYSTEM_PROMPT } from "../config/system-prompt.js";
import { DEFAULT_MCP_SERVERS } from "../config/defaults.js";
import {
  dataCatalogMcpServer,
  initializeDataCatalog,
} from "../data-platform/index.js";
import type { KovaQueryOptions } from "./types.js";

// Re-export SDKMessage type for consumers
export type SDKMessage = SDKMessageType;

// =============================================================================
// Module-level state
// =============================================================================

/** Track which cwds have had skills copied to avoid redundant work */
const skillsEnsuredForCwd = new Set<string>();

/** Track if data catalog has been initialized */
let dataCatalogInitialized = false;

// =============================================================================
// Setup functions
// =============================================================================

/**
 * Get the directory where bundled skills are located
 */
function getBundledSkillsDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  // Skills are at ../skills relative to core/query.js (in dist)
  const distSkillsDir = join(currentDir, "..", "skills");
  if (existsSync(distSkillsDir)) {
    return distSkillsDir;
  }
  // Fallback for development
  const srcSkillsDir = join(currentDir, "..", "..", "skills");
  return srcSkillsDir;
}

/**
 * Copy bundled skills to project's .claude/skills/ directory
 * SDK only loads skills from project or user level, not from npm packages
 */
function ensureSkillsInProject(cwd: string): void {
  if (skillsEnsuredForCwd.has(cwd)) {
    return;
  }

  const bundledSkillsDir = getBundledSkillsDir();
  const projectSkillsDir = join(cwd, ".claude", "skills");

  // Check if bundled skills exist
  if (!existsSync(bundledSkillsDir)) {
    skillsEnsuredForCwd.add(cwd);
    return;
  }

  // Get list of bundled skill directories
  let bundledSkills: string[];
  try {
    bundledSkills = readdirSync(bundledSkillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    skillsEnsuredForCwd.add(cwd);
    return;
  }

  if (bundledSkills.length === 0) {
    skillsEnsuredForCwd.add(cwd);
    return;
  }

  // Ensure project .claude/skills directory exists
  if (!existsSync(projectSkillsDir)) {
    try {
      mkdirSync(projectSkillsDir, { recursive: true });
    } catch {
      skillsEnsuredForCwd.add(cwd);
      return;
    }
  }

  // Copy each bundled skill if not already present
  for (const skillName of bundledSkills) {
    const srcSkillDir = join(bundledSkillsDir, skillName);
    const destSkillDir = join(projectSkillsDir, skillName);

    // Only copy if destination doesn't exist (don't overwrite user customizations)
    if (!existsSync(destSkillDir)) {
      try {
        cpSync(srcSkillDir, destSkillDir, { recursive: true });
      } catch {
        // Continue with other skills if one fails
      }
    }
  }

  skillsEnsuredForCwd.add(cwd);
}

/**
 * Initialize data catalog if not already done
 */
function ensureDataCatalogInitialized(): void {
  if (!dataCatalogInitialized) {
    try {
      initializeDataCatalog();
      dataCatalogInitialized = true;
    } catch {
      // Data catalog is optional - continue without it
    }
  }
}

/**
 * Build environment with corrected PATH for cross-platform compatibility
 */
function buildEnvironment(apiKey?: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  // Add node directory to PATH
  const nodePath = process.execPath;
  const nodeDir = nodePath.substring(
    0,
    nodePath.lastIndexOf(process.platform === "win32" ? "\\" : "/")
  );

  if (env.PATH && !env.PATH.includes(nodeDir)) {
    env.PATH = `${nodeDir}${process.platform === "win32" ? ";" : ":"}${env.PATH}`;
  }

  // Pass API key through environment
  if (apiKey) {
    env.ANTHROPIC_API_KEY = apiKey;
  }

  return env;
}

/**
 * Build SDK options with Spreetail defaults
 */
function buildSDKOptions(options: KovaQueryOptions): SDKOptions {
  const sdkOptions: SDKOptions = {
    allowedTools: options.allowedTools || DEFAULT_TOOLS,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    executable: "node",
    env: buildEnvironment(options.apiKey),
    settingSources: ["project"],
  };

  if (options.cwd) {
    sdkOptions.cwd = options.cwd;
  }

  if (options.sessionId) {
    sdkOptions.resume = options.sessionId;
  }

  // System prompt - defaults to Kova agent prompt
  sdkOptions.systemPrompt = options.systemPrompt || DEFAULT_KOVA_SYSTEM_PROMPT;

  if (options.maxTurns) {
    sdkOptions.maxTurns = options.maxTurns;
  }

  // MCP servers: Spreetail defaults + data catalog + any custom ones
  sdkOptions.mcpServers = {
    ...DEFAULT_MCP_SERVERS,
    "data-catalog": dataCatalogMcpServer,
    ...options.mcpServers,
  } as SDKOptions["mcpServers"];

  return sdkOptions;
}

// =============================================================================
// Main export
// =============================================================================

/**
 * Execute a Kova query with Spreetail defaults
 * Yields raw SDKMessage events from the Claude Agent SDK
 *
 * @example
 * ```typescript
 * import { kovaQuery } from '@kova/agent';
 *
 * for await (const message of kovaQuery(prompt, { cwd: '/path/to/project' })) {
 *   // Handle raw SDK message
 *   if (message.type === 'assistant') {
 *     for (const block of message.message.content) {
 *       if (block.type === 'text') console.log(block.text);
 *     }
 *   }
 * }
 * ```
 */
export async function* kovaQuery(
  prompt: string,
  options: KovaQueryOptions = {}
): AsyncGenerator<SDKMessage> {
  // Setup: skills + data catalog
  if (options.cwd) {
    ensureSkillsInProject(options.cwd);
  }
  ensureDataCatalogInitialized();

  // Build SDK options and execute query
  const sdkOptions = buildSDKOptions(options);
  yield* query({ prompt, options: sdkOptions });
}
