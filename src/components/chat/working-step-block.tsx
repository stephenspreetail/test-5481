import { useState, useEffect, useRef } from 'react'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Badge,
} from '@spreetail/spreeform'
import {
  Check,
  Loader2,
  AlertCircle,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import { LogEntryRow } from './log-entry-row'
import type { AgentStep, PipelineLogEntry } from '@/types'

interface WorkingStepBlockProps {
  agent: AgentStep['agent']
  status: 'pending' | 'running' | 'completed' | 'error'
  label: string
  summaryLabel?: string
  logEntries?: PipelineLogEntry[]
  defaultExpanded: boolean
}

function StepIcon({ status }: { status: AgentStep['status'] }) {
  switch (status) {
    case 'completed':
      return <Check size={14} className="text-green-400" />
    case 'running':
      return <Loader2 size={14} className="animate-spin text-primary" />
    case 'error':
      return <AlertCircle size={14} className="text-destructive" />
    default:
      return <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30" />
  }
}

export function WorkingStepBlock({
  agent,
  status,
  label,
  summaryLabel,
  logEntries,
  defaultExpanded,
}: WorkingStepBlockProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded)
  const prevStatusRef = useRef(status)

  // Auto-collapse when transitioning from running → completed
  useEffect(() => {
    if (prevStatusRef.current === 'running' && status === 'completed') {
      setIsOpen(false)
    }
    prevStatusRef.current = status
  }, [status])

  const hasLogs = logEntries && logEntries.length > 0

  const textClass =
    status === 'completed'
      ? 'text-muted-foreground'
      : status === 'running'
        ? 'text-foreground'
        : status === 'error'
          ? 'text-destructive'
          : 'text-muted-foreground/50'

  const header = (
    <div className="flex items-center gap-2">
      <StepIcon status={status} />
      <span className={`text-sm font-medium ${textClass}`}>{label}</span>
      {status === 'completed' && summaryLabel && (
        <Badge variant="secondary" className="px-1.5 py-0 text-xs">
          {summaryLabel}
        </Badge>
      )}
      {status === 'running' && (
        <span className="text-xs text-muted-foreground">In progress...</span>
      )}
    </div>
  )

  // Non-expandable: compact line when no log entries
  if (!hasLogs) {
    return (
      <div className="w-full rounded-lg bg-muted/50 px-3 py-1.5">
        {header}
      </div>
    )
  }

  // Expandable: Collapsible with log entries
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="w-full rounded-lg bg-muted/50 px-3 py-1.5">
        <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between transition-colors hover:text-foreground">
          {header}
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-1.5 border-l border-border/50 pl-3">
            {logEntries.map((entry, i) => (
              <LogEntryRow key={`${agent}-${i}`} entry={entry} />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
