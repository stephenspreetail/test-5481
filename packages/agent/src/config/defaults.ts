/**
 * Default configuration values for the Kova Agent
 */

import type { McpServerConfig } from "../types/index.js";

/**
 * Default MCP servers for Kova Agent
 * Includes Spreeform documentation server for UI component guidance
 */
export const DEFAULT_MCP_SERVERS: Record<string, McpServerConfig> = {
  // Spreetail engineering AI agent - provides Spreeform component documentation
  "spreetail-engineering-ai-agent": {
    type: "http",
    url: "https://spreetail-engineering-ai-agent.prod01.tk.dev/mcp",
  },
};
