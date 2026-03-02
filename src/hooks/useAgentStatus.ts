import { useEffect } from "react";
import { useAtom } from "jotai";
import {
  agentStatusByAppIdAtom,
  type AgentStatus,
  type AgentStatusEntry,
} from "@/atoms/agentStatusAtoms";
import { WebSocketClient } from "@/client/api/websocket_client";

const DEFAULT_STATUS: AgentStatusEntry = {
  status: "offline",
  message: "Offline",
};

export function useAgentStatus(appId: number | null): AgentStatusEntry {
  const [statusMap, setStatusMap] = useAtom(agentStatusByAppIdAtom);

  useEffect(() => {
    if (appId == null) return;

    let ws: WebSocketClient;
    try {
      ws = WebSocketClient.getInstance();
    } catch {
      return;
    }

    const callback = (status: AgentStatus, message: string) => {
      setStatusMap((prev) => {
        const next = new Map(prev);
        next.set(appId, { status, message });
        return next;
      });
    };

    const unsubscribe = ws.subscribeToAgentStatus(appId, callback);

    return () => {
      unsubscribe();
    };
  }, [appId, setStatusMap]);

  if (appId == null) return DEFAULT_STATUS;
  return statusMap.get(appId) ?? DEFAULT_STATUS;
}
