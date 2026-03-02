import type { ContentBlock } from "@/types/content-blocks";
import type { Message } from "@/types";
import type {
  AgentStatusMessage,
  AppNameUpdate,
  AppOutputMessage,
  AppStatusMessage,
  ChatStreamChunk,
  ChatStreamDelta,
  ChatStreamEnd,
  ChatStreamError,
  ChatStreamRequest,
  ChatTitleUpdate,
  WsMessage,
} from "./types";

export interface ChatStreamCallbacks {
  onUpdate: (messages: Message[]) => void;
  onDelta?: (delta: string, toolName?: string) => void;
  onEnd: (response: { updatedFiles: boolean; extraFiles?: string[] }) => void;
  onError: (error: string) => void;
}

export interface AppOutputCallbacks {
  onOutput: (output: {
    type: "stdout" | "stderr" | "info" | "input-requested";
    message: string;
  }) => void;
  onStatus: (status: {
    status: "starting" | "running" | "stopped" | "error";
    url?: string;
    error?: string;
  }) => void;
}

type ConnectionState = "disconnected" | "connecting" | "connected";

export class WebSocketClient {
  private static instance: WebSocketClient | null = null;
  private ws: WebSocket | null = null;
  private baseUrl: string;
  private getAccessToken: () => string | null;
  private connectionState: ConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageQueue: string[] = [];

  // Callbacks
  private chatStreams: Map<number, ChatStreamCallbacks> = new Map();
  private appOutputCallbacks: Map<number, AppOutputCallbacks> = new Map();
  // Track streaming content for delta accumulation
  private streamingContent: Map<
    number,
    { messages: Message[]; assistantContent: string; contentBlocks: ContentBlock[] }
  > = new Map();
  private titleUpdateCallbacks: Set<(chatId: number, title: string) => void> =
    new Set();
  private appNameUpdateCallbacks: Set<(appId: number, name: string) => void> =
    new Set();
  private agentStatusCallbacks: Map<
    number,
    Set<(status: AgentStatusMessage["status"], message: string) => void>
  > = new Map();
  private onConnected?: () => void;
  private onDisconnected?: () => void;

  private constructor(baseUrl: string, getAccessToken: () => string | null) {
    this.baseUrl = baseUrl;
    this.getAccessToken = getAccessToken;
  }

  static initialize(
    baseUrl: string,
    getAccessToken: () => string | null,
  ): WebSocketClient {
    if (!WebSocketClient.instance) {
      WebSocketClient.instance = new WebSocketClient(baseUrl, getAccessToken);
    }
    return WebSocketClient.instance;
  }

  static getInstance(): WebSocketClient {
    if (!WebSocketClient.instance) {
      throw new Error(
        "WebSocketClient not initialized. Call initialize() first.",
      );
    }
    return WebSocketClient.instance;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connectionState === "connected") {
        resolve();
        return;
      }

      if (this.connectionState === "connecting") {
        // Wait for existing connection attempt
        const checkConnection = setInterval(() => {
          if (this.connectionState === "connected") {
            clearInterval(checkConnection);
            resolve();
          }
        }, 100);
        return;
      }

      this.connectionState = "connecting";
      const token = this.getAccessToken();

      if (!token) {
        this.connectionState = "disconnected";
        reject(new Error("No access token available"));
        return;
      }

