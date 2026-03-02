import { WebSocket } from "ws";

export type AgentStatus =
  | "offline"
  | "scheduling"
  | "starting"
  | "ready"
  | "working"
  | "error";

export interface AgentStatusMessage {
  type: "app:agent:status";
  appId: number;
  status: AgentStatus;
  message: string;
  timestamp: number;
}

export const STATUS_MESSAGES: Record<AgentStatus, string> = {
  offline: "Offline",
  scheduling: "Waking up...",
  starting: "Getting ready...",
  ready: "Ready",
  working: "Working...",
  error: "Something went wrong",
};

/**
 * Async resolver that queries K8s for real pod state.
 * Registered by app-container.service at init to avoid circular imports.
 */
type StatusResolver = (appId: number) => Promise<AgentStatus>;
let resolveFromK8s: StatusResolver | null = null;

export function registerStatusResolver(resolver: StatusResolver): void {
  resolveFromK8s = resolver;
}

// Track which WebSocket connections are subscribed to which app's agent status
const agentStatusSubscriptions = new Map<number, Set<WebSocket>>();

// Track app-level "working" state. This is the ONLY local state we maintain.
// K8s doesn't know if the agent is idle or processing a prompt — both look
// like a Running pod. The chat-stream handler sets/clears this.
const workingApps = new Set<number>();

export function setWorkingState(appId: number, isWorking: boolean): void {
  if (isWorking) {
    workingApps.add(appId);
  } else {
    workingApps.delete(appId);
  }
}

export function subscribeToAgentStatus(appId: number, ws: WebSocket): void {
  if (!agentStatusSubscriptions.has(appId)) {
    agentStatusSubscriptions.set(appId, new Set());
  }
  agentStatusSubscriptions.get(appId)!.add(ws);

  // Query K8s for real pod state and send it to the new subscriber.
  // This is async — the subscription is registered immediately, the
  // status arrives when K8s responds (typically <100ms).
  resolveAndSend(appId, ws);
}

/**
 * Query K8s for real status and send to a specific client.
 * If the agent is actively working, override with "working".
 */
async function resolveAndSend(appId: number, ws: WebSocket): Promise<void> {
  try {
    let status: AgentStatus;

    if (workingApps.has(appId)) {
      // Agent is actively processing a prompt — K8s would just say "running"
      status = "working";
    } else if (resolveFromK8s) {
      status = await resolveFromK8s(appId);
    } else {
      return; // No resolver registered yet
    }

    if (ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
      type: "app:agent:status",
      appId,
      status,
      message: STATUS_MESSAGES[status],
      timestamp: Date.now(),
    } satisfies AgentStatusMessage));
  } catch (err) {
    console.error(`[AgentStatus] Failed to resolve status for app ${appId}:`, err);
  }
}

export function unsubscribeFromAgentStatus(
  appId: number,
  ws: WebSocket,
): void {
  const subscribers = agentStatusSubscriptions.get(appId);
  if (subscribers) {
    subscribers.delete(ws);
    if (subscribers.size === 0) {
      agentStatusSubscriptions.delete(appId);
    }
  }
}

export function unsubscribeFromAllAgentStatus(ws: WebSocket): void {
  for (const [appId, subscribers] of agentStatusSubscriptions.entries()) {
    subscribers.delete(ws);
    if (subscribers.size === 0) {
      agentStatusSubscriptions.delete(appId);
    }
  }
}

export function broadcastAgentStatus(
  appId: number,
  status: AgentStatus,
  message?: string,
): void {
  const resolvedMessage = message ?? STATUS_MESSAGES[status];

  const subscribers = agentStatusSubscriptions.get(appId);
  if (!subscribers || subscribers.size === 0) {
    return;
  }

  const payload = JSON.stringify({
    type: "app:agent:status",
    appId,
    status,
    message: resolvedMessage,
    timestamp: Date.now(),
  } satisfies AgentStatusMessage);

  for (const ws of subscribers) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

export function clearAgentStatus(appId: number): void {
  workingApps.delete(appId);
}
