/**
 * Agent 2: ClickHouse Agent
 * Executes SQL queries against ClickHouse based on the analysis plan.
 * Uses generateText with tools (non-streaming) — completes before the analysis agent runs.
 */
import { generateText, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { getClickHouseAgentPrompt } from '../system-prompts'
import { getToolsForMode } from '../tools'
import type { ChatMode, QueryResult } from '@/types'
import type { AnalysisPlan, DataQueryResult } from '../types'
import type { PipelineLogCollector } from '../pipeline-log-collector'

export async function executeDataQueries(
  analysisPlan: AnalysisPlan,
  mode: ChatMode,
  schemaContext?: string,
  logs?: PipelineLogCollector,
  onQueryProgress?: () => void
): Promise<DataQueryResult> {
  const tools = getToolsForMode(mode)
  logs?.log('clickhouse', 'info', 'Starting query execution', {
    detail: `Mode: ${mode}, Tools: ${Object.keys(tools).join(', ')}`,
  })
  console.log('[clickhouse-agent] Tools available:', Object.keys(tools))
  console.log('[clickhouse-agent] Analysis plan:', JSON.stringify(analysisPlan, null, 2))

  const result = await generateText({
    model: anthropic('claude-opus-4-20250514'),
    system: getClickHouseAgentPrompt(mode, schemaContext),
    prompt: `Analysis plan:\n${JSON.stringify(analysisPlan, null, 2)}\n\nExecute the necessary queries to answer this question.`,
    tools,
    stopWhen: stepCountIs(5),
  })

  console.log('[clickhouse-agent] Steps completed:', result.steps.length)
  console.log('[clickhouse-agent] Finish reason:', result.finishReason)
  console.log('[clickhouse-agent] Response text:', result.text?.substring(0, 300))

  const results: QueryResult[] = []
  const sqlQueries: string[] = []

  for (const step of result.steps) {
    console.log('[clickhouse-agent] Step - toolCalls:', step.toolCalls?.length ?? 0, 'toolResults:', step.toolResults?.length ?? 0)
    for (const toolResult of step.toolResults) {
      console.log('[clickhouse-agent] Tool result - name:', toolResult.toolName)
      if (toolResult.toolName === 'run_query') {
        const r = toolResult.output as Record<string, unknown>
        console.log('[clickhouse-agent] Query output keys:', Object.keys(r))
        if (r.error) {
          logs?.log('clickhouse', 'error', 'Query error', {
            detail: String(r.error),
          })
          console.error('[clickhouse-agent] Query error:', r.error)
        }
        if (!r.error && Array.isArray(r.columns)) {
          results.push(r as unknown as QueryResult)
          logs?.log('clickhouse', 'success', 'Query returned results', {
            rowCount: (r as unknown as QueryResult).rowCount ?? (r.rows as unknown[])?.length ?? 0,
          })
        }
        if (typeof r.query === 'string') {
          sqlQueries.push(r.query)
          logs?.log('clickhouse', 'info', 'Executed SQL query', {
            detail: r.query,
          })
        }
        // Send progress to client after each query result
        onQueryProgress?.()
      }
    }
  }

  logs?.addQueryCount(sqlQueries.length)

  console.log('[clickhouse-agent] Total results:', results.length, 'Total SQL:', sqlQueries.length)
  return { results, sqlQueries }
}
