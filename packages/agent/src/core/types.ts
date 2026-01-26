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
  /** Maximum turns for the agent */
  maxTurns?: number;
  /** MCP server configurations (merged with defaults) */
  mcpServers?: Record<string, McpServerConfig>;
  /** Anthropic API key (defaults to ANTHROPIC_API_KEY env var) */
  apiKey?: string;
}
