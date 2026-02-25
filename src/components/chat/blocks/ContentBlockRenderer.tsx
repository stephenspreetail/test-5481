import type { ContentBlock } from "@/types/content-blocks";
import { isToolActivityBlock } from "@/types/content-blocks";
import { TextBlockView } from "./TextBlockView";
import { ToolGroupView } from "./ToolGroupView";

interface ContentBlockRendererProps {
  contentBlocks: ContentBlock[];
  isStreaming: boolean;
}

type RenderGroup =
  | { type: "text"; text: string }
  | { type: "tool_group"; blocks: ContentBlock[] };

/**
 * Groups adjacent content blocks for rendering:
 * - Consecutive tool activity blocks form a tool group
 * - Text blocks stand alone
 * - Text blocks break tool groups
 */
function groupBlocks(blocks: ContentBlock[]): RenderGroup[] {
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
      // Merge adjacent text groups
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.type === "text") {
        lastGroup.text += block.text;
      } else {
        groups.push({ type: "text", text: block.text });
      }
    } else if (isToolActivityBlock(block)) {
      currentToolGroup.push(block);
    }
    // thinking blocks are ignored for now
  }

  flushToolGroup();
  return groups;
}

export function ContentBlockRenderer({
  contentBlocks,
  isStreaming,
}: ContentBlockRendererProps) {
  const groups = groupBlocks(contentBlocks);

  // Track which tool group is the last one (for streaming indicator)
  let toolGroupIndex = 0;
  const totalToolGroups = groups.filter((g) => g.type === "tool_group").length;

  return (
    <>
      {groups.map((group, i) => {
        if (group.type === "text") {
          return <TextBlockView key={i} text={group.text} />;
        }
        toolGroupIndex++;
        const isLastToolGroup = toolGroupIndex === totalToolGroups;
        return (
          <ToolGroupView
            key={i}
            blocks={group.blocks}
            isStreaming={isStreaming}
            isLastGroup={isLastToolGroup}
          />
        );
      })}
    </>
  );
}
