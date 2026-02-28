import { useState, type ReactNode } from 'react'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@spreetail/spreeform'
import {
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Brain,
  Database,
  BarChart3,
} from 'lucide-react'
import { LogEntryRow } from './log-entry-row'
import type { PipelineLogs as PipelineLogsType, PipelineLogEntry } from '@/types'

const AGENT_CONFIG: Record<
  string,
  { label: string; icon: ReactNode | null }
> = {
  orchestrator: { label: 'Orchestrator', icon: null },
  analyzer: { label: 'Question Analyzer', icon: <Brain className="h-3 w-3" /> },
  clickhouse: { label: 'Data Queries', icon: <Database className="h-3 w-3" /> },
  analysis: { label: 'Analysis', icon: <BarChart3 className="h-3 w-3" /> },
}

function PipelineLogGroup({
  agent,
  entries,
  label,
  icon,
}: {
  agent: string
  entries: PipelineLogEntry[]
  label: string
  icon: ReactNode
}) {
  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <div className="ml-2 border-l border-border pl-3 space-y-1 mt-1">
        {entries.map((entry, i) => (
          <LogEntryRow key={`${agent}-${i}`} entry={entry} />
        ))}
      </div>
    </div>
  )
}

export function PipelineLogs({ logs }: { logs: PipelineLogsType }) {
  const [isOpen, setIsOpen] = useState(false)

  const summaryText = logs.hasErrors
    ? `Pipeline completed with errors in ${(logs.totalDurationMs / 1000).toFixed(1)}s — ${logs.entries.length} steps, ${logs.queryCount} ${logs.queryCount === 1 ? 'query' : 'queries'}`
    : `Pipeline completed in ${(logs.totalDurationMs / 1000).toFixed(1)}s — ${logs.entries.length} steps, ${logs.queryCount} ${logs.queryCount === 1 ? 'query' : 'queries'}`

  // Group entries by agent, preserving order of first appearance
  const agentOrder: string[] = []
  const grouped: Record<string, PipelineLogEntry[]> = {}
  for (const entry of logs.entries) {
    if (!grouped[entry.agent]) {
      grouped[entry.agent] = []
      agentOrder.push(entry.agent)
    }
    grouped[entry.agent].push(entry)
  }

  return (
    <div className="border-t border-border bg-background/95 backdrop-blur-sm px-4 py-2">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
          {isOpen ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {logs.hasErrors ? (
            <AlertCircle className="h-3 w-3 text-red-500" />
          ) : (
            <CheckCircle2 className="h-3 w-3 text-green-500" />
          )}
          <span>{summaryText}</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="max-h-72 overflow-y-auto">
          {agentOrder
            .filter((agent) => agent !== 'orchestrator')
            .map((agent) => {
              const config = AGENT_CONFIG[agent] ?? {
                label: agent,
                icon: null,
              }
              return (
                <PipelineLogGroup
                  key={agent}
                  agent={agent}
                  entries={grouped[agent]}
                  label={config.label}
                  icon={config.icon}
                />
              )
            })}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
