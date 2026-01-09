import { and, count, desc, eq } from "drizzle-orm";
import { WebSocket } from "ws";
import { db } from "../../db/index.js";
import { apps, chats, messages } from "../../db/schema.js";
import { constructSystemPromptConfig } from "../../prompts/system_prompt.js";
import { appContainerService } from "../../services/app-container.service.js";
import {
  generateAppName,
  generateChatTitle,
  isRandomAppName,
} from "../../services/title-generator.service.js";

export interface ChatStreamMessage {
  type: "chat:stream";
  chatId: number;
  prompt: string;
  attachments?: Array<{
    type: string;
    data: string;
    fileName?: string;
  }>;
  redo?: boolean;
  /** Session ID for multi-turn conversations */
  sessionId?: string;
}

export interface ChatStreamChunk {
  type: "chat:response:chunk";
  chatId: number;
  messages: Array<{
    id?: number;
    role: "user" | "assistant";
    content: string;
  }>;
}

export interface ChatStreamDelta {
  type: "chat:response:delta";
  chatId: number;
  /** Incremental text delta */
  delta: string;
  /** Tool being used (if any) */
  toolName?: string;
}

export interface ChatStreamEnd {
  type: "chat:response:end";
  chatId: number;
  updatedFiles: boolean;
  extraFiles?: string[];
  /** Session ID for continuing the conversation */
  sessionId?: string;
  /** Cost in USD */
  costUsd?: number;
  /** Duration in milliseconds */
  durationMs?: number;
}

export interface ChatStreamError {
  type: "chat:response:error";
  chatId: number;
  error: string;
}

export interface ChatTitleUpdate {
  type: "chat:title:update";
  chatId: number;
  title: string;
}

export interface AppNameUpdate {
  type: "app:name:update";
  appId: number;
  name: string;
}

export interface ChatCancelMessage {
  type: "chat:cancel";
  chatId: number;
}

// Track active streams so we can cancel them
const activeStreams = new Map<string, AbortController>();
// Track session IDs for multi-turn conversations
const chatSessions = new Map<number, string>();

function getStreamKey(userId: number, chatId: number): string {
  return `${userId}:${chatId}`;
}

