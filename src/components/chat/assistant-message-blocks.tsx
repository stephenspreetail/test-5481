import { useMemo } from 'react'
import type { UIMessage } from 'ai'
import type { AgentStep, MessageMetadata, PipelineLogs } from '@/types'
import { parseAnalysisResponse, ARTIFACT_BLOCK_REGEX } from '@/lib/parsers/parse-analysis-response'
import {
  AGENT_LABELS,
  groupLogsByAgent,
  computeAgentDuration,
  buildSummaryLabel,
} from '@/lib/utils/pipeline-display'
import { WorkingStepBlock } from './working-step-block'
import { AnalysisPlanBlock } from './analysis-plan-block'
import { ResponseBlock } from './response-block'

interface AssistantMessageBlocksProps {
  message: UIMessage
  agentSteps?: AgentStep[]
  isStreaming?: boolean
  isLastMessage?: boolean
  onSuggestedQuestion: (question: string) => void
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

/**
 * Derive a step status for a given agent.
 * During streaming: use the live agentSteps state.
 * After streaming: derive from pipelineLogs (all completed, or error).
 */
function resolveStepStatus(
  agent: AgentStep['agent'],
  agentSteps?: AgentStep[],
  pipelineLogs?: PipelineLogs,
  isStreaming?: boolean
): AgentStep['status'] {
  // During streaming, prefer live agentSteps
  if (isStreaming && agentSteps) {
    const step = agentSteps.find((s) => s.agent === agent)
    if (step) return step.status
  }

  // From agentSteps (set to all-completed by onFinish)
  if (agentSteps && agentSteps.length > 0) {
    const step = agentSteps.find((s) => s.agent === agent)
    if (step) return step.status
  }

  // From pipelineLogs (history)
  if (pipelineLogs) {
    const agentsInLogs = new Set(pipelineLogs.entries.map((e) => e.agent))
    if (agentsInLogs.has(agent)) {
      return pipelineLogs.hasErrors && agent === 'analysis' ? 'error' : 'completed'
    }
    return 'completed'
  }

  return 'pending'
}

const AGENTS: AgentStep['agent'][] = ['analyzer', 'clickhouse', 'analysis']

export function AssistantMessageBlocks({
  message,
  agentSteps,
  isStreaming = false,
  isLastMessage = false,
  onSuggestedQuestion,
}: AssistantMessageBlocksProps) {
  const text = getMessageText(message)
  const metadata = (message as UIMessage & { metadata?: MessageMetadata }).metadata
  const pipelineLogs = metadata?.pipelineLogs
  const analysisPlan = metadata?.analysisPlan

  // Parse structured sections only after streaming finishes
  const parsed = useMemo(
    () => (isStreaming ? null : parseAnalysisResponse(text)),
    [text, isStreaming]
  )

  // Strip artifact block from streaming text.
  // Two regexes: one for complete blocks, one for in-progress blocks
  // (opened with ```artifact but closing ``` hasn't arrived yet).
  const streamingMarkdown = useMemo(() => {
    if (!isStreaming) return ''
    let cleaned = text.replace(ARTIFACT_BLOCK_REGEX, '')
    cleaned = cleaned.replace(/```artifact\n[\s\S]*$/, '')
    return cleaned.trim()
  }, [text, isStreaming])

  // Group pipeline logs by agent
  const logsByAgent = useMemo(() => groupLogsByAgent(pipelineLogs), [pipelineLogs])

  // Determine which working steps to show
  const hasAnySteps = (agentSteps && agentSteps.length > 0) || !!pipelineLogs

  // Show analysis plan block after analyzer completes (has plan data)
  const analyzerStatus = resolveStepStatus('analyzer', agentSteps, pipelineLogs, isStreaming)
  const showAnalysisPlan = analysisPlan && analyzerStatus === 'completed'

  // Build response block visibility
  const showResponse = isStreaming
    ? (agentSteps?.find((s) => s.agent === 'analysis')?.status === 'running' ||
        agentSteps?.find((s) => s.agent === 'analysis')?.status === 'completed') &&
      streamingMarkdown.length > 0
    : text.length > 0

  const showFollowUps =
    isLastMessage && !isStreaming && (parsed?.followUpQuestions?.length ?? 0) > 0

  return (
    <div className="flex flex-col items-start gap-1.5">
      <span className="mb-0.5 px-1 text-xs text-muted-foreground">Assistant</span>

      {/* Working step blocks + analysis plan interleaved */}
      {hasAnySteps &&
        AGENTS.map((agent) => {
          const status = resolveStepStatus(agent, agentSteps, pipelineLogs, isStreaming)

          // Hide pending steps
          if (status === 'pending') return null

          const agentLogs = logsByAgent[agent]
          const duration = computeAgentDuration(agentLogs)
          const summary = status === 'completed'
            ? buildSummaryLabel(agent, duration, pipelineLogs)
            : undefined

          return (
            <div key={agent} className="flex w-full flex-col gap-1.5">
              <WorkingStepBlock
                agent={agent}
                status={status}
                label={AGENT_LABELS[agent]}
                summaryLabel={summary}
                logEntries={agentLogs}
                defaultExpanded={status === 'running' || status === 'error'}
              />
              {/* Show analysis plan after the analyzer step completes */}
              {agent === 'analyzer' && showAnalysisPlan && (
                <AnalysisPlanBlock plan={analysisPlan} />
              )}
            </div>
          )
        })}

      {/* Response content block */}
      {showResponse && (
        <ResponseBlock
          isStreaming={isStreaming}
          streamingMarkdown={isStreaming ? streamingMarkdown : undefined}
          parsedAnalysis={parsed ?? undefined}
          showFollowUps={showFollowUps}
          followUpQuestions={parsed?.followUpQuestions ?? []}
          onSuggestedQuestion={onSuggestedQuestion}
        />
      )}
    </div>
  )
}
