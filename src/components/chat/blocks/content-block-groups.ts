import type { ContentBlock } from "@/types/content-blocks";
import { isToolActivityBlock } from "@/types/content-blocks";

export type RenderGroup =
  | { type: "text"; text: string }
  | { type: "tool_group"; blocks: ContentBlock[] };

/**
 * Groups adjacent content blocks for rendering:
 * - Consecutive tool activity blocks form a tool group
 * - Text blocks stand alone
 * - Text blocks break tool groups
 */
export function groupBlocks(blocks: ContentBlock[]): RenderGroup[] {
  const groups: RenderGroup[] = [];
  let currentToolGroup: ContentBlock[] = [];

  const flushToolGroup = () => {
    if (currentToolGroup.length > 0) {
      groups.push({ type: "tool_group", blocks: [...currentToolGroup] });
      currentToolGroup = [];
    }
  };

  for (const block of blocks) {
    if (block.type === "text") {
      flushToolGroup();
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.type === "text") {
        lastGroup.text += block.text;
      } else {
        groups.push({ type: "text", text: block.text });
      }
    } else if (isToolActivityBlock(block)) {
      currentToolGroup.push(block);
    }
  }

  flushToolGroup();
  return groups;
}
