import { currentUserAtom } from "@/atoms/authAtoms";
import type { ContentBlock } from "@/types/content-blocks";
import { useAtomValue } from "jotai";
import { groupBlocks, type RenderGroup } from "./content-block-groups";
import { PhaseBasedDisplay } from "./business/PhaseBasedDisplay";
import { TextBlockView } from "./TextBlockView";
import { ToolGroupView } from "./ToolGroupView";

interface ContentBlockRendererProps {
  contentBlocks: ContentBlock[];
  isStreaming: boolean;
}

export function ContentBlockRenderer({
  contentBlocks,
  isStreaming,
}: ContentBlockRendererProps) {
  const currentUser = useAtomValue(currentUserAtom);
  const role = currentUser?.role;
  const isBusinessView = role === "Business";

  if (isBusinessView) {
    return (
      <PhaseBasedDisplay
        contentBlocks={contentBlocks}
        isStreaming={isStreaming}
      />
    );
  }

  const groups = groupBlocks(contentBlocks);

  // Track which tool group is the last one (for streaming indicator)
  let toolGroupIndex = 0;
  const totalToolGroups = groups.filter(
    (g: RenderGroup) => g.type === "tool_group",
  ).length;

  return (
    <>
      {groups.map((group: RenderGroup, i: number) => {
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
