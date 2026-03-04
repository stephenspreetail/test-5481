import { and, eq } from "drizzle-orm";
import { WebSocket } from "ws";
import { db } from "../../db/index.js";
import { apps } from "../../db/schema.js";

export interface AppOutputMessage {
  type: "app:output";
  appId: number;
  outputType: "stdout" | "stderr" | "info" | "input-requested";
  message: string;
  timestamp: number;
}

export interface AppPreviewReadyMessage {
  type: "app:preview-ready";
  appId: number;
  previewUrl: string;
  originalUrl: string;
  timestamp: number;
}

export interface AppInputMessage {
  type: "app:input";
  appId: number;
  response: string;
}

// Track which WebSocket connections are subscribed to which app outputs
const appSubscriptions = new Map<number, Set<WebSocket>>();

// Cache preview URLs for late-joining subscribers
const previewUrls = new Map<
  number,
  { previewUrl: string; originalUrl: string }
>();

export function subscribeToAppOutput(appId: number, ws: WebSocket) {
  if (!appSubscriptions.has(appId)) {
    appSubscriptions.set(appId, new Set());
  }
  appSubscriptions.get(appId)!.add(ws);

  // Replay preview URL to the new subscriber
  const cached = previewUrls.get(appId);
  if (cached) {
    const msg: AppPreviewReadyMessage = {
      type: "app:preview-ready",
      appId,
      previewUrl: cached.previewUrl,
      originalUrl: cached.originalUrl,
      timestamp: Date.now(),
    };
    ws.send(JSON.stringify(msg));
  }
}

export function unsubscribeFromAppOutput(appId: number, ws: WebSocket) {
  const subscribers = appSubscriptions.get(appId);
  if (subscribers) {
    subscribers.delete(ws);
    if (subscribers.size === 0) {
      appSubscriptions.delete(appId);
    }
  }
}

export function unsubscribeFromAllApps(ws: WebSocket) {
  for (const [appId, subscribers] of appSubscriptions.entries()) {
    subscribers.delete(ws);
    if (subscribers.size === 0) {
      appSubscriptions.delete(appId);
    }
  }
}

export async function handleAppInput(
  ws: WebSocket,
  userId: number,
  message: AppInputMessage,
) {
  const { appId, response } = message;

  // Verify user owns the app
  const appResult = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, appId), eq(apps.userId, userId)))
    .limit(1);

  if (appResult.length === 0) {
    console.error(`App ${appId} not found for user ${userId}`);
    return;
  }

  // TODO: Implement stdin forwarding to app container
  console.log(`App ${appId} received input: ${response}`);
}

// Broadcast output to all subscribers of an app
export function broadcastAppOutput(
  appId: number,
  outputType: AppOutputMessage["outputType"],
  message: string,
) {
  const subscribers = appSubscriptions.get(appId);
  if (!subscribers || subscribers.size === 0) {
    return;
  }

  const output: AppOutputMessage = {
    type: "app:output",
    appId,
    outputType,
    message,
    timestamp: Date.now(),
  };

  const payload = JSON.stringify(output);
  for (const ws of subscribers) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

// Notify all subscribers that the preview is ready at a given URL
export function broadcastPreviewReady(
  appId: number,
  previewUrl: string,
  originalUrl = "http://localhost:3000",
) {
  // Cache for late-joining subscribers
  previewUrls.set(appId, { previewUrl, originalUrl });

  const subscribers = appSubscriptions.get(appId);
  if (!subscribers || subscribers.size === 0) {
    return;
  }

  const msg: AppPreviewReadyMessage = {
    type: "app:preview-ready",
    appId,
    previewUrl,
    originalUrl,
    timestamp: Date.now(),
  };

  const payload = JSON.stringify(msg);
  for (const ws of subscribers) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

// Clear cached preview URL (e.g. on container stop)
export function clearPreviewUrl(appId: number): void {
  previewUrls.delete(appId);
}
