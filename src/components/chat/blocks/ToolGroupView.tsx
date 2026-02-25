import type { ContentBlock } from "@/types/content-blocks";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Loader2, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { categorizeBlocks, getToolDisplayName } from "./tool-display-config";
import { ToolUseChip } from "./ToolUseChip";

interface ToolGroupViewProps {
  blocks: ContentBlock[];
  isStreaming: boolean;
  isLastGroup: boolean;
}

export function ToolGroupView({
  blocks,
  isStreaming,
  isLastGroup,
}: ToolGroupViewProps) {
  const isActive = isStreaming && isLastGroup;
  const [isExpanded, setIsExpanded] = useState(isActive);

  // Auto-expand when streaming starts, auto-collapse when it ends
  useEffect(() => {
    if (isActive) {
      setIsExpanded(true);
    } else if (!isStreaming) {
      // Delay collapse for a smooth transition
      const timer = setTimeout(() => setIsExpanded(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isActive, isStreaming]);

  // Filter out tool_result blocks for display - they're just completion signals
  const displayBlocks = blocks.filter((b) => b.type !== "tool_result");
  if (displayBlocks.length === 0) return null;

  const totalTools = displayBlocks.length;
  const categories = categorizeBlocks(displayBlocks);

  // Find the last tool being worked on (for streaming label)
  const lastToolBlock = displayBlocks[displayBlocks.length - 1];
  const activeLabel = lastToolBlock
    ? getActiveLabel(lastToolBlock)
    : "Working...";

  return (
    <div
      className={`my-2 border rounded-[var(--radius)] overflow-hidden ${
        isActive
          ? "border-[rgba(107,159,201,0.3)] bg-[var(--background-darker)]"
          : "border-border bg-[var(--background-darker)]"
      }`}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => !isActive && setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left ${
          !isActive ? "cursor-pointer hover:bg-[rgba(58,64,72,0.3)]" : ""
        }`}
      >
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          {isActive ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          ) : (
            <Wrench className="w-3.5 h-3.5" />
          )}
          {isActive ? (
            <span className="text-primary">{activeLabel}</span>
          ) : (
            <>
              <span>Used {totalTools} tool{totalTools !== 1 ? "s" : ""}</span>
              {categories.map((cat) => (
                <span
                  key={cat.label}
                  className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-medium"
                >
                  {cat.count} {cat.label}
                </span>
              ))}
            </>
          )}
        </div>
        {!isActive && (
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        )}
      </button>

      {/* Expandable content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-2.5 flex flex-col gap-1.5">
              {displayBlocks.map((block, i) => (
                <ToolUseChip
                  key={i}
                  block={block}
                  isActive={isActive && i === displayBlocks.length - 1}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function getActiveLabel(block: ContentBlock): string {
  switch (block.type) {
    case "file_edit":
      return `${block.operation === "write" ? "Creating" : "Editing"} ${block.filePath}`;
    case "bash":
      return `Running ${block.command}`;
    case "tool_use": {
      const label = block.displayName || getToolDisplayName(block.toolName);
      const extra = block.filePath || block.detail || "";
      return `${label} ${extra}`.trim();
    }
    default:
      return "Working...";
  }
}
