/**
 * Agent Stream Event Types
 *
 * These types define the event format received from app-container via SSE.
 * The app-container transforms SDK messages into this format.
 */

/**
 * SSE event types from the agent
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

/**
 * Union of all agent stream events
 */
export type AgentStreamEvent =
  | SessionInitEvent
  | TextEvent
  | ToolUseEvent
  | ToolResultEvent
  | ResultEvent
  | ErrorEvent;
