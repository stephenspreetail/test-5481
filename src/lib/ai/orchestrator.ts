/**
 * Multi-agent orchestrator.
 * Runs 3 agents in sequence: Question Analyzer -> ClickHouse Agent -> Analysis Agent
 * Returns a streaming Response compatible with the AI SDK useChat hook.
 */
import {
  type UIMessage,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai'
import type { ChatMode } from '@/types'
import { analyzeQuestion } from './agents/question-analyzer'
import { executeDataQueries } from './agents/clickhouse-agent'
import { streamAnalysis } from './agents/analysis-agent'
import { loadMetadata } from './metadata-loader'
import { PipelineLogCollector } from './pipeline-log-collector'

export async function runAgentPipeline(params: {
  messages: UIMessage[]
  mode: ChatMode
}): Promise<Response> {
  const { messages, mode } = params

  // Extract the latest user question from messages
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === 'user')
  const question =
    lastUserMessage?.parts
      ?.filter(
        (p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text'
      )
      .map((p) => p.text)
      .join('') ?? ''

  if (!question) {
    return new Response('No question found in messages', { status: 400 })
  }

  // Build conversation context from prior messages for Agent 1
  const modelMessages = await convertToModelMessages(messages)
  const conversationContext =
    modelMessages.length > 1
      ? modelMessages
          .slice(0, -1)
          .map((m) => {
            const content =
              typeof m.content === 'string'
                ? m.content
                : m.content
                    .filter(
                      (p): p is Extract<typeof p, { type: 'text' }> =>
                        p.type === 'text'
                    )
                    .map((p) => p.text)
                    .join('')
            return `${m.role}: ${content}`
          })
          .join('\n')
      : undefined

  // Load schema for metadata mode
  const schemaContext = mode === 'metadata' ? loadMetadata() : undefined

  console.log('[orchestrator] Starting pipeline for question:', question.substring(0, 100))
  console.log('[orchestrator] Mode:', mode)
  console.log('[orchestrator] Schema context loaded:', !!schemaContext)

  // Create UI message stream: run agents 1 & 2, then stream agent 3
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const logs = new PipelineLogCollector()

      try {
        // Agent 1: Analyze the question
        logs.log('orchestrator', 'info', 'Starting question analysis')
        const startAgent1 = Date.now()
        const analysisPlan = await analyzeQuestion(question, conversationContext, logs)
        logs.log('orchestrator', 'success', 'Question analysis complete', {
          durationMs: Date.now() - startAgent1,
          detail: `Intent: ${analysisPlan.intent}`,
        })

        // Send incremental metadata so client sees Agent 1 details immediately
        writer.write({ type: 'message-metadata', messageMetadata: { pipelineLogs: logs.toJSON() } })

        // Agent 2: Execute ClickHouse queries
        logs.log('orchestrator', 'info', 'Starting data queries')
        const startAgent2 = Date.now()
        const { results: queryResults, sqlQueries } = await executeDataQueries(
          analysisPlan,
          mode,
          schemaContext,
          logs
        )
        logs.log('orchestrator', 'success', `Executed ${sqlQueries.length} queries, got ${queryResults.length} results`, {
          durationMs: Date.now() - startAgent2,
        })

        // Agent 3: Stream the analysis response
        logs.log('orchestrator', 'info', 'Starting analysis stream')
        const analysisResult = streamAnalysis(
          question,
          analysisPlan,
          queryResults,
          logs
        )

        // Write message-metadata with pipeline logs before merging the stream
        writer.write({ type: 'message-metadata', messageMetadata: { pipelineLogs: logs.toJSON() } })

        // Merge the analysis agent's UI message stream into the writer
        writer.merge(analysisResult.toUIMessageStream())
      } catch (err) {
        logs.log('orchestrator', 'error', 'Pipeline error', {
          detail: err instanceof Error ? err.message : String(err),
        })
        console.error('[orchestrator] Pipeline error in execute:', err)
        throw err
      }
    },
    onError: (err) => {
      console.error('[orchestrator] Stream error:', err)
      return err instanceof Error ? err.message : 'Stream error'
    },
  })

  console.log('[orchestrator] Returning stream response')
  return createUIMessageStreamResponse({ stream })
}
