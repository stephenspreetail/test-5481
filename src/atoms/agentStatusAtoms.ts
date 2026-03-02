import { atom } from "jotai";
import type { AgentStatus } from "@/client/api/types";

export type { AgentStatus };

export interface AgentStatusEntry {
  status: AgentStatus;
  message: string;
}

export const agentStatusByAppIdAtom = atom<Map<number, AgentStatusEntry>>(
  new Map(),
);
