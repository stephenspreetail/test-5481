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
 * Request body for the /query endpoint
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
}

/**
 * SSE event types sent by the agent server
 */
export type AgentEventType =
  | "session_init"
  | "text"
  | "tool_use"
  | "tool_result"
  | "result"
  | "error";

/**
 * Base SSE event structure
 */
export interface AgentEvent {
  type: AgentEventType;
}

/**
 * Session initialization event
 */
export interface SessionInitEvent extends AgentEvent {
  type: "session_init";
  sessionId: string;
}

/**
 * Text content event
 */
export interface TextEvent extends AgentEvent {
  type: "text";
  text: string;
}

/**
 * Tool use event
 */
export interface ToolUseEvent extends AgentEvent {
  type: "tool_use";
  toolName: string;
  toolInput: unknown;
}

/**
 * Tool result event
 */
export interface ToolResultEvent extends AgentEvent {
  type: "tool_result";
  content: unknown;
}

/**
 * Final result event
 */
export interface ResultEvent extends AgentEvent {
  type: "result";
  result: string;
  durationMs: number;
  sessionId?: string;
}

/**
 * Error event
 */
export interface ErrorEvent extends AgentEvent {
  type: "error";
  error: string;
}

/**
 * Union of all agent events
 */
export type AgentStreamEvent =
  | SessionInitEvent
  | TextEvent
  | ToolUseEvent
  | ToolResultEvent
  | ResultEvent
  | ErrorEvent;

/**
 * Dev server status
 */
export type DevServerStatus = "stopped" | "starting" | "running" | "stopping" | "error";

/**
 * Health check response
 */
export interface HealthResponse {
  status: "ok" | "error";
  devServer: DevServerStatus;
  error?: string;
}

/**
 * Available tools in the Agent SDK
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
 * Default tools for code editing operations
 */
export const DEFAULT_TOOLS: AgentTool[] = [
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "Bash",
  "Skill",
];
