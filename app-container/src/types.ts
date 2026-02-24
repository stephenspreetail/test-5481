/**
 * Types for the App Container
 */

/**
 * System prompt configuration using preset with append
 */
export interface SystemPromptConfig {
  type: "preset";
  preset: "claude_code";
  append: string;
}

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

// Re-export agent event types from local agent.ts
export type {
  AgentStreamEvent,
  AgentEventType,
  SessionInitEvent,
  TextEvent,
  ToolUseEvent,
  ToolResultEvent,
  ResultEvent,
  ErrorEvent,
  AgentQueryOptions,
} from "./agent.js";

/**
 * Request body for query endpoints
 */
export interface QueryRequest {
  /** The prompt to send to the agent */
  prompt: string;
  /** Optional session ID to resume a previous session */
  sessionId?: string;
  /** Chat ID for tracking */
  chatId?: string;
  /** Allowed tools for this query */
  allowedTools?: string[];
  /** System prompt config (preset with append) or legacy string */
  systemPrompt?: SystemPromptConfig | string;
  /** Model to use for the query */
  model?: string;
}

/**
 * Dev server status
 */
export type DevServerStatus =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

/**
 * Health check response
 */
export interface HealthResponse {
  status: "ok" | "error";
  devServer?: DevServerStatus;
  /** Whether the dev server is serving a placeholder page (no real content yet) */
  servingPlaceholder?: boolean;
  error?: string;
}