export async function handleChatStream(
  ws: WebSocket,
  userId: number,
  message: ChatStreamMessage,
) {
  const {
    chatId,
    prompt,
    attachments,
    redo,
    sessionId: providedSessionId,
  } = message;
  const streamKey = getStreamKey(userId, chatId);

  // Cancel any existing stream for this chat
  const existingController = activeStreams.get(streamKey);
  if (existingController) {
    existingController.abort();
    activeStreams.delete(streamKey);
  }

  try {
    // Verify user owns the chat and get app info
    const chatResult = await db
      .select({
        chat: chats,
        app: apps,
      })
      .from(chats)
      .innerJoin(apps, eq(chats.appId, apps.id))
      .where(and(eq(chats.id, chatId), eq(apps.userId, userId)))
      .limit(1);

    if (chatResult.length === 0) {
      sendError(ws, chatId, "Chat not found");
      return;
    }

    const { chat, app } = chatResult[0];

    // Create abort controller for this stream
    const abortController = new AbortController();
    activeStreams.set(streamKey, abortController);

    // Save user message to database and update chat's updatedAt
    const userMessage = await db
      .insert(messages)
      .values({
        chatId,
        role: "user",
        content: prompt,
      })
      .returning();

    // Update chat's updatedAt timestamp
    await db
      .update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, chatId));

    // Send initial chunk with user message
    sendChunk(ws, chatId, [
      {
        id: userMessage[0].id,
        role: "user",
        content: prompt,
      },
    ]);

    // Generate chat title if this is the first message (async, don't block)
    console.log(`[CHAT] Chat title check - current title: "${chat.title}"`);
    if (!chat.title || chat.title === "New Chat") {
      console.log(`[CHAT] Triggering title generation for chat ${chatId}`);
      generateAndUpdateTitle(ws, chatId, prompt);
    }

    // Generate app name if it has a random placeholder name (async, don't block)
    console.log(`[CHAT] App name check - current name: "${app.name}"`);
    if (isRandomAppName(app.name)) {
      console.log(`[CHAT] Triggering name generation for app ${app.id}`);
      generateAndUpdateAppName(ws, app.id, prompt);
    }

    // Start or get existing container for this app
    console.log(
      `[CHAT] Starting container for app ${app.id} at path ${app.path}`,
    );
    const containerPorts = await appContainerService.startContainer({
      appId: app.id,
      userId,
      appPath: app.path,
    });

    console.log(
      `[CHAT] Container ports for app ${app.id}:`,
      JSON.stringify(containerPorts),
    );

    // Record activity to reset idle timer
    appContainerService.recordActivity(app.id, "agent");

    // Wait for container to be ready
    console.log(
      `[CHAT] Waiting for container ready at ${containerPorts.agentUrl}`,
    );
    await waitForContainerReady(containerPorts.agentUrl);
    console.log(`[CHAT] Container ready for app ${app.id}`);

    // Get previous session ID if resuming
    const sessionId = providedSessionId || chatSessions.get(chatId);

    // Build context from chat history if no session
    let fullPrompt = prompt;
    if (!sessionId) {
      // Get previous messages for context
      const previousMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.chatId, chatId))
        .orderBy(desc(messages.createdAt))
        .limit(20); // Last 20 messages for context

      if (previousMessages.length > 1) {
        const contextMessages = previousMessages
          .reverse()
          .slice(0, -1) // Exclude the message we just added
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n\n");
        fullPrompt = `Previous conversation:\n${contextMessages}\n\nUser: ${prompt}`;
      }
    }

    // Stream response from container's agent server via SSE
    let assistantContent = "";
    let newSessionId: string | undefined;
    let costUsd: number | undefined;
    let durationMs: number | undefined;
    let updatedFiles = false;

    const queryUrl = `${containerPorts.agentUrl}/query`;
    console.log(`[CHAT] Sending query to ${queryUrl}`);

    // Double-check container is still responding before sending query
    try {
      const healthCheck = await fetch(`${containerPorts.agentUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!healthCheck.ok) {
        throw new Error(`Health check failed: ${healthCheck.status}`);
      }
      console.log(`[CHAT] Health check passed for ${containerPorts.agentUrl}`);
    } catch (healthError: any) {
      console.error(
        `[CHAT] Health check failed before query:`,
        healthError.message,
      );
      throw new Error(`Container not responding: ${healthError.message}`);
    }

    // Construct system prompt config for the agent
    // Uses preset: "claude_code" with minimal append to preserve SDK defaults
    // TODO: Support custom AI_RULES.md from app directory
    const systemPrompt = constructSystemPromptConfig();

    console.log(`[CHAT] System prompt config:`, JSON.stringify(systemPrompt));

    const response = await fetch(queryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        prompt: fullPrompt,
        sessionId,
        chatId: chatId.toString(),
        allowedTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
        systemPrompt,
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Agent query failed: ${response.status} ${errorText}`);
    }

    // Parse SSE stream
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Check if cancelled
      if (abortController.signal.aborted) {
        reader.cancel();
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7);
        } else if (line.startsWith("data: ")) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);

            // Process event based on type
            switch (event.type || currentEvent) {
              case "session_init":
                newSessionId = event.sessionId;
                break;

              case "text":
                if (event.text) {
                  assistantContent += event.text;
                  sendDelta(ws, chatId, event.text);
                }
                break;

              case "tool_use":
                if (event.toolName) {
                  sendDelta(
                    ws,
                    chatId,
                    `\n[Using tool: ${event.toolName}]\n`,
                    event.toolName,
                  );
                  // Track if files were modified
                  if (event.toolName === "Write" || event.toolName === "Edit") {
                    updatedFiles = true;
                  }
                }
                break;

              case "tool_result":
                // Tool results are handled internally by the SDK
                break;

              case "result":
                costUsd = event.costUsd;
                durationMs = event.durationMs;
                if (event.result && !assistantContent) {
                  assistantContent = event.result;
                }
                if (event.sessionId) {
                  newSessionId = event.sessionId;
                }
                break;

              case "error":
                sendError(ws, chatId, event.error || "An error occurred");
                activeStreams.delete(streamKey);
                return;
            }
          } catch (parseError) {
            console.error("[CHAT] Failed to parse SSE data:", data);
          }
          currentEvent = "";
        }
      }
    }

    // Save assistant message to database and update chat's updatedAt
    if (assistantContent) {
      const assistantMessage = await db
        .insert(messages)
        .values({
          chatId,
          role: "assistant",
          content: assistantContent,
        })
        .returning();

      // Update chat's updatedAt timestamp
      await db
        .update(chats)
        .set({ updatedAt: new Date() })
        .where(eq(chats.id, chatId));

      // Send final assistant message
      sendChunk(ws, chatId, [
        {
          id: assistantMessage[0].id,
          role: "assistant",
          content: assistantContent,
        },
      ]);
    }

    // Store session ID for future turns
    if (newSessionId) {
      chatSessions.set(chatId, newSessionId);
    }

    // Restart dev server if files were updated (async, don't block)
    if (updatedFiles) {
      restartDevServer(containerPorts.agentUrl);
    }

    // Send completion
    sendEnd(
      ws,
      chatId,
      updatedFiles,
      newSessionId || sessionId,
      costUsd,
      durationMs,
    );

    // Cleanup
    activeStreams.delete(streamKey);
  } catch (error: any) {
    console.error("[CHAT] Stream error for", chatId + ":", error.message);
    console.error("[CHAT] Full error:", error);
    sendError(ws, chatId, error.message || "An error occurred");
    activeStreams.delete(streamKey);
  }
}

