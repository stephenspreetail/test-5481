import { MarkdownRenderer } from './markdown-renderer'
import { AnalysisSections } from './analysis-sections'
import { FollowupChips } from './followup-chips'
import type { ParsedAnalysis } from '@/lib/parsers/parse-analysis-response'

interface ResponseBlockProps {
  isStreaming: boolean
  streamingMarkdown?: string
  parsedAnalysis?: ParsedAnalysis
  showFollowUps: boolean
  followUpQuestions: string[]
  onSuggestedQuestion: (question: string) => void
}

export function ResponseBlock({
  isStreaming,
  streamingMarkdown,
  parsedAnalysis,
  showFollowUps,
  followUpQuestions,
  onSuggestedQuestion,
}: ResponseBlockProps) {
  const hasSections =
    parsedAnalysis &&
    (parsedAnalysis.summary || parsedAnalysis.keyFindings || parsedAnalysis.businessInsights)

  return (
    <div className="w-full rounded-2xl bg-muted px-4 py-3 text-sm">
      {isStreaming ? (
        streamingMarkdown ? (
          <MarkdownRenderer content={streamingMarkdown} />
        ) : (
          <div className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-background/50" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-background/50" />
          </div>
        )
      ) : hasSections ? (
        <AnalysisSections analysis={parsedAnalysis} />
      ) : parsedAnalysis?.cleanMarkdown ? (
        <MarkdownRenderer content={parsedAnalysis.cleanMarkdown} />
      ) : null}

      {showFollowUps && followUpQuestions.length > 0 && (
        <FollowupChips
          questions={followUpQuestions}
          onSelect={onSuggestedQuestion}
        />
      )}
    </div>
  )
}
