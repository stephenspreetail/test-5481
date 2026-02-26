/**
 * Maps ContentBlock[] into business-friendly phases for the Business role view.
 * Technical tool events are grouped into Setup, Build, and Verify with friendly labels.
 */

import type { ContentBlock } from "@/types/content-blocks";
import { isToolActivityBlock } from "@/types/content-blocks";

export type PhaseId = "setup" | "build" | "verify";

export type PhaseStatus = "pending" | "active" | "complete";

export interface PhaseItem {
  label: string;
  status: "active" | "complete";
  detail?: string;
}

export interface Phase {
  id: PhaseId;
  label: string;
  status: PhaseStatus;
  items: PhaseItem[];
}

const PHASE_LABELS: Record<PhaseId, string> = {
  setup: "Setting up project",
  build: "Building your app",
  verify: "Checking everything works",
};

/**
 * Map file paths to business-friendly names.
 */
export function friendlyFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  const base = segments[segments.length - 1] ?? filePath;

  const known: Record<string, string> = {
    "index.tsx": "Homepage",
    "__root.tsx": "App layout",
    "root.tsx": "App root",
    "app.tsx": "App entry",
    "main.tsx": "App entry",
  };

  if (known[base]) return known[base];

  const withoutExt = base.replace(/\.[^.]+$/, "");
  if (withoutExt && withoutExt !== base) {
    return withoutExt;
  }
  return base;
}

function getBashIntent(command: string): { phase: PhaseId; label: string } | null {
  const c = command.trim().toLowerCase();
  if (c.includes("bun install") || c.includes("npm install") || c.includes("pnpm install")) {
    return { phase: "setup", label: "Installing dependencies" };
  }
  if (c.includes("cp ") && (c.includes("template") || c.includes(".claude"))) {
    return { phase: "setup", label: "Setting up project files" };
  }
  if (c.includes("typecheck") || c.includes("tsc --noEmit") || c.includes("tsc ")) {
    return { phase: "verify", label: "Checking for errors" };
  }
  if (c.includes(" build") || c === "bun run build" || c === "npm run build") {
    return { phase: "verify", label: "Building your app" };
  }
  return null;
}

function isHiddenToolBlock(block: ContentBlock): boolean {
  if (block.type === "tool_use") {
    if (block.toolName === "TodoWrite") return true;
    if (block.toolName === "Skill") return true;
    if (block.toolName === "Read") return true;
  }
  if (block.type === "tool_result") return true;
  return false;
}

function blockToPhaseItem(
  block: ContentBlock,
  isLastBlock: boolean,
): { phase: PhaseId; item: PhaseItem } | null {
  if (block.type === "text" || block.type === "thinking") return null;
  if (isHiddenToolBlock(block)) return null;

  if (block.type === "file_edit") {
    const name = friendlyFileName(block.filePath);
    const label = block.operation === "write" ? "Creating" : "Updating";
    return {
      phase: "build",
      item: {
        label: `${label} ${name}`,
        status: isLastBlock ? "active" : "complete",
        detail: undefined,
      },
    };
  }

  if (block.type === "bash") {
    const intent = getBashIntent(block.command);
    if (intent) {
      return {
        phase: intent.phase,
        item: {
          label: intent.label,
          status: isLastBlock ? "active" : "complete",
          detail: undefined,
        },
      };
    }
    return null;
  }

  if (block.type === "tool_use") {
    if (block.toolName === "Write" && block.filePath) {
      const name = friendlyFileName(block.filePath);
      return {
        phase: "build",
        item: {
          label: `Creating ${name}`,
          status: isLastBlock ? "active" : "complete",
        },
      };
    }
    if (block.toolName === "Edit" && block.filePath) {
      const name = friendlyFileName(block.filePath);
      return {
        phase: "build",
        item: {
          label: `Updating ${name}`,
          status: isLastBlock ? "active" : "complete",
        },
      };
    }
  }

  return null;
}

/**
 * Build phases with items from content blocks.
 */
export function blocksToPhases(
  blocks: ContentBlock[],
  isStreaming: boolean,
): Phase[] {
  const setupItems: PhaseItem[] = [];
  const buildItems: PhaseItem[] = [];
  const verifyItems: PhaseItem[] = [];

  const toolBlocks = blocks.filter((b) => isToolActivityBlock(b));
  const lastIndex = toolBlocks.length - 1;

  for (let i = 0; i < toolBlocks.length; i++) {
    const block = toolBlocks[i];
    const isLast = isStreaming ? i === lastIndex : true;
    const result = blockToPhaseItem(block, isLast);
    if (!result) continue;

    if (result.phase === "setup") setupItems.push(result.item);
    else if (result.phase === "build") buildItems.push(result.item);
    else verifyItems.push(result.item);
  }

  const hasSetup = setupItems.length > 0;
  const hasBuild = buildItems.length > 0;
  const hasVerify = verifyItems.length > 0;

  const setupStatus: PhaseStatus =
    hasVerify || hasBuild ? "complete" : hasSetup && isStreaming ? "active" : hasSetup ? "complete" : "pending";
  const buildStatus: PhaseStatus =
    hasVerify ? "complete" : hasBuild && isStreaming && !hasVerify ? "active" : hasBuild ? "complete" : "pending";
  const verifyStatus: PhaseStatus =
    hasVerify && isStreaming ? "active" : hasVerify ? "complete" : "pending";

  return [
    {
      id: "setup",
      label: PHASE_LABELS.setup,
      status: setupStatus,
      items: setupItems,
    },
    {
      id: "build",
      label: PHASE_LABELS.build,
      status: buildStatus,
      items: buildItems,
    },
    {
      id: "verify",
      label: PHASE_LABELS.verify,
      status: verifyStatus,
      items: verifyItems,
    },
  ];
}

/**
 * Split blocks into text segments and tool blocks for phase mapping.
 */
export function splitTextAndToolBlocks(blocks: ContentBlock[]): {
  segments: Array<{ key: number; text: string }>;
  toolBlocks: ContentBlock[];
} {
  const segments: Array<{ key: number; text: string }> = [];
  const toolBlocks: ContentBlock[] = [];
  let textAccum = "";
  let key = 0;

  for (const block of blocks) {
    if (block.type === "text") {
      textAccum += block.text;
    } else if (isToolActivityBlock(block)) {
      if (textAccum) {
        segments.push({ key: key++, text: textAccum });
        textAccum = "";
      }
      toolBlocks.push(block);
    }
  }
  if (textAccum) {
    segments.push({ key: key++, text: textAccum });
  }

  return { segments, toolBlocks };
}
