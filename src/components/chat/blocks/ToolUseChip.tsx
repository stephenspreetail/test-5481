import type { ContentBlock } from "@/types/content-blocks";
import { Check, Loader2 } from "lucide-react";
import { getToolDisplay } from "./tool-display-config";

interface ToolUseChipProps {
  block: ContentBlock;
  isActive?: boolean;
}

export function ToolUseChip({ block, isActive = false }: ToolUseChipProps) {
  const { label, icon: Icon, detail } = getChipInfo(block);

  return (
    <div
      className={`flex items-center gap-2 py-1.5 px-2.5 rounded-md text-[13px] ${
        isActive
          ? "bg-[rgba(107,159,201,0.1)] border border-[rgba(107,159,201,0.2)]"
          : "bg-[rgba(58,64,72,0.25)]"
      }`}
    >
      <Icon
        className={`w-3.5 h-3.5 flex-shrink-0 ${
          isActive ? "text-primary" : "text-muted-foreground"
        }`}
      />
      <span
        className={`${isActive ? "text-primary" : "text-accent-foreground"}`}
      >
        {label}
      </span>
      {detail && (
        <span
          className={`font-mono text-xs truncate max-w-[200px] ${
            isActive
              ? "text-primary opacity-70"
              : "text-muted-foreground"
          }`}
        >
          {detail}
        </span>
      )}
      <span className="ml-auto flex-shrink-0">
        {isActive ? (
          <Loader2 className="w-3 h-3 animate-spin text-primary" />
        ) : (
          <Check className="w-3 h-3 text-[#0AA68C]" />
        )}
      </span>
    </div>
  );
}

function getChipInfo(block: ContentBlock): {
  label: string;
  icon: ReturnType<typeof getToolDisplay>["icon"];
  detail?: string;
} {
  switch (block.type) {
    case "file_edit": {
      const display = getToolDisplay(block.operation === "write" ? "Write" : "Edit");
      return { label: display.label, icon: display.icon, detail: block.filePath };
    }
    case "bash": {
      const display = getToolDisplay("Bash");
      return { label: display.label, icon: display.icon, detail: block.command };
    }
    case "tool_use": {
      const display = getToolDisplay(block.toolName);
      return {
        label: block.displayName || display.label,
        icon: display.icon,
        detail: block.filePath || block.detail,
      };
    }
    default: {
      const display = getToolDisplay("");
      return { label: display.label, icon: display.icon };
    }
  }
}
