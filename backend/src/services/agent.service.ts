/**
 * Agent Service
 * Uses the Claude Agent SDK for autonomous AI agent functionality
 * with built-in tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "../config/index.js";

// Set API key for the SDK (it reads from environment)
if (config.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY = config.ANTHROPIC_API_KEY;
}

export interface AgentQueryOptions {
  /** Working directory for file operations */
  cwd?: string;
  /** Session ID to resume a previous session */
  sessionId?: string;
  /** Allowed tools for this query */
  allowedTools?: string[];
  /** Maximum budget in USD for this query */
  maxBudgetUsd?: number;
  /** System prompt to prepend */
  systemPrompt?: string;
}

export interface AgentStreamEvent {
  type:
    | "session_init"
    | "text"
    | "tool_use"
    | "tool_result"
    | "result"
    | "error";
  sessionId?: string;
  text?: string;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: unknown;
  result?: string;
  costUsd?: number;
  durationMs?: number;
  error?: string;
}

export interface AgentQueryResult {
  sessionId: string;
  result: string;
  costUsd?: number;
  durationMs?: number;
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
] as const;

export type AgentTool = (typeof AVAILABLE_TOOLS)[number];

/**
 * Default tools for different use cases
 */
export const TOOL_PRESETS = {
  /** Read-only tools for analysis */
  readOnly: ["Read", "Glob", "Grep"] as AgentTool[],
  /** Tools for code editing */
  codeEdit: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"] as AgentTool[],
  /** All available tools */
  all: [...AVAILABLE_TOOLS] as AgentTool[],
  /** Web-enabled tools */
  webEnabled: ["Read", "Glob", "Grep", "WebSearch", "WebFetch"] as AgentTool[],
};

/**
 * Agent Service for interacting with Claude Agent SDK
 */
class AgentService {
  private defaultTools: AgentTool[] = TOOL_PRESETS.codeEdit;

  /**
   * Execute a streaming agent query
   * Returns an async generator that yields events as they occur
   */
  async *streamQuery(
    prompt: string,
    options: AgentQueryOptions = {},
  ): AsyncGenerator<AgentStreamEvent> {
    const startTime = Date.now();
    let sessionId: string | undefined;

    try {
      // Ensure PATH includes node's directory for Windows compatibility
      const env = { ...process.env } as Record<string, string>;
      const nodePath = process.execPath;
      const nodeDir = nodePath.substring(
        0,
        nodePath.lastIndexOf(process.platform === "win32" ? "\\" : "/"),
      );
      if (env.PATH && !env.PATH.includes(nodeDir)) {
        env.PATH = `${nodeDir}${process.platform === "win32" ? ";" : ":"}${env.PATH}`;
      }

      const queryOptions: {
        allowedTools?: string[];
        permissionMode?:
          | "default"
          | "bypassPermissions"
          | "acceptEdits"
          | "plan";
        allowDangerouslySkipPermissions?: boolean;
        cwd?: string;
        resume?: string;
        systemPrompt?: string;
        maxTurns?: number;
        executable?: "node" | "bun" | "deno";
        env?: Record<string, string>;
      } = {
        allowedTools: options.allowedTools || this.defaultTools,
        permissionMode: "bypassPermissions" as const,
        allowDangerouslySkipPermissions: true, // Required for bypassPermissions mode
        executable: "node" as const,
        env, // Pass environment with corrected PATH
      };

      if (options.cwd) {
        queryOptions.cwd = options.cwd;
      }

      if (options.sessionId) {
        queryOptions.resume = options.sessionId;
      }

      if (options.systemPrompt) {
        queryOptions.systemPrompt = options.systemPrompt;
      }

      for await (const message of query({
        prompt,
        options: queryOptions,
      })) {
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
            yield {
              type: "session_init",
              sessionId,
            };
          }

          // Text content from assistant
          if (msg.type === "assistant" && msg.message) {
            const assistantMsg = msg.message as Record<string, unknown>;
            if (Array.isArray(assistantMsg.content)) {
              for (const block of assistantMsg.content) {
                if (
                  typeof block === "object" &&
                  block !== null &&
                  "type" in block
                ) {
                  const contentBlock = block as Record<string, unknown>;
                  if (contentBlock.type === "text" && contentBlock.text) {
                    yield {
                      type: "text",
                      text: contentBlock.text as string,
                    };
                  } else if (contentBlock.type === "tool_use") {
                    yield {
                      type: "tool_use",
                      toolName: contentBlock.name as string,
                      toolInput: contentBlock.input,
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
                    yield {
                      type: "tool_result",
                      toolResult: contentBlock.content,
                    };
                  }
                }
              }
            }
          }

          // Final result
          if ("result" in msg) {
            const durationMs = Date.now() - startTime;
            yield {
              type: "result",
              sessionId,
              result: msg.result as string,
              durationMs,
              // Note: cost tracking would require additional SDK support
            };
          }
        }
      }
    } catch (error) {
      yield {
        type: "error",
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Execute a query and wait for the complete result
   */
  async executeQuery(
    prompt: string,
    options: AgentQueryOptions = {},
  ): Promise<AgentQueryResult> {
    let sessionId = "";
    let result = "";
    let costUsd: number | undefined;
    let durationMs: number | undefined;

    for await (const event of this.streamQuery(prompt, options)) {
      if (event.type === "session_init" && event.sessionId) {
        sessionId = event.sessionId;
      }
      if (event.type === "result") {
        result = event.result || "";
        costUsd = event.costUsd;
        durationMs = event.durationMs;
      }
      if (event.type === "error") {
        throw new Error(event.error);
      }
    }

    return {
      sessionId,
      result,
      costUsd,
      durationMs,
    };
  }

  /**
   * Resume a previous session with a new prompt
   */
  async *resumeSession(
    sessionId: string,
    prompt: string,
    options: Omit<AgentQueryOptions, "sessionId"> = {},
  ): AsyncGenerator<AgentStreamEvent> {
    yield* this.streamQuery(prompt, {
      ...options,
      sessionId,
    });
  }

  /**
   * Fork a session to explore alternative approaches
   * Creates a new session based on the history of an existing one
   */
  async *forkSession(
    _originalSessionId: string,
    prompt: string,
    options: Omit<AgentQueryOptions, "sessionId"> = {},
  ): AsyncGenerator<AgentStreamEvent> {
    // Note: True session forking would require SDK support
    // For now, we start a fresh session with a prompt that references the context
    const forkPrompt = `Continue from the previous context. ${prompt}`;
    yield* this.streamQuery(forkPrompt, options);
  }

  /**
   * Get available tools
   */
  getAvailableTools(): typeof AVAILABLE_TOOLS {
    return AVAILABLE_TOOLS;
  }

  /**
   * Get tool presets
   */
  getToolPresets(): typeof TOOL_PRESETS {
    return TOOL_PRESETS;
  }
}

export const agentService = new AgentService();
