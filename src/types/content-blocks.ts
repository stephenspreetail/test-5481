/**
 * Structured content block types for chat message rendering.
 *
 * During streaming, the backend sends structured deltas with block metadata.
 * The frontend accumulates these into ContentBlock arrays for rich rendering.
 * Messages loaded from the DB only have a flat `content` string (backward compat).
 */

export type ContentBlockType =
  | "text"
  | "tool_use"
  | "tool_result"
  | "file_edit"
  | "bash"
  | "thinking";

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  toolName: string;
  toolInput?: unknown;
  displayName: string;
  filePath?: string;
  /** Extra detail string for display (e.g., skill name, search pattern, active task) */
  detail?: string;
}

export interface ToolResultBlock {
  type: "tool_result";
  toolName: string;
  content?: unknown;
  truncated?: boolean;
}

export interface FileEditBlock {
  type: "file_edit";
  operation: "write" | "edit";
  filePath: string;
}

export interface BashBlock {
  type: "bash";
  command: string;
}

export interface ThinkingBlock {
  type: "thinking";
  text: string;
}

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | FileEditBlock
  | BashBlock
  | ThinkingBlock;

/** Blocks that represent tool activity (groupable) */
export type ToolActivityBlock =
  | ToolUseBlock
  | ToolResultBlock
  | FileEditBlock
  | BashBlock;

/** Check if a block is a tool activity block (for grouping) */
export function isToolActivityBlock(
  block: ContentBlock,
): block is ToolActivityBlock {
  return (
    block.type === "tool_use" ||
    block.type === "tool_result" ||
    block.type === "file_edit" ||
    block.type === "bash"
  );
}
