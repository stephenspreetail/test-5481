import type { Phase } from "../phase-mapping";
import { Check } from "lucide-react";

interface ProgressStepsProps {
  phases: Phase[];
}

const PHASE_ORDER: Phase["id"][] = ["setup", "build", "verify"];

export function ProgressSteps({ phases }: ProgressStepsProps) {
  const ordered = PHASE_ORDER.map((id) => phases.find((p) => p.id === id)).filter(
    (p): p is Phase => p != null,
  );

  return (
    <div className="flex items-center gap-1 my-3">
      {ordered.map((phase, i) => {
        const isComplete = phase.status === "complete";
        const isActive = phase.status === "active";
        const isPending = phase.status === "pending";

        return (
          <div key={phase.id} className="flex items-center flex-1 min-w-0">
            <div
              className={`flex items-center gap-1.5 flex-1 min-w-0 ${
                isPending ? "opacity-60" : ""
              }`}
            >
              <span
                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium ${
                  isComplete
                    ? "bg-[#0AA68C] text-white"
                    : isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isComplete ? <Check className="w-3 h-3" /> : i + 1}
              </span>
              <span
                className={`truncate text-[12px] ${
                  isActive ? "text-primary font-medium" : "text-muted-foreground"
                }`}
                title={phase.label}
              >
                {phase.label}
              </span>
            </div>
            {i < ordered.length - 1 && (
              <div
                className={`flex-shrink-0 w-4 h-0.5 mx-0.5 ${
                  isComplete ? "bg-[#0AA68C]" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
