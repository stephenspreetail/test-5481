import type { PhaseItem as PhaseItemType } from "../phase-mapping";
import { Check, Loader2 } from "lucide-react";

interface PhaseItemProps {
  item: PhaseItemType;
}

export function PhaseItem({ item }: PhaseItemProps) {
  const isActive = item.status === "active";

  return (
    <div
      className={`flex items-center gap-2 py-1.5 px-2.5 rounded-md text-[13px] ${
        isActive
          ? "bg-[rgba(107,159,201,0.1)] border border-[rgba(107,159,201,0.2)]"
          : "bg-[rgba(58,64,72,0.25)]"
      }`}
    >
      <span className="flex-shrink-0">
        {isActive ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
        ) : (
          <Check className="w-3.5 h-3.5 text-[#0AA68C]" />
        )}
      </span>
      <span
        className={
          isActive ? "text-primary font-medium" : "text-accent-foreground"
        }
      >
        {item.label}
      </span>
      {item.detail != null && (
        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
          {item.detail}
        </span>
      )}
    </div>
  );
}
