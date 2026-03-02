import type { AgentStatus } from "@/atoms/agentStatusAtoms";
import { useAgentStatus } from "@/hooks/useAgentStatus";

const STATUS_COLORS: Record<AgentStatus, string> = {
  offline: "bg-gray-400",
  scheduling: "bg-amber-400",
  starting: "bg-amber-400",
  ready: "bg-green-500",
  working: "bg-blue-500",
  error: "bg-red-500",
};

const PULSING_STATUSES: Set<AgentStatus> = new Set([
  "scheduling",
  "starting",
  "working",
]);

export function AgentStatusIndicator({ appId }: { appId: number | null }) {
  const { status, message } = useAgentStatus(appId);

  const dotColor = STATUS_COLORS[status];
  const isPulsing = PULSING_STATUSES.has(status);

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground select-none">
      <span className="relative flex h-2 w-2">
        {isPulsing && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${dotColor}`}
          />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`}
        />
      </span>
      <span>{message}</span>
    </div>
  );
}
