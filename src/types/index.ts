export type ChatMode = 'metadata' | 'discovery'

export type PipelineLogLevel = 'info' | 'success' | 'error'
export type PipelineLogAgent = 'orchestrator' | 'analyzer' | 'clickhouse' | 'analysis'

export interface PipelineLogEntry {
  timestamp: number
  agent: PipelineLogAgent
  level: PipelineLogLevel
  message: string
  detail?: string
  durationMs?: number
  rowCount?: number
}

export interface PipelineLogs {
  entries: PipelineLogEntry[]
  totalDurationMs: number
  queryCount: number
  hasErrors: boolean
}

export interface AnalysisPlanSummary {
  intent: string
  suggested_approach: string
  business_context: string
  relevant_tables: string[]
}

export interface MessageMetadata {
  pipelineLogs?: PipelineLogs
  analysisPlan?: AnalysisPlanSummary
}

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  query: string
  executionTimeMs: number
}

export interface AgentStep {
  agent: 'analyzer' | 'clickhouse' | 'analysis'
  status: 'pending' | 'running' | 'completed' | 'error'
  message?: string
}

export interface ArtifactData {
  type: 'query-result'
  title: string
  result: QueryResult
  vizHint?: 'table' | 'bar-chart' | 'line-chart' | 'metric-card'
}

export type { ParsedAnalysis } from '@/lib/parsers/parse-analysis-response'

export interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: unknown[] // UIMessage from ai sdk
  mode: ChatMode
}
