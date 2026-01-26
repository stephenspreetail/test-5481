/**
 * Type definitions for the Kova Agent package
 */

// Re-export MCP types from Claude Agent SDK
export type {
  McpStdioServerConfig,
  McpHttpServerConfig,
  McpSSEServerConfig,
  McpServerConfig,
  McpServerConfigForProcessTransport,
} from "@anthropic-ai/claude-agent-sdk";

/**
 * System prompt configuration using preset with append
 */
export interface SystemPromptConfig {
  type: "preset";
  preset: "claude_code";
  append: string;
}

/**
 * Import tool types from constants
 */
import type { AgentTool } from "../tools/constants.js";
export type { AgentTool };
