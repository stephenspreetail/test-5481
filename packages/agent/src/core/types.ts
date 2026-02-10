/**
 * Core types for kovaQuery
 */

import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { SystemPromptConfig } from "../types/index.js";

/**
 * Options for kovaQuery
 */
export interface KovaQueryOptions {
  /** Working directory for file operations */
  cwd?: string;
  /** Session ID to resume a previous session */
  sessionId?: string;
  /** Allowed tools for this query */
  allowedTools?: string[];
  /** System prompt configuration or legacy string */
  systemPrompt?: SystemPromptConfig | string;
  /** Model to use for this query (defaults to AGENT_MODEL env var) */
  model?: string;
  /** Maximum turns for the agent */
  maxTurns?: number;
  /** MCP server configurations */
  mcpServers?: Record<string, McpServerConfig>;
  /** AI Provider API key */
  apiKey?: string;
}
