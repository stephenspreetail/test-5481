/**
 * Agent Service
 *
 * Provides agent-related types and utilities for the backend.
 * The actual agent execution happens in app-container via kovaQuery.
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

// Re-export tool constants from @kova/agent
export {
  AVAILABLE_TOOLS,
  TOOL_PRESETS,
  DEFAULT_TOOLS,
  type AgentTool,
  type ToolPreset,
} from "@kova/agent";

// Set API key for any SDK usage (reads from environment)
if (config.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY = config.ANTHROPIC_API_KEY;
}
