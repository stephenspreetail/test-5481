/**
 * Agent 3: Analysis Agent
 * Interprets query results and streams a response with insights and an artifact block.
 * Uses streamText — this is the agent whose output is streamed to the client.
 */
import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { getAnalysisAgentPrompt } from '../system-prompts'
import type { QueryResult } from '@/types'
import type { AnalysisPlan } from '../types'
import type { PipelineLogCollector } from '../pipeline-log-collector'

export function streamAnalysis(
  question: string,
  analysisPlan: AnalysisPlan,
  queryResults: QueryResult[],
  logs?: PipelineLogCollector
): ReturnType<typeof streamText> {
  const prompt = `Original question: ${question}\n\nAnalysis plan:\n${JSON.stringify(analysisPlan)}\n\nQuery results:\n${JSON.stringify(queryResults)}`
  logs?.log('analysis', 'info', 'Starting analysis stream', {
    detail: `Prompt length: ${prompt.length}, Results: ${queryResults.length}`,
  })
  console.log('[analysis-agent] Starting streamText, prompt length:', prompt.length)
  console.log('[analysis-agent] Query results count:', queryResults.length)
  return streamText({
    model: anthropic('claude-opus-4-20250514'),
    system: getAnalysisAgentPrompt(),
    prompt,
    onFinish: ({ text }) => {
      console.log('[analysis-agent] Stream finished, text length:', text?.length ?? 0)
      console.log('[analysis-agent] Response preview:', text?.substring(0, 300))
    },
  })
}
