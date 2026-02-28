import type { AgentStep, PipelineLogs, PipelineLogEntry } from '@/types'

export const AGENT_LABELS: Record<AgentStep['agent'], string> = {
  analyzer: 'Analyzing question',
  clickhouse: 'Querying data',
  analysis: 'Preparing analysis',
}

export function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`
  }
  return `${Math.round(ms)}ms`
}

export function isSql(text: string): boolean {
  const trimmed = text.trimStart().toUpperCase()
  return (
    trimmed.startsWith('SELECT') ||
    trimmed.startsWith('WITH') ||
    trimmed.startsWith('SHOW') ||
    trimmed.includes('FROM')
  )
}

/**
 * Group pipeline log entries by agent, skipping orchestrator.
 * Preserves insertion order.
 */
export function groupLogsByAgent(
  logs?: PipelineLogs
): Record<string, PipelineLogEntry[]> {
  const grouped: Record<string, PipelineLogEntry[]> = {}
  if (!logs) return grouped
  for (const entry of logs.entries) {
    if (entry.agent === 'orchestrator') continue
    if (!grouped[entry.agent]) {
      grouped[entry.agent] = []
    }
    grouped[entry.agent].push(entry)
  }
  return grouped
}

/**
 * Sum durationMs across a set of log entries for one agent.
 */
export function computeAgentDuration(
  entries?: PipelineLogEntry[]
): number | null {
  if (!entries || entries.length === 0) return null
  const total = entries.reduce((sum, e) => sum + (e.durationMs ?? 0), 0)
  return total > 0 ? total : null
}

/**
 * Build a compact summary label for a completed working step.
 * e.g., "3 queries, 2.1s" for clickhouse.
 */
export function buildSummaryLabel(
  agent: AgentStep['agent'],
  durationMs?: number | null,
  logs?: PipelineLogs
): string | undefined {
  if (agent === 'clickhouse' && logs) {
    const queryCount = logs.queryCount
    const parts: string[] = []
    if (queryCount > 0) {
      parts.push(`${queryCount} ${queryCount === 1 ? 'query' : 'queries'}`)
    }
    if (durationMs != null) {
      parts.push(formatDuration(durationMs))
    }
    return parts.length > 0 ? parts.join(', ') : undefined
  }

  if (durationMs != null) {
    return formatDuration(durationMs)
  }

  return undefined
}
