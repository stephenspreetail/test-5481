import { FastifyInstance } from "fastify";
import {
  AVAILABLE_TOOLS,
  TOOL_PRESETS,
} from "../../services/agent.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

export async function agentRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook("preHandler", authMiddleware);

  /**
   * GET /api/agent/tools
   * Get list of available tools and presets
   */
  app.get("/tools", async () => {
    return {
      tools: [
        {
          name: "Read",
          description: "Read any file in the working directory",
        },
        {
          name: "Write",
          description: "Create new files",
        },
        {
          name: "Edit",
          description: "Make precise edits to existing files",
        },
        {
          name: "Glob",
          description: "Find files by pattern (e.g., **/*.ts, src/**/*.py)",
        },
        {
          name: "Grep",
          description: "Search file contents with regex",
        },
        {
          name: "Bash",
          description: "Run terminal commands, scripts, git operations",
        },
        {
          name: "WebSearch",
          description: "Search the web for current information",
        },
        {
          name: "WebFetch",
          description: "Fetch and parse web page content",
        },
        {
          name: "Task",
          description: "Spawn specialized subagents for focused subtasks",
        },
      ],
      availableTools: AVAILABLE_TOOLS,
      presets: {
        readOnly: {
          description: "Read-only tools for analysis",
          tools: TOOL_PRESETS.readOnly,
        },
        codeEdit: {
          description: "Tools for code editing",
          tools: TOOL_PRESETS.codeEdit,
        },
        all: {
          description: "All available tools",
          tools: TOOL_PRESETS.all,
        },
        webEnabled: {
          description: "Tools with web access",
          tools: TOOL_PRESETS.webEnabled,
        },
      },
    };
  });

  /**
   * Note: Direct agent query/resume/fork endpoints have been removed.
   * Agent interactions now go through app-container via WebSocket.
   * Use the WebSocket /ws endpoint with chat:stream events.
   */
}
