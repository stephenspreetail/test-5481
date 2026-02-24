/**
 * Agent Service
 *
 * Provides agent-related types and utilities for the backend.
 * The actual agent execution happens in app-container via the Claude Agent SDK.
 *
 * Note: The backend communicates with app-container via HTTP/SSE,
 * so it doesn't need to import or instantiate the agent directly.
 */

import { config } from "../config/index.js";

// Re-export agent event types from local definition
export type {
  AgentStreamEvent,
  AgentEventType,
  SessionInitEvent,
  TextEvent,
  ToolUseEvent,
  ToolResultEvent,
  ResultEvent,
  ErrorEvent,
} from "../types/agent-events.js";

// =============================================================================
// Tool constants
// =============================================================================

/**
 * Available tools in the Claude Agent SDK
 */
export const AVAILABLE_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "Task",
  "Skill",
] as const;

export type AgentTool = (typeof AVAILABLE_TOOLS)[number];

/**
 * Tool presets for different use cases
 */
export const TOOL_PRESETS = {
  /** Read-only tools for analysis */
  readOnly: ["Read", "Glob", "Grep"] as AgentTool[],

  /** Tools for code editing (default) */
  codeEdit: [
    "Read",
    "Write",
    "Edit",
    "Glob",
    "Grep",
    "Bash",
    "Skill",
  ] as AgentTool[],

  /** All available tools */
  all: [...AVAILABLE_TOOLS] as AgentTool[],

  /** Web-enabled tools for research */
  webEnabled: [
    "Read",
    "Glob",
    "Grep",
    "WebSearch",
    "WebFetch",
  ] as AgentTool[],

  /** Full development tools including web access */
  fullDev: [
    "Read",
    "Write",
    "Edit",
    "Bash",
    "Glob",
    "Grep",
    "WebSearch",
    "WebFetch",
    "Skill",
  ] as AgentTool[],
} as const;

export type ToolPreset = keyof typeof TOOL_PRESETS;

/**
 * Default tools for code editing operations
 */
export const DEFAULT_TOOLS: AgentTool[] = TOOL_PRESETS.codeEdit;

// Set API key for any SDK usage (reads from environment)
if (config.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY = config.ANTHROPIC_API_KEY;
}

// Pass Azure Foundry base URL to agent if configured
if (config.ANTHROPIC_BASE_URL) {
  process.env.ANTHROPIC_BASE_URL = config.ANTHROPIC_BASE_URL;
}
