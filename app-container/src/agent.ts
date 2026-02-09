/**
 * Agent wrapper for the App Container
 *
 * Uses kovaQuery from @kova/agent and transforms raw SDKMessage
 * to AgentStreamEvent format for the backend.
 *
 * Handles:
 * - SDK message transformation to AgentStreamEvent
 * - Post-result error suppression (dev server startup errors)
 */

import { kovaQuery, type SDKMessage } from "@kova/agent";
import type { SystemPromptConfig } from "@kova/agent";
import { resolve } from "node:path";

// =============================================================================
// Verbose Logging
// =============================================================================

// ANSI color codes
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

/**
 * Check if verbose logging is enabled
 */
function isVerbose(): boolean {
  return (
    process.env.VERBOSE_AGENT_LOGGING === "1"
  );
}

/**
 * Log with timestamp, category, and optional JSON formatting
 * Color coded: timestamp (yellow), source (green)
 */
function log(category: string, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  console.log(
    `${YELLOW}[${timestamp}]${RESET} ${GREEN}[Agent:${category}]${RESET} ${message}`
  );
  if (data !== undefined && isVerbose()) {
    if (typeof data === "string") {
      console.log(data);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

/**
 * Log SDK message in verbose mode
 */
function logSdkMessage(message: SDKMessage, messageCount: number): void {
  if (!isVerbose()) return;

  const timestamp = new Date().toISOString();
  console.log("-".repeat(60));
  console.log(
    `${YELLOW}[${timestamp}]${RESET} ${CYAN}[Agent:SDK #${messageCount}]${RESET} Raw message:`
  );
  console.log(JSON.stringify(message, null, 2));
  console.log("-".repeat(60));
}

/**
 * Log the system prompt configuration
 */
function logSystemPrompt(systemPrompt: SystemPromptConfig | string): void {
  const timestamp = new Date().toISOString();
  console.log("=".repeat(80));
  console.log(
    `${YELLOW}[${timestamp}]${RESET} ${GREEN}[Agent:SYSTEM_PROMPT]${RESET} CONFIG:`
  );
  console.log("=".repeat(80));
  if (typeof systemPrompt === "object" && systemPrompt !== null) {
    console.log(`Type: ${systemPrompt.type}`);
    if (systemPrompt.type === "preset") {
      console.log(`Preset: ${systemPrompt.preset}`);
      console.log(`Append (${systemPrompt.append?.length || 0} chars):`);
      if (systemPrompt.append) {
        console.log(systemPrompt.append);
      }
    }
  } else {
    console.log(`Type: legacy string (${systemPrompt.length} chars)`);
    console.log(systemPrompt);
  }
  console.log("=".repeat(80));
}

/**
 * Log transformed event being yielded
 */
function logEvent(event: AgentStreamEvent): void {
  if (!isVerbose()) return;

  const timestamp = new Date().toISOString();
  let eventSummary: string;

  switch (event.type) {
    case "text":
      eventSummary = `text (${event.text.length} chars)`;
      break;
    case "tool_use":
      eventSummary = `tool_use: ${event.toolName}`;
      break;
    case "tool_result":
      eventSummary = "tool_result";
      break;
    case "session_init":
      eventSummary = `session_init: ${event.sessionId}`;
      break;
    case "result":
      eventSummary = `result (${event.durationMs}ms, $${event.costUsd?.toFixed(4) || "?"})`;
      break;
    case "error":
      eventSummary = `error: ${event.error}`;
      break;
    default:
      eventSummary = "unknown";
  }

  console.log(
    `${YELLOW}[${timestamp}]${RESET} ${GREEN}[Agent:EVENT]${RESET} → ${eventSummary}`
  );
}

// =============================================================================
// Types - AgentStreamEvent format for backend
// =============================================================================

/**
 * SSE event types sent to the backend
 */
export type AgentEventType =
  | "session_init"
  | "text"
  | "tool_use"
  | "tool_result"
  | "result"
  | "error";

export interface SessionInitEvent {
  type: "session_init";
  sessionId: string;
}

export interface TextEvent {
  type: "text";
  text: string;
}

export interface ToolUseEvent {
  type: "tool_use";
  toolName: string;
  toolInput?: unknown;
}

export interface ToolResultEvent {
  type: "tool_result";
  content: unknown;
}

export interface ResultEvent {
  type: "result";
  result: string;
  durationMs: number;
  sessionId?: string;
  costUsd?: number;
}

export interface ErrorEvent {
  type: "error";
  error: string;
}

export type AgentStreamEvent =
  | SessionInitEvent
  | TextEvent
  | ToolUseEvent
  | ToolResultEvent
  | ResultEvent
  | ErrorEvent;

// =============================================================================
// Query Options
// =============================================================================

export interface AgentQueryOptions {
  /** Working directory for file operations */
  cwd: string;
  /** Session ID to resume a previous session */
  sessionId?: string;
  /** Allowed tools for this query */
  allowedTools?: string[];
  /** System prompt configuration */
  systemPrompt?: SystemPromptConfig | string;
  /** Model to use for the query */
  model?: string;
}

// =============================================================================
// SDK Message Transformation
// =============================================================================

/**
 * Parse SDK message into AgentStreamEvent(s)
 * A single SDK message may produce multiple events (e.g., text + tool_use)
 */
function* parseSDKMessage(
  message: SDKMessage,
  currentSessionId: string | undefined,
  startTime: number
): Generator<AgentStreamEvent> {
  // Type guard
  if (typeof message !== "object" || message === null || !("type" in message)) {
    return;
  }

  const msg = message as Record<string, unknown>;

  // Session initialization: { type: "system", subtype: "init", session_id: "..." }
  if (msg.type === "system" && msg.subtype === "init") {
    yield {
      type: "session_init",
      sessionId: msg.session_id as string,
    };
    return;
  }

  // Assistant message with content blocks
  if (msg.type === "assistant" && msg.message) {
    const assistantMsg = msg.message as Record<string, unknown>;
    if (Array.isArray(assistantMsg.content)) {
      for (const block of assistantMsg.content) {
        if (typeof block !== "object" || block === null || !("type" in block)) {
          continue;
        }

        const contentBlock = block as Record<string, unknown>;

        if (contentBlock.type === "text" && contentBlock.text) {
          yield {
            type: "text",
            text: contentBlock.text as string,
          };
        }

        if (contentBlock.type === "tool_use") {
          yield {
            type: "tool_use",
            toolName: contentBlock.name as string,
            toolInput: contentBlock.input,
          };
        }
      }
    }
    return;
  }

  // Tool results from user message
  if (msg.type === "user" && msg.message) {
    const userMsg = msg.message as Record<string, unknown>;
    if (Array.isArray(userMsg.content)) {
      for (const block of userMsg.content) {
        if (typeof block !== "object" || block === null || !("type" in block)) {
          continue;
        }

        const contentBlock = block as Record<string, unknown>;
        if (contentBlock.type === "tool_result") {
          yield {
            type: "tool_result",
            content: contentBlock.content,
          };
        }
      }
    }
    return;
  }

  // Final result: { type: "result", result: "...", duration_ms: 123, total_cost_usd: 0.05 }
  if (msg.type === "result") {
    yield {
      type: "result",
      sessionId: currentSessionId || (msg.session_id as string | undefined),
      result: msg.result as string,
      durationMs: (msg.duration_ms as number) || Date.now() - startTime,
      costUsd: msg.total_cost_usd as number | undefined,
    };
    return;
  }

  // Error from SDK
  if (msg.type === "error") {
    yield {
      type: "error",
      error:
        (msg.error as string) ||
        (msg.message as string) ||
        "Unknown SDK error",
    };
  }
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Execute a streaming agent query
 * Returns an async generator that yields AgentStreamEvent for the backend
 */
export async function* streamQuery(
  prompt: string,
  options: AgentQueryOptions
): AsyncGenerator<AgentStreamEvent> {
  const startTime = Date.now();
  let sessionId: string | undefined;
  let resultReceived = false;
  let messageCount = 0;

  // Ensure cwd is absolute
  const absoluteCwd = resolve(options.cwd);

  // Log query start
  log("INIT", "Starting agent query", {
    prompt: prompt.substring(0, 200) + (prompt.length > 200 ? "..." : ""),
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
    // Resolve model: explicit option > AGENT_MODEL env var (passed from backend) > kovaQuery default
    const model = options.model || process.env.AGENT_MODEL;

    for await (const message of kovaQuery(prompt, {
      cwd: absoluteCwd,
      sessionId: options.sessionId,
      allowedTools: options.allowedTools,
      systemPrompt: options.systemPrompt,
      model,
    })) {
      messageCount++;

      // Log raw SDK message
      logSdkMessage(message, messageCount);

      // Transform SDK message to AgentStreamEvent(s)
      for (const event of parseSDKMessage(message, sessionId, startTime)) {
        // Track session ID
        if (event.type === "session_init") {
          sessionId = event.sessionId;
        }
        // Track result received
        if (event.type === "result") {
          resultReceived = true;
        }

        // Log the event being yielded
        logEvent(event);

        yield event;
      }
    }

    log("COMPLETE", `Query finished after ${messageCount} SDK messages`, {
      durationMs: Date.now() - startTime,
      sessionId,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    log("ERROR", `Query failed: ${errorMessage}`);

    // Suppress post-result process exit errors (happens when dev server starts)
    if (resultReceived && errorMessage.includes("process exited with code")) {
      log("INFO", "Suppressing post-result process exit error");
      return;
    }

    yield {
      type: "error",
      error: errorMessage,
    };
  }
}
