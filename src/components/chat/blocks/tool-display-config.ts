/**
 * Tool display configuration - maps internal tool names to
 * human-friendly labels, icons, and detail extractors.
 */

import type {
  BashBlock,
  ContentBlock,
  FileEditBlock,
  ToolUseBlock,
} from "@/types/content-blocks";
import type { LucideIcon } from "lucide-react";
import {
  FileText,
  FilePlus,
  FileEdit,
  Search,
  Terminal,
  Sparkles,
  Plug,
  Eye,
  ListTodo,
} from "lucide-react";

export interface ToolDisplayInfo {
  label: string;
  icon: LucideIcon;
}

const TOOL_DISPLAY_MAP: Record<string, ToolDisplayInfo> = {
  Read: { label: "Reading", icon: FileText },
  Write: { label: "Creating", icon: FilePlus },
  Edit: { label: "Editing", icon: FileEdit },
  Glob: { label: "Searching files", icon: Search },
  Grep: { label: "Searching code", icon: Search },
  Bash: { label: "Running", icon: Terminal },
  Skill: { label: "Using skill", icon: Sparkles },
  TodoWrite: { label: "Planning", icon: ListTodo },
  View: { label: "Viewing", icon: Eye },
};

const DEFAULT_DISPLAY: ToolDisplayInfo = {
  label: "Using",
  icon: Plug,
};

/** Get display info for a tool name */
export function getToolDisplay(toolName: string): ToolDisplayInfo {
  return TOOL_DISPLAY_MAP[toolName] ?? DEFAULT_DISPLAY;
}

/** Get human-friendly display name for a tool */
export function getToolDisplayName(toolName: string): string {
  return TOOL_DISPLAY_MAP[toolName]?.label ?? `Using ${toolName}`;
}

/** Get the icon component for a tool */
export function getToolIcon(toolName: string): LucideIcon {
  return TOOL_DISPLAY_MAP[toolName]?.icon ?? DEFAULT_DISPLAY.icon;
}

/**
 * Extract meaningful details from tool input.
 * Returns filePath, command, pattern, or other relevant info.
 */
export function extractToolDetails(
  toolName: string,
  toolInput: unknown,
): { filePath?: string; command?: string; pattern?: string } {
  if (!toolInput || typeof toolInput !== "object") return {};

  const input = toolInput as Record<string, unknown>;

  switch (toolName) {
    case "Read":
      return { filePath: shortenPath(input.file_path as string) };

    case "Write":
      return { filePath: shortenPath(input.file_path as string) };

    case "Edit":
      return { filePath: shortenPath(input.file_path as string) };

    case "Glob":
      return { pattern: input.pattern as string };

    case "Grep":
      return { pattern: input.pattern as string };

    case "Bash":
      return { command: truncateCommand(input.command as string) };

    case "Skill":
      return { pattern: input.skill_name as string };

    default:
      return {};
  }
}

/**
 * Convert a ToolUseBlock into a more specific block type
 * (FileEditBlock or BashBlock) when applicable.
 */
export function specializeToolBlock(
  toolName: string,
  toolInput: unknown,
): ContentBlock | null {
  const details = extractToolDetails(toolName, toolInput);

  if ((toolName === "Write" || toolName === "Edit") && details.filePath) {
    return {
      type: "file_edit",
      operation: toolName === "Write" ? "write" : "edit",
      filePath: details.filePath,
    } satisfies FileEditBlock;
  }

  if (toolName === "Bash" && details.command) {
    return {
      type: "bash",
      command: details.command,
    } satisfies BashBlock;
  }

  return null;
}

/** Shorten a file path to just filename or last 2 segments */
function shortenPath(path?: string): string | undefined {
  if (!path) return undefined;
  const segments = path.replace(/\\/g, "/").split("/");
  if (segments.length <= 2) return segments.join("/");
  return segments.slice(-2).join("/");
}

/** Truncate a bash command for display */
function truncateCommand(command?: string): string | undefined {
  if (!command) return undefined;
  const firstLine = command.split("\n")[0].trim();
  if (firstLine.length > 60) return firstLine.slice(0, 57) + "...";
  return firstLine;
}

/**
 * Categorize a list of content blocks for summary display.
 * Returns counts like { edits: 3, reads: 2, commands: 1 }
 */
export function categorizeBlocks(
  blocks: ContentBlock[],
): { label: string; count: number }[] {
  const counts: Record<string, number> = {};

  for (const block of blocks) {
    if (block.type === "file_edit") {
      counts["edits"] = (counts["edits"] ?? 0) + 1;
    } else if (block.type === "bash") {
      counts["commands"] = (counts["commands"] ?? 0) + 1;
    } else if (block.type === "tool_use") {
      if (block.toolName === "Read") {
        counts["reads"] = (counts["reads"] ?? 0) + 1;
      } else if (block.toolName === "Glob" || block.toolName === "Grep") {
        counts["searches"] = (counts["searches"] ?? 0) + 1;
      } else {
        counts["tools"] = (counts["tools"] ?? 0) + 1;
      }
    }
    // tool_result blocks don't count toward summary
  }

  return Object.entries(counts).map(([label, count]) => ({ label, count }));
}
