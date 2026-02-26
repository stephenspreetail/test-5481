import type { Phase, PhaseItem as PhaseItemType } from "../phase-mapping";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { PhaseItem } from "./PhaseItem";

interface PhaseGroupProps {
  phase: Phase;
}

const statusIcon = (status: Phase["status"]) => {
  if (status === "active") return <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />;
  if (status === "complete") return <Check className="w-3.5 h-3.5 text-[#0AA68C]" />;
  return <span className="w-3.5 h-3.5 rounded-full border border-muted-foreground/50" />;
};

export function PhaseGroup({ phase }: PhaseGroupProps) {
  const [isExpanded, setIsExpanded] = useState(phase.status !== "pending");
  const hasItems = phase.items.length > 0;
  const isActive = phase.status === "active";

  return (
    <div
      className={`my-1.5 border rounded-[var(--radius)] overflow-hidden ${
        isActive
          ? "border-[rgba(107,159,201,0.3)] bg-[var(--background-darker)]"
          : "border-border bg-[var(--background-darker)]"
      }`}
    >
      <button
        type="button"
        onClick={() => hasItems && setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left ${
          hasItems ? "cursor-pointer hover:bg-[rgba(58,64,72,0.3)]" : ""
        }`}
      >
        <div className="flex items-center gap-2 text-[13px]">
          {statusIcon(phase.status)}
          <span
            className={
              phase.status === "pending"
                ? "text-muted-foreground"
                : phase.status === "active"
                  ? "text-primary font-medium"
                  : "text-accent-foreground"
            }
          >
            {phase.label}
          </span>
          {hasItems && (
            <span className="text-[11px] text-muted-foreground">
              {phase.items.length} step{phase.items.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {hasItems && (
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        )}
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && hasItems && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-2.5 flex flex-col gap-1.5">
              {phase.items.map((item: PhaseItemType, i: number) => (
                <PhaseItem key={i} item={item} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
