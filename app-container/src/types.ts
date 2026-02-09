/**
 * Types for the App Container
 */

// Import types from @kova/agent that are still available
import type { SystemPromptConfig as KovaSystemPromptConfig, AgentTool } from "@kova/agent";

// Re-export for convenience
export type SystemPromptConfig = KovaSystemPromptConfig;
export type { AgentTool };

export { AVAILABLE_TOOLS, DEFAULT_TOOLS } from "@kova/agent";

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