/**
 * Wait for the container's agent server to be ready
 */
async function waitForContainerReady(
  agentUrl: string,
  maxRetries = 30,
  retryDelayMs = 1000,
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${agentUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        console.log(`[CHAT] Container ready at ${agentUrl}`);
        return;
      }
    } catch (error) {
      // Container not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
  throw new Error(`Container failed to become ready at ${agentUrl}`);
}

export function handleChatCancel(
  ws: WebSocket,
  userId: number,
  message: ChatCancelMessage,
) {
  const { chatId } = message;
  const streamKey = getStreamKey(userId, chatId);

  const controller = activeStreams.get(streamKey);
  if (controller) {
    controller.abort();
    activeStreams.delete(streamKey);
  }
}

function sendChunk(
  ws: WebSocket,
  chatId: number,
  messages: ChatStreamChunk["messages"],
) {
  const chunk: ChatStreamChunk = {
    type: "chat:response:chunk",
    chatId,
    messages,
  };
  ws.send(JSON.stringify(chunk));
}

function sendDelta(
  ws: WebSocket,
  chatId: number,
  delta: string,
  toolName?: string,
) {
  const deltaMsg: ChatStreamDelta = {
    type: "chat:response:delta",
    chatId,
    delta,
    toolName,
  };
  ws.send(JSON.stringify(deltaMsg));
}

function sendEnd(
  ws: WebSocket,
  chatId: number,
  updatedFiles: boolean,
  sessionId?: string,
  costUsd?: number,
  durationMs?: number,
) {
  const end: ChatStreamEnd = {
    type: "chat:response:end",
    chatId,
    updatedFiles,
    sessionId,
    costUsd,
    durationMs,
  };
  ws.send(JSON.stringify(end));
}

function sendError(ws: WebSocket, chatId: number, error: string) {
  const errorMsg: ChatStreamError = {
    type: "chat:response:error",
    chatId,
    error,
  };
  ws.send(JSON.stringify(errorMsg));
}

function sendTitleUpdate(ws: WebSocket, chatId: number, title: string) {
  const titleMsg: ChatTitleUpdate = {
    type: "chat:title:update",
    chatId,
    title,
  };
  ws.send(JSON.stringify(titleMsg));
}

function sendAppNameUpdate(ws: WebSocket, appId: number, name: string) {
  const nameMsg: AppNameUpdate = {
    type: "app:name:update",
    appId,
    name,
  };
  ws.send(JSON.stringify(nameMsg));
}

/**
 * Generate an app name asynchronously and update the database + notify client
 */
async function generateAndUpdateAppName(
  ws: WebSocket,
  appId: number,
  prompt: string,
): Promise<void> {
  try {
    const name = await generateAppName(prompt);

    if (name) {
      // Update database
      await db
        .update(apps)
        .set({ name, updatedAt: new Date() })
        .where(eq(apps.id, appId));

      // Notify frontend
      sendAppNameUpdate(ws, appId, name);
      console.log(`[CHAT] Generated name for app ${appId}: "${name}"`);
    }
  } catch (error) {
    console.error("[CHAT] Failed to generate app name:", error);
  }
}

/**
 * Generate a chat title asynchronously and update the database + notify client
 */
async function generateAndUpdateTitle(
  ws: WebSocket,
  chatId: number,
  prompt: string,
): Promise<void> {
  try {
    const title = await generateChatTitle(prompt);

    if (title && title !== "New Chat") {
      // Update database
      await db
        .update(chats)
        .set({ title, updatedAt: new Date() })
        .where(eq(chats.id, chatId));

      // Notify frontend
      sendTitleUpdate(ws, chatId, title);
      console.log(`[CHAT] Generated title for chat ${chatId}: "${title}"`);
    }
  } catch (error) {
    console.error("[CHAT] Failed to generate title:", error);
  }
}

/**
 * Restart the dev server in the container after files are updated
 */
async function restartDevServer(agentUrl: string): Promise<void> {
  try {
    console.log(`[CHAT] Restarting dev server at ${agentUrl}`);
    const response = await fetch(`${agentUrl}/dev-server/restart`, {
      method: "POST",
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      console.log("[CHAT] Dev server restart triggered successfully");
    } else {
      console.warn("[CHAT] Dev server restart failed:", response.status);
    }
  } catch (error) {
    console.error("[CHAT] Failed to restart dev server:", error);
  }
}