      // Convert http(s) to ws(s)
      const wsUrl =
        this.baseUrl.replace(/^http/, "ws").replace(/\/api$/, "") +
        `/ws?token=${encodeURIComponent(token)}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.connectionState = "connected";
        this.reconnectAttempts = 0;

        // Send any queued messages
        while (this.messageQueue.length > 0) {
          const msg = this.messageQueue.shift();
          if (msg) this.ws?.send(msg);
        }

        this.onConnected?.();
        resolve();
      };

      this.ws.onclose = (event) => {
        this.connectionState = "disconnected";
        this.onDisconnected?.();

        // Attempt reconnection if not intentionally closed
        if (event.code !== 1000 && event.code !== 4001) {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        if (this.connectionState === "connecting") {
          this.connectionState = "disconnected";
          reject(new Error("WebSocket connection failed"));
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(
      `Attempting reconnection in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    setTimeout(() => {
      this.connect().catch((err) => {
        console.error("Reconnection failed:", err);
      });
    }, delay);
  }

  private handleMessage(data: string): void {
    try {
      const message: WsMessage = JSON.parse(data);

      switch (message.type) {
        case "chat:response:chunk": {
          const chunk = message as ChatStreamChunk;
          const callbacks = this.chatStreams.get(chunk.chatId);
          if (callbacks) {
            const existing = this.streamingContent.get(chunk.chatId);
            if (existing && existing.contentBlocks.length > 0) {
              // Preserve accumulated contentBlocks when backend sends
              // the final chunk with the saved DB message
              existing.messages = chunk.messages as Message[];
              const chunkMessages = chunk.messages as Message[];
              const lastMsg = chunkMessages[chunkMessages.length - 1];
              if (lastMsg?.role === "assistant") {
                chunkMessages[chunkMessages.length - 1] = {
                  ...lastMsg,
                  contentBlocks: [...existing.contentBlocks],
                } as Message;
              }
              callbacks.onUpdate(chunkMessages);
            } else {
              // Initial chunk — start fresh
              this.streamingContent.set(chunk.chatId, {
                messages: chunk.messages as Message[],
                assistantContent: "",
                contentBlocks: [],
              });
              callbacks.onUpdate(chunk.messages as Message[]);
            }
          }
          break;
        }

        case "chat:response:delta": {
          const delta = message as ChatStreamDelta;
          const callbacks = this.chatStreams.get(delta.chatId);
          if (callbacks) {
            // Accumulate delta content
            const streaming = this.streamingContent.get(delta.chatId) || {
              messages: [],
              assistantContent: "",
              contentBlocks: [],
            };
            streaming.assistantContent += delta.delta;

            // Accumulate structured content blocks
            if (delta.blockType) {
              console.log("[WS] Delta received:", {
                blockType: delta.blockType,
                blockData: delta.blockData,
                deltaLen: delta.delta.length,
                toolName: delta.toolName,
              });
              this.accumulateBlock(streaming.contentBlocks, delta);
            }

            this.streamingContent.set(delta.chatId, streaming);

            // Call onDelta if provided
            if (callbacks.onDelta) {
              callbacks.onDelta(delta.delta, delta.toolName);
            }

            // Update with synthetic streaming message
            const streamingMessages = [...streaming.messages];
            // Check if last message is assistant, if so update it, otherwise add new
            const lastMsg = streamingMessages[streamingMessages.length - 1];
            if (lastMsg?.role === "assistant") {
              streamingMessages[streamingMessages.length - 1] = {
                ...lastMsg,
                content: streaming.assistantContent,
                contentBlocks: [...streaming.contentBlocks],
              };
            } else {
              streamingMessages.push({
                id: -1, // Temporary ID for streaming
                role: "assistant",
                content: streaming.assistantContent,
                contentBlocks: [...streaming.contentBlocks],
              } as Message);
            }
            console.log("[WS] contentBlocks:", streaming.contentBlocks.length, streaming.contentBlocks.map(b => b.type));
            callbacks.onUpdate(streamingMessages);
          }
          break;
        }

        case "chat:response:end": {
          const end = message as ChatStreamEnd;
          const callbacks = this.chatStreams.get(end.chatId);
          if (callbacks) {
            callbacks.onEnd({
              updatedFiles: end.updatedFiles,
              extraFiles: end.extraFiles,
            });
            this.chatStreams.delete(end.chatId);
            this.streamingContent.delete(end.chatId);
          }
          break;
        }

        case "chat:response:error": {
          const error = message as ChatStreamError;
          const callbacks = this.chatStreams.get(error.chatId);
          if (callbacks) {
            callbacks.onError(error.error);
            this.chatStreams.delete(error.chatId);
            this.streamingContent.delete(error.chatId);
          }
          break;
        }

        case "app:output": {
          const output = message as AppOutputMessage;
          const callbacks = this.appOutputCallbacks.get(output.appId);
          if (callbacks) {
            callbacks.onOutput({
              type: output.outputType,
              message: output.message,
            });
          }
          break;
        }

        case "app:status": {
          const status = message as AppStatusMessage;
          const callbacks = this.appOutputCallbacks.get(status.appId);
          if (callbacks) {
            callbacks.onStatus({
              status: status.status,
              url: status.url,
              error: status.error,
            });
          }
          break;
        }

        case "chat:title:update": {
          const titleUpdate = message as ChatTitleUpdate;
          this.titleUpdateCallbacks.forEach((callback) => {
            callback(titleUpdate.chatId, titleUpdate.title);
          });
          break;
        }

        case "app:name:update": {
          const nameUpdate = message as AppNameUpdate;
          this.appNameUpdateCallbacks.forEach((callback) => {
            callback(nameUpdate.appId, nameUpdate.name);
          });
          break;
        }

        case "app:agent:status": {
          const agentStatus = message as AgentStatusMessage;
          const cbs = this.agentStatusCallbacks.get(agentStatus.appId);
          if (cbs) {
            for (const cb of cbs) {
              cb(agentStatus.status, agentStatus.message);
            }
          }
          break;
        }

        case "connected":
          console.log("WebSocket: Connection confirmed by server");
          break;

        case "pong":
          // Heartbeat response
          break;

        case "error":
          console.error("WebSocket server error:", message.error);
          break;

        default:
          console.log("Unknown WebSocket message type:", message.type);
      }
    } catch (err) {
      console.error("Failed to parse WebSocket message:", err);
    }
  }

  /**
   * Accumulate a structured content block from a delta event.
   * Text deltas merge into the last text block; tool blocks create new entries.
   */
  private accumulateBlock(
    blocks: ContentBlock[],
    delta: ChatStreamDelta,
  ): void {
    const { blockType, blockData } = delta;
    if (!blockType) return;

    if (blockType === "text") {
      // Merge text into the last text block, or create a new one
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock && lastBlock.type === "text") {
        lastBlock.text += delta.delta;
      } else {
        blocks.push({ type: "text", text: delta.delta });
      }
    } else if (blockType === "tool_result") {
      // Tool result - just a completion signal, append as-is
      blocks.push({ type: "tool_result", toolName: "" });
    } else if (blockType === "file_edit" && blockData) {
      blocks.push({
        type: "file_edit",
        operation: (blockData.operation as "write" | "edit") ?? "edit",
        filePath: (blockData.filePath as string) ?? "",
      });
    } else if (blockType === "bash" && blockData) {
      blocks.push({
        type: "bash",
        command: (blockData.command as string) ?? "",
      });
    } else if (blockType === "tool_use" && blockData) {
      // Extract detail from various tool-specific fields
      const detail = (blockData.skillName as string)
        || (blockData.activeTask as string)
        || (blockData.pattern as string)
        || undefined;
      blocks.push({
        type: "tool_use",
        toolName: (blockData.toolName as string) ?? "",
        displayName: (blockData.displayName as string) ?? "",
        filePath: blockData.filePath as string | undefined,
        detail,
      });
    }
  }

  private send(message: WsMessage): void {
    const payload = JSON.stringify(message);

    if (this.connectionState === "connected" && this.ws) {
      this.ws.send(payload);
    } else {
      // Queue message for when connection is established
      this.messageQueue.push(payload);
      this.connect().catch(console.error);
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
    this.connectionState = "disconnected";
    this.chatStreams.clear();
    this.appOutputCallbacks.clear();
    this.streamingContent.clear();
    this.agentStatusCallbacks.clear();
  }

  // Chat streaming
  streamChat(
    chatId: number,
    prompt: string,
    callbacks: ChatStreamCallbacks,
    options?: {
      attachments?: Array<{ type: string; data: string; fileName?: string }>;
      redo?: boolean;
      promptType?: string;
    },
  ): void {
    this.chatStreams.set(chatId, callbacks);

    const request: ChatStreamRequest = {
      type: "chat:stream",
      chatId,
      prompt,
      attachments: options?.attachments,
      redo: options?.redo,
      promptType: options?.promptType,
    };

    this.send(request);
  }

  cancelChat(chatId: number): void {
    this.send({ type: "chat:cancel", chatId });
    this.chatStreams.delete(chatId);
  }

  // App output streaming
  subscribeToApp(appId: number, callbacks: AppOutputCallbacks): void {
    this.appOutputCallbacks.set(appId, callbacks);
    this.send({ type: "subscribe:app", appId });
  }

  unsubscribeFromApp(appId: number): void {
    this.send({ type: "unsubscribe:app", appId });
    this.appOutputCallbacks.delete(appId);
  }

  sendAppInput(appId: number, response: string): void {
    this.send({ type: "app:input", appId, response });
  }

  // Connection state
  isConnected(): boolean {
    return this.connectionState === "connected";
  }

  setOnConnected(callback: () => void): void {
    this.onConnected = callback;
  }

  setOnDisconnected(callback: () => void): void {
    this.onDisconnected = callback;
  }

  // Title update subscription
  onTitleUpdate(callback: (chatId: number, title: string) => void): () => void {
    this.titleUpdateCallbacks.add(callback);
    // Return unsubscribe function
    return () => {
      this.titleUpdateCallbacks.delete(callback);
    };
  }

  // App name update subscription
  onAppNameUpdate(callback: (appId: number, name: string) => void): () => void {
    this.appNameUpdateCallbacks.add(callback);
    // Return unsubscribe function
    return () => {
      this.appNameUpdateCallbacks.delete(callback);
    };
  }

  // Agent status subscription
  subscribeToAgentStatus(
    appId: number,
    callback: (status: AgentStatusMessage["status"], message: string) => void,
  ): () => void {
    if (!this.agentStatusCallbacks.has(appId)) {
      this.agentStatusCallbacks.set(appId, new Set());
    }
    this.agentStatusCallbacks.get(appId)!.add(callback);

    // Send subscribe message to backend
    this.send({ type: "subscribe:agent-status", appId });

    // Return unsubscribe function
    return () => {
      const callbacks = this.agentStatusCallbacks.get(appId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.agentStatusCallbacks.delete(appId);
          this.send({ type: "unsubscribe:agent-status", appId });
        }
      }
    };
  }
}
