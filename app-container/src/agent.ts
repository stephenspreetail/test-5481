/**
 * Agent wrapper for Claude Agent SDK
 * Handles session management and event streaming
 *
 * Set VERBOSE_AGENT_LOGGING=true for detailed logging
 */

import { query, type McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { resolve } from "node:path";
import {
  dataCatalogMcpServer,
  initializeDataCatalog,
} from "../data-platform/mcp-server/index.js";
import type { AgentStreamEvent, SystemPromptConfig } from "./types.js";
import { DEFAULT_TOOLS } from "./types.js";

// Initialize the data catalog on module load
initializeDataCatalog();

/**
 * Options for agent query
 */
export interface AgentQueryOptions {
  /** Working directory for file operations */
  cwd: string;
  /** Session ID to resume a previous session */
  sessionId?: string;
  /** Allowed tools for this query */
  allowedTools?: string[];
  /** System prompt - either preset config object or legacy string */
  systemPrompt?: SystemPromptConfig | string;
}

// ANSI color codes
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

/**
 * Check if verbose logging is enabled
 */
function isVerbose(): boolean {
  return (
    process.env.VERBOSE_AGENT_LOGGING === "true" ||
    process.env.DEBUG_CLAUDE_AGENT_SDK === "true" ||
    true
  ); // Always verbose for now during debugging
}

/**
 * Log with timestamp, category, and optional JSON formatting
 * Color coded: timestamp (yellow), source (green)
 */
function log(category: string, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  console.log(`${YELLOW}[${timestamp}]${RESET} ${GREEN}[Agent:${category}]${RESET} ${message}`);
  if (data !== undefined && isVerbose()) {
    if (typeof data === "string") {
      console.log(data);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

/**
 * Check if systemPrompt is a preset config object
 */
function isPresetConfig(
  prompt: SystemPromptConfig | string | undefined,
): prompt is SystemPromptConfig {
  return (
    typeof prompt === "object" && prompt !== null && prompt.type === "preset"
  );
}

/**
 * Log the full system prompt (multi-line)
 */
function logSystemPrompt(systemPrompt: SystemPromptConfig | string): void {
  const timestamp = new Date().toISOString();
  console.log("=".repeat(80));
  console.log(`${YELLOW}[${timestamp}]${RESET} ${GREEN}[Agent:SYSTEM_PROMPT]${RESET} CONFIG:`);
  console.log("=".repeat(80));
  if (isPresetConfig(systemPrompt)) {
    console.log(`Type: preset`);
    console.log(`Preset: ${systemPrompt.preset}`);
    console.log(`Append (${systemPrompt.append.length} chars):`);
    console.log(systemPrompt.append);
  } else {
    console.log(`Type: legacy string (${systemPrompt.length} chars)`);
    console.log(systemPrompt);
  }
  console.log("=".repeat(80));
}

/**
 * Log SDK message in verbose mode
 */
function logSdkMessage(message: unknown): void {
  if (!isVerbose()) return;

  const timestamp = new Date().toISOString();
  console.log("-".repeat(60));
  console.log(`${YELLOW}[${timestamp}]${RESET} ${GREEN}[Agent:SDK]${RESET} Raw message received:`);
  console.log(JSON.stringify(message, null, 2));
  console.log("-".repeat(60));
}

/**
 * Execute a streaming agent query
 * Returns an async generator that yields events as they occur
 */
export async function* streamQuery(
  prompt: string,
  options: AgentQueryOptions,
): AsyncGenerator<AgentStreamEvent> {
  const startTime = Date.now();
  let sessionId: string | undefined;
  let messageCount = 0;
  let resultReceived = false;

  // Ensure cwd is absolute
  const absoluteCwd = resolve(options.cwd);

  // Log query start
  log("INIT", "Starting agent query", {
    prompt,
    cwd: absoluteCwd,
    sessionId: options.sessionId,
    allowedTools: options.allowedTools,
    hasSystemPrompt: !!options.systemPrompt,
  });

  // Log full system prompt
  if (options.systemPrompt) {
    logSystemPrompt(options.systemPrompt);
  } else {
    log("WARN", "No system prompt provided - using SDK defaults");
  }

  try {
    const queryOptions: {
      allowedTools?: string[];
      permissionMode?: "default" | "bypassPermissions" | "acceptEdits" | "plan";
      allowDangerouslySkipPermissions?: boolean;
      cwd?: string;
      resume?: string;
      systemPrompt?: SystemPromptConfig | string;
      maxTurns?: number;
      mcpServers?: Record<string, McpServerConfig>;
      settingSources?: ("project" | "user")[];
    } = {
      allowedTools:
        options.allowedTools || (DEFAULT_TOOLS as unknown as string[]),
      permissionMode: "bypassPermissions" as const,
      allowDangerouslySkipPermissions: true,
      cwd: absoluteCwd,
      maxTurns: 50,
      // Load project-level skills from .claude/skills/
      settingSources: ["project"],
      // Configure MCP servers
      mcpServers: {
        // Spreetail engineering AI agent (external HTTP server)
        "spreetail-engineering-ai-agent": {
          type: "http",
          url: "https://spreetail-engineering-ai-agent.prod01.tk.dev/mcp",
        },
        // Data Catalog (in-process SDK MCP server)
        "data-catalog": dataCatalogMcpServer,
      },
    };

    if (options.sessionId) {
      queryOptions.resume = options.sessionId;
      log("SESSION", `Resuming session: ${options.sessionId}`);
    }

    // Pass systemPrompt - supports both preset config and legacy string
    if (options.systemPrompt) {
      queryOptions.systemPrompt = options.systemPrompt;
    }

    log("MCP", "Configured MCP servers:", Object.keys(queryOptions.mcpServers || {}));

    log("QUERY", "Calling Claude Agent SDK with options:", {
      allowedTools: queryOptions.allowedTools,
      permissionMode: queryOptions.permissionMode,
      cwd: queryOptions.cwd,
      maxTurns: queryOptions.maxTurns,
      settingSources: queryOptions.settingSources,
      systemPrompt: queryOptions.systemPrompt
        ? isPresetConfig(queryOptions.systemPrompt)
          ? `[preset: ${queryOptions.systemPrompt.preset}, append: ${queryOptions.systemPrompt.append.length} chars]`
          : `[legacy string: ${queryOptions.systemPrompt.length} chars]`
        : undefined,
    });

    for await (const message of query({
      prompt,
      options: queryOptions,
    })) {
      messageCount++;

      // Log raw SDK message
      logSdkMessage(message);

      // Handle different message types from the SDK
      if (
        typeof message === "object" &&
        message !== null &&
        "type" in message
      ) {
        const msg = message as Record<string, unknown>;

        // Session initialization message
        if (msg.type === "system" && msg.subtype === "init") {
          sessionId = msg.session_id as string;
          log("SESSION", `Session initialized: ${sessionId}`);
          yield {
            type: "session_init",
            sessionId,
          };
        }

        // Text content from assistant
        if (msg.type === "assistant" && msg.message) {
          const assistantMsg = msg.message as Record<string, unknown>;
          log("ASSISTANT", "Received assistant message", {
            stopReason: assistantMsg.stop_reason,
            contentBlocks: Array.isArray(assistantMsg.content)
              ? assistantMsg.content.length
              : 0,
          });

          if (Array.isArray(assistantMsg.content)) {
            for (const block of assistantMsg.content) {
              if (
                typeof block === "object" &&
                block !== null &&
                "type" in block
              ) {
                const contentBlock = block as Record<string, unknown>;
                if (contentBlock.type === "text" && contentBlock.text) {
                  const text = contentBlock.text as string;
                  log(
                    "TEXT",
                    `Text content (${text.length} chars)`,
                    isVerbose()
                      ? text.substring(0, 500) +
                          (text.length > 500 ? "..." : "")
                      : undefined,
                  );
                  yield {
                    type: "text",
                    text,
                  };
                } else if (contentBlock.type === "tool_use") {
                  const toolName = contentBlock.name as string;
                  const toolInput = contentBlock.input;
                  log("TOOL_USE", `Tool: ${toolName}`, toolInput);
                  yield {
                    type: "tool_use",
                    toolName,
                    toolInput,
                  };
                }
              }
            }
          }
        }

        // Tool results
        if (msg.type === "user" && msg.message) {
          const userMsg = msg.message as Record<string, unknown>;
          if (Array.isArray(userMsg.content)) {
            for (const block of userMsg.content) {
              if (
                typeof block === "object" &&
                block !== null &&
                "type" in block
              ) {
                const contentBlock = block as Record<string, unknown>;
                if (contentBlock.type === "tool_result") {
                  const toolUseId = contentBlock.tool_use_id as string;
                  const isError = contentBlock.is_error as boolean;
                  log("TOOL_RESULT", `Tool result for ${toolUseId}`, {
                    isError,
                    contentPreview:
                      typeof contentBlock.content === "string"
                        ? (contentBlock.content as string).substring(0, 200)
                        : "[complex content]",
                  });
                  yield {
                    type: "tool_result",
                    content: contentBlock.content,
                  };
                }
              }
            }
          }
        }

        // Final result
        if ("result" in msg) {
          const durationMs = Date.now() - startTime;
          const result = msg.result as string;
          resultReceived = true;
          log("RESULT", `Query completed in ${durationMs}ms`, {
            resultLength: result?.length || 0,
            totalMessages: messageCount,
          });
          yield {
            type: "result",
            sessionId,
            result,
            durationMs,
          };
        }
      }
    }

    log("DONE", `Stream ended after ${messageCount} messages`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    const errorStack = error instanceof Error ? error.stack : undefined;

    // If we already received a successful result, ignore process exit errors
    // This happens when background tasks are started (e.g., dev server)
    // The Claude Code process exits with code 1 but the query was successful
    if (resultReceived && errorMessage.includes("process exited with code")) {
      log(
        "WARN",
        `Ignoring post-result process exit error: ${errorMessage}`,
      );
      return;
    }

    log("ERROR", `${RED}Query failed: ${errorMessage}${RESET}`);
    if (errorStack) {
      const timestamp = new Date().toISOString();
      console.error(`${YELLOW}[${timestamp}]${RESET} ${GREEN}[Agent:ERROR]${RESET} ${RED}Stack trace:${RESET}`, errorStack);
    }

    yield {
      type: "error",
      error: errorMessage,
    };
  }
}

/**
 * Execute a query and wait for the complete result
 */
export async function executeQuery(
  prompt: string,
  options: AgentQueryOptions,
): Promise<{ sessionId: string; result: string; durationMs: number }> {
  let sessionId = "";
  let result = "";
  let durationMs = 0;

  for await (const event of streamQuery(prompt, options)) {
    if (event.type === "session_init") {
      sessionId = event.sessionId;
    }
    if (event.type === "result") {
      result = event.result;
      durationMs = event.durationMs;
      if (event.sessionId) {
        sessionId = event.sessionId;
      }
    }
    if (event.type === "error") {
      throw new Error(event.error);
    }
  }

  return { sessionId, result, durationMs };
}
