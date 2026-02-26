import type { ContentBlock } from "@/types/content-blocks";
import { isToolActivityBlock } from "@/types/content-blocks";
import { useState } from "react";
import { blocksToPhases, type Phase } from "../phase-mapping";
import { groupBlocks, type RenderGroup } from "../content-block-groups";
import { TextBlockView } from "../TextBlockView";
import { ToolGroupView } from "../ToolGroupView";
import { PhaseGroup } from "./PhaseGroup";
import { ProgressSteps } from "./ProgressSteps";

interface PhaseBasedDisplayProps {
  contentBlocks: ContentBlock[];
  isStreaming: boolean;
}

export function PhaseBasedDisplay({
  contentBlocks,
  isStreaming,
}: PhaseBasedDisplayProps) {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  if (showTechnicalDetails) {
    const groups = groupBlocks(contentBlocks);
    let toolGroupIndex = 0;
    const totalToolGroups = groups.filter(
      (g: RenderGroup) => g.type === "tool_group",
    ).length;

    return (
      <div>
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
        <button
          type="button"
          onClick={() => setShowTechnicalDetails(false)}
          className="mt-2 text-xs text-muted-foreground hover:text-foreground underline"
        >
          Hide technical details
        </button>
      </div>
    );
  }

  const hasToolBlocks = contentBlocks.some((b) => isToolActivityBlock(b));
  const phases = blocksToPhases(contentBlocks, isStreaming);
  const hasAnyPhaseItems = phases.some((p: Phase) => p.items.length > 0);

  return (
    <div>
      {contentBlocks.map((block, i) => {
        if (block.type === "text") {
          return <TextBlockView key={i} text={block.text} />;
        }
        return null;
      })}

      {hasAnyPhaseItems && (
        <>
          <ProgressSteps phases={phases} />
          {phases.map((phase: Phase) => (
            <PhaseGroup key={phase.id} phase={phase} />
          ))}
        </>
      )}

      {hasToolBlocks && (
        <button
          type="button"
          onClick={() => setShowTechnicalDetails(true)}
          className="mt-2 text-xs text-muted-foreground hover:text-foreground underline"
        >
          Show technical details
        </button>
      )}
    </div>
  );
}
