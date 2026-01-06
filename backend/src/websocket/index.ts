import { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import {
  AppInputMessage,
  handleAppInput,
  subscribeToAppOutput,
  unsubscribeFromAllApps,
  unsubscribeFromAppOutput,
} from "./handlers/app-output.handler.js";
import {
  ChatCancelMessage,
  ChatStreamMessage,
  handleChatCancel,
  handleChatStream,
} from "./handlers/chat-stream.handler.js";

interface AuthenticatedSocket extends WebSocket {
  userId?: number;
  email?: string;
}

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

interface SubscribeMessage {
  type: "subscribe:app";
  appId: number;
}

interface UnsubscribeMessage {
  type: "unsubscribe:app";
  appId: number;
}

export async function setupWebSocket(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, async (socket, request) => {
    const ws = socket as AuthenticatedSocket;

    // Authenticate the WebSocket connection
    const token =
      (request.query as { token?: string }).token ||
      request.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      ws.close(4001, "Unauthorized: No token provided");
      return;
    }

    try {
      const decoded = app.jwt.verify<{ userId: number; email: string }>(token);
      ws.userId = decoded.userId;
      ws.email = decoded.email;
    } catch (err) {
      ws.close(4001, "Unauthorized: Invalid token");
      return;
    }

    console.log(`WebSocket connected: user ${ws.userId}`);

    // Handle incoming messages
    ws.on("message", async (data) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());

        if (!ws.userId) {
          ws.send(JSON.stringify({ type: "error", error: "Not authenticated" }));
          return;
        }

        switch (message.type) {
          case "chat:stream":
            await handleChatStream(
              ws,
              ws.userId,
              message as ChatStreamMessage
            );
            break;

          case "chat:cancel":
            handleChatCancel(ws, ws.userId, message as ChatCancelMessage);
            break;

          case "app:input":
            await handleAppInput(ws, ws.userId, message as AppInputMessage);
            break;

          case "subscribe:app":
            const subMsg = message as SubscribeMessage;
            subscribeToAppOutput(subMsg.appId, ws);
            break;

          case "unsubscribe:app":
            const unsubMsg = message as UnsubscribeMessage;
            unsubscribeFromAppOutput(unsubMsg.appId, ws);
            break;

          case "ping":
            ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
            break;

          default:
            ws.send(
              JSON.stringify({
                type: "error",
                error: `Unknown message type: ${message.type}`,
              })
            );
        }
      } catch (err: any) {
        console.error("WebSocket message error:", err);
        ws.send(
          JSON.stringify({
            type: "error",
            error: err.message || "Invalid message",
          })
        );
      }
    });

    // Handle disconnection
    ws.on("close", () => {
      console.log(`WebSocket disconnected: user ${ws.userId}`);
      unsubscribeFromAllApps(ws);
    });

    // Handle errors
    ws.on("error", (err) => {
      console.error(`WebSocket error for user ${ws.userId}:`, err);
    });

    // Send welcome message
    ws.send(
      JSON.stringify({
        type: "connected",
        userId: ws.userId,
        timestamp: Date.now(),
      })
    );
  });
}
