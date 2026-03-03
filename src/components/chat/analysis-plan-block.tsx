import { Brain } from 'lucide-react'
import type { AnalysisPlanSummary } from '@/types'

interface AnalysisPlanBlockProps {
  plan: AnalysisPlanSummary
}

export function AnalysisPlanBlock({ plan }: AnalysisPlanBlockProps) {
  return (
    <div className="w-full rounded-2xl bg-muted px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Brain className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Analysis Plan</span>
      </div>
      <p className="mb-2 text-sm leading-relaxed text-foreground/90">
        {plan.suggested_approach}
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {plan.business_context}
      </p>
    </div>
  )
}
