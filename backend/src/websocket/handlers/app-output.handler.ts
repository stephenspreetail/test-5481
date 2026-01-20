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

export interface AppStatusMessage {
  type: "app:status";
  appId: number;
  status: "starting" | "running" | "stopped" | "error";
  url?: string;
  error?: string;
}

export interface AppInputMessage {
  type: "app:input";
  appId: number;
  response: string;
}

// Track which WebSocket connections are subscribed to which app outputs
const appSubscriptions = new Map<number, Set<WebSocket>>();

// Track running apps and their output handlers
const runningApps = new Map<
  number,
  {
    containerId?: string;
    status: "starting" | "running" | "stopped" | "error";
    url?: string;
    proxyUrl?: string; // The kova-proxy-server URL
    originalUrl?: string;
  }
>();

export function subscribeToAppOutput(appId: number, ws: WebSocket) {
  if (!appSubscriptions.has(appId)) {
    appSubscriptions.set(appId, new Set());
  }
  appSubscriptions.get(appId)!.add(ws);

  // Send current status if app is running
  const appState = runningApps.get(appId);
  if (appState) {
    sendStatus(ws, appId, appState.status, appState.url);

    // If we have a proxy URL, send it to the new subscriber
    if (appState.proxyUrl) {
      const proxyMessage = `[kova-proxy-server]started=[${appState.proxyUrl}]original=[${appState.originalUrl || "http://localhost:3000"}]`;
      const output: AppOutputMessage = {
        type: "app:output",
        appId,
        outputType: "info",
        message: proxyMessage,
        timestamp: Date.now(),
      };
      ws.send(JSON.stringify(output));
    }
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

  // TODO: Send input to the Docker container's stdin
  // This will be implemented when Docker service is added
  console.log(`App ${appId} received input: ${response}`);
}

// Broadcast output to all subscribers of an app
export function broadcastAppOutput(
  appId: number,
  outputType: AppOutputMessage["outputType"],
  message: string,
) {
  // Check if this is a proxy server started message and store the URLs
  if (message.includes("[kova-proxy-server]started=")) {
    const proxyUrlMatch = message.match(/\[kova-proxy-server\]started=\[(.*?)\]/);
    const originalUrlMatch = message.match(/original=\[(.*?)\]/);

    if (proxyUrlMatch && proxyUrlMatch[1]) {
      // Update or create the app state with proxy URL
      const appState = runningApps.get(appId) || { status: "running" as const };
      appState.proxyUrl = proxyUrlMatch[1];
      appState.originalUrl = originalUrlMatch?.[1] || "http://localhost:3000";
      appState.status = "running";
      runningApps.set(appId, appState);
    }
  }

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

// Broadcast status change to all subscribers
export function broadcastAppStatus(
  appId: number,
  status: AppStatusMessage["status"],
  url?: string,
  error?: string,
) {
  // Update running apps state
  if (status === "stopped") {
    runningApps.delete(appId);
  } else {
    // Preserve proxyUrl and originalUrl if they exist
    const existing = runningApps.get(appId);
    runningApps.set(appId, {
      ...existing,
      status,
      url,
    });
  }

  const subscribers = appSubscriptions.get(appId);
  if (!subscribers || subscribers.size === 0) {
    return;
  }

  const statusMsg: AppStatusMessage = {
    type: "app:status",
    appId,
    status,
    url,
    error,
  };

  const payload = JSON.stringify(statusMsg);
  for (const ws of subscribers) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function sendStatus(
  ws: WebSocket,
  appId: number,
  status: AppStatusMessage["status"],
  url?: string,
) {
  const statusMsg: AppStatusMessage = {
    type: "app:status",
    appId,
    status,
    url,
  };
  ws.send(JSON.stringify(statusMsg));
}

// Get current status of an app
export function getAppStatus(appId: number): AppStatusMessage["status"] | null {
  const state = runningApps.get(appId);
  return state?.status || null;
}
