import { Card } from '@spreetail/spreeform'
import { Target, Lightbulb } from 'lucide-react'
import { MarkdownRenderer } from './markdown-renderer'
import type { ParsedAnalysis } from '@/lib/parsers/parse-analysis-response'

interface AnalysisSectionsProps {
  analysis: ParsedAnalysis
}

export function AnalysisSections({ analysis }: AnalysisSectionsProps) {
  const { summary, keyFindings, businessInsights } = analysis
  const hasSections = summary || keyFindings || businessInsights

  if (!hasSections) {
    // No structured sections found — render the full clean markdown as-is
    if (analysis.cleanMarkdown) {
      return <MarkdownRenderer content={analysis.cleanMarkdown} />
    }
    return null
  }

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      {summary && (
        <Card className="gap-0 border-l-4 border-l-primary/60 py-0">
          <div className="px-4 py-3">
            <MarkdownRenderer content={summary} />
          </div>
        </Card>
      )}

      {/* Key Findings */}
      {keyFindings && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <Target className="h-4 w-4 text-orange-400" />
            <span className="text-sm font-semibold text-foreground">Key Findings</span>
          </div>
          <MarkdownRenderer content={keyFindings} />
        </div>
      )}

      {/* Business Insights */}
      {businessInsights && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <Lightbulb className="h-4 w-4 text-yellow-400" />
            <span className="text-sm font-semibold text-foreground">Business Insights</span>
          </div>
          <MarkdownRenderer content={businessInsights} />
        </div>
      )}
    </div>
  )
}
