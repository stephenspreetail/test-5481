import { useState } from 'react'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Badge,
} from '@spreetail/spreeform'
import { ChevronRight, ChevronDown, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { SqlDisplay } from '@/components/viz/sql-display'
import { formatDuration, isSql } from '@/lib/utils/pipeline-display'
import type { PipelineLogEntry } from '@/types'

export function LogEntryRow({ entry }: { entry: PipelineLogEntry }) {
  const [detailOpen, setDetailOpen] = useState(false)
  const hasDetail = !!entry.detail

  const levelIcon =
    entry.level === 'success' ? (
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
    ) : entry.level === 'error' ? (
      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
    ) : (
      <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    )

  if (!hasDetail) {
    return (
      <div className="flex items-center gap-2">
        {levelIcon}
        <span className="text-sm">{entry.message}</span>
        {entry.durationMs != null && (
          <Badge variant="secondary" className="px-1.5 py-0 text-xs">
            {formatDuration(entry.durationMs)}
          </Badge>
        )}
      </div>
    )
  }

  return (
    <Collapsible open={detailOpen} onOpenChange={setDetailOpen}>
      <CollapsibleTrigger className="flex cursor-pointer items-center gap-2 transition-colors hover:text-foreground">
        {levelIcon}
        {detailOpen ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm">{entry.message}</span>
        {entry.durationMs != null && (
          <Badge variant="secondary" className="px-1.5 py-0 text-xs">
            {formatDuration(entry.durationMs)}
          </Badge>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {entry.detail && isSql(entry.detail) ? (
          <div className="ml-6 mt-1">
            <SqlDisplay query={entry.detail} />
          </div>
        ) : (
          <pre className="ml-6 mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
            {entry.detail}
          </pre>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
