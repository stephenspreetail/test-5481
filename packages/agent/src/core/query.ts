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
import { existsSync, mkdirSync, cpSync, readdirSync, rmSync } from "node:fs";
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
 * Get the directory where bundled assets are located (skills, templates)
 */
function getBundledAssetDir(assetType: "skills" | "templates"): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  // Assets are at ../<assetType> relative to core/query.js (in dist)
  const distDir = join(currentDir, "..", assetType);
  if (existsSync(distDir)) {
    return distDir;
  }
  // Fallback for development
  const srcDir = join(currentDir, "..", "..", assetType);
  return srcDir;
}

/**
 * Get the directory where bundled skills are located
 */
function getBundledSkillsDir(): string {
  return getBundledAssetDir("skills");
}

/**
 * Get the directory where bundled templates are located
 */
function getBundledTemplatesDir(): string {
  return getBundledAssetDir("templates");
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
    console.warn(`[kova] Skills not found at ${bundledSkillsDir}`);
    skillsEnsuredForCwd.add(cwd);
    return;
  }

  // Get list of bundled skill directories
  let bundledSkills: string[];
  try {
    bundledSkills = readdirSync(bundledSkillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (err) {
    console.warn(`[kova] Failed to read skills directory: ${err}`);
    skillsEnsuredForCwd.add(cwd);
    return;
  }

  if (bundledSkills.length === 0) {
    console.warn(`[kova] No skills found in ${bundledSkillsDir}`);
    skillsEnsuredForCwd.add(cwd);
    return;
  }

  // Ensure project .claude/skills directory exists
  if (!existsSync(projectSkillsDir)) {
    try {
      mkdirSync(projectSkillsDir, { recursive: true });
    } catch (err) {
      console.warn(`[kova] Failed to create skills directory: ${err}`);
      skillsEnsuredForCwd.add(cwd);
      return;
    }
  }

  // Copy each bundled skill if not already present
  const copiedSkills: string[] = [];
  for (const skillName of bundledSkills) {
    const srcSkillDir = join(bundledSkillsDir, skillName);
    const destSkillDir = join(projectSkillsDir, skillName);

    // Only copy if destination doesn't exist (don't overwrite user customizations)
    if (!existsSync(destSkillDir)) {
      try {
        cpSync(srcSkillDir, destSkillDir, { recursive: true });
        copiedSkills.push(skillName);
      } catch (err) {
        console.warn(`[kova] Failed to copy skill ${skillName}: ${err}`);
        // Continue with other skills if one fails
      }
    }
  }

  if (copiedSkills.length > 0) {
    console.log(`[kova] Copied skills: ${copiedSkills.join(", ")}`);
  }

  skillsEnsuredForCwd.add(cwd);
}

/** Track which cwds have had templates copied to avoid redundant work */
const templatesEnsuredForCwd = new Set<string>();

/**
 * Copy bundled templates to project's .claude/templates/ directory
 * This allows the agent to find templates with a consistent path
 */
function ensureTemplatesInProject(cwd: string): void {
  if (templatesEnsuredForCwd.has(cwd)) {
    return;
  }

  const bundledTemplatesDir = getBundledTemplatesDir();
  const projectTemplatesDir = join(cwd, ".claude", "templates");

  // Check if bundled templates exist
  if (!existsSync(bundledTemplatesDir)) {
    console.warn(`[kova] Templates not found at ${bundledTemplatesDir}`);
    templatesEnsuredForCwd.add(cwd);
    return;
  }

  // Get list of bundled template directories
  let bundledTemplates: string[];
  try {
    bundledTemplates = readdirSync(bundledTemplatesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (err) {
    console.warn(`[kova] Failed to read templates directory: ${err}`);
    templatesEnsuredForCwd.add(cwd);
    return;
  }

  if (bundledTemplates.length === 0) {
    console.warn(`[kova] No templates found in ${bundledTemplatesDir}`);
    templatesEnsuredForCwd.add(cwd);
    return;
  }

  // Ensure project .claude/templates directory exists
  if (!existsSync(projectTemplatesDir)) {
    try {
      mkdirSync(projectTemplatesDir, { recursive: true });
    } catch (err) {
      console.warn(`[kova] Failed to create templates directory: ${err}`);
      templatesEnsuredForCwd.add(cwd);
      return;
    }
  }

  // Copy each bundled template (always overwrite to ensure latest version)
  const copiedTemplates: string[] = [];
  for (const templateName of bundledTemplates) {
    const srcTemplateDir = join(bundledTemplatesDir, templateName);
    const destTemplateDir = join(projectTemplatesDir, templateName);

    try {
      // Remove existing template to ensure clean copy
      if (existsSync(destTemplateDir)) {
        rmSync(destTemplateDir, { recursive: true, force: true });
      }
      cpSync(srcTemplateDir, destTemplateDir, { recursive: true });
      copiedTemplates.push(templateName);
    } catch (err) {
      console.warn(`[kova] Failed to copy template ${templateName}: ${err}`);
      // Continue with other templates if one fails
    }
  }

  if (copiedTemplates.length > 0) {
    console.log(`[kova] Copied templates: ${copiedTemplates.join(", ")}`);
  }

  templatesEnsuredForCwd.add(cwd);
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
    model: options.model || process.env.AGENT_MODEL,
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
  // Setup: skills + templates + data catalog
  if (options.cwd) {
    ensureSkillsInProject(options.cwd);
    ensureTemplatesInProject(options.cwd);
  }
  ensureDataCatalogInitialized();

  // Build SDK options and execute query
  const sdkOptions = buildSDKOptions(options);
  yield* query({ prompt, options: sdkOptions });
}
