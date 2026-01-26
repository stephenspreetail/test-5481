/**
 * useAgent hook - React hook for managing agent interactions
 * Uses raw SDKMessage from the Claude Agent SDK
 */

import { useState, useCallback, useRef } from "react";
import { kovaQuery, type SDKMessage } from "../../core/index.js";
import type { KovaQueryOptions } from "../../core/types.js";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}

export interface ToolCall {
  name: string;
  input: unknown;
  result?: unknown;
}

export interface UseAgentState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sessionId: string | null;
  currentTool: string | null;
}

export interface UseAgentReturn extends UseAgentState {
  sendMessage: (prompt: string, options?: KovaQueryOptions) => Promise<void>;
  clearMessages: () => void;
  cancelRequest: () => void;
}

/**
 * Generate a unique ID for messages
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * React hook for interacting with the Kova agent
 * Uses raw SDKMessage events from the Claude Agent SDK
 */
export function useAgent(config?: KovaQueryOptions): UseAgentReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentTool, setCurrentTool] = useState<string | null>(null);

  const abortRef = useRef<boolean>(false);

  const sendMessage = useCallback(
    async (prompt: string, options?: KovaQueryOptions) => {
      setIsLoading(true);
      setError(null);
      abortRef.current = false;

      // Add user message
      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: prompt,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Create assistant message placeholder
      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        toolCalls: [],
        isStreaming: true,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      try {
        const queryOptions: KovaQueryOptions = {
          ...config,
          ...options,
          sessionId: sessionId || undefined,
        };

        let currentContent = "";
        const toolCalls: ToolCall[] = [];

        for await (const message of kovaQuery(prompt, queryOptions)) {
          if (abortRef.current) {
            break;
          }

          // Handle raw SDK messages
          handleSDKMessage(
            message,
            assistantMessage.id,
            currentContent,
            toolCalls,
            (newContent) => {
              currentContent = newContent;
            }
          );
        }

        // Finalize the message
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? { ...msg, content: currentContent, toolCalls, isStreaming: false }
              : msg
          )
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "An error occurred";
        setError(errorMessage);

        // Update assistant message with error
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? {
                  ...msg,
                  content: `Error: ${errorMessage}`,
                  isStreaming: false,
                }
              : msg
          )
        );
      } finally {
        setIsLoading(false);
        setCurrentTool(null);
      }
    },
    [config, sessionId]
  );

  /**
   * Handle raw SDK messages and update state
   */
  const handleSDKMessage = useCallback(
    (
      message: SDKMessage,
      messageId: string,
      currentContent: string,
      toolCalls: ToolCall[],
      setContent: (content: string) => void
    ) => {
      // Type guard for message with type property
      if (typeof message !== "object" || message === null || !("type" in message)) {
        return;
      }

      const msg = message as Record<string, unknown>;

      // Session initialization: { type: "system", subtype: "init", session_id: "..." }
      if (msg.type === "system" && msg.subtype === "init") {
        if (typeof msg.session_id === "string") {
          setSessionId(msg.session_id);
        }
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

            // Text content
            if (contentBlock.type === "text" && typeof contentBlock.text === "string") {
              const newContent = currentContent + contentBlock.text;
              setContent(newContent);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === messageId ? { ...m, content: newContent } : m
                )
              );
            }

            // Tool use
            if (contentBlock.type === "tool_use" && typeof contentBlock.name === "string") {
              setCurrentTool(contentBlock.name);
              toolCalls.push({
                name: contentBlock.name,
                input: contentBlock.input,
              });
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === messageId ? { ...m, toolCalls: [...toolCalls] } : m
                )
              );
            }
          }
        }
        return;
      }

      // Tool results (from user message with tool_result blocks)
      if (msg.type === "user" && msg.message) {
        const userMsg = msg.message as Record<string, unknown>;
        if (Array.isArray(userMsg.content)) {
          for (const block of userMsg.content) {
            if (typeof block !== "object" || block === null || !("type" in block)) {
              continue;
            }

            const contentBlock = block as Record<string, unknown>;
            if (contentBlock.type === "tool_result") {
              setCurrentTool(null);
              if (toolCalls.length > 0) {
                toolCalls[toolCalls.length - 1].result = contentBlock.content;
              }
            }
          }
        }
        return;
      }

      // Result message
      if (msg.type === "result") {
        // Result handling - session_id might be in the result
        if (typeof msg.session_id === "string") {
          setSessionId(msg.session_id);
        }
      }
    },
    []
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setError(null);
  }, []);

  const cancelRequest = useCallback(() => {
    abortRef.current = true;
  }, []);

  return {
    messages,
    isLoading,
    error,
    sessionId,
    currentTool,
    sendMessage,
    clearMessages,
    cancelRequest,
  };
}
