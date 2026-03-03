/**
 * Multi-agent orchestrator.
 * Runs 3 agents in sequence: Question Analyzer -> ClickHouse Agent -> Analysis Agent
 * Returns a streaming Response compatible with the AI SDK useChat hook.
 *
 * Sends incremental message-metadata chunks as each agent completes and after
 * each query, so the client sees real-time progress. Uses manual text chunk
 * writes (not writer.merge) to keep everything on a single message.
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

  // Create UI message stream with manual chunk writing (no writer.merge)
  // to keep all metadata + text on a single assistant message.
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const logs = new PipelineLogCollector()
      let analysisPlanData: Record<string, unknown> | undefined

      // Helper: send current pipeline state to client
      const sendMetadata = () => {
        const metadata: Record<string, unknown> = { pipelineLogs: logs.toJSON() }
        if (analysisPlanData) {
          metadata.analysisPlan = analysisPlanData
        }
        writer.write({ type: 'message-metadata', messageMetadata: metadata })
      }

      try {
        // Agent 1: Analyze the question
        logs.log('orchestrator', 'info', 'Starting question analysis')
        const startAgent1 = Date.now()
        const analysisPlan = await analyzeQuestion(question, conversationContext, logs)
        logs.log('orchestrator', 'success', 'Question analysis complete', {
          durationMs: Date.now() - startAgent1,
          detail: `Intent: ${analysisPlan.intent}`,
        })

        analysisPlanData = {
          intent: analysisPlan.intent,
          suggested_approach: analysisPlan.suggested_approach,
          business_context: analysisPlan.business_context,
          relevant_tables: analysisPlan.relevant_tables,
        }

        // Send metadata: client now sees analyzer completed with details
        sendMetadata()

        // Agent 2: Execute ClickHouse queries (with per-query progress)
        logs.log('orchestrator', 'info', 'Starting data queries')
        const startAgent2 = Date.now()
        const { results: queryResults, sqlQueries } = await executeDataQueries(
          analysisPlan,
          mode,
          schemaContext,
          logs,
          sendMetadata // callback: sends metadata after each query
        )
        logs.log('orchestrator', 'success', `Executed ${sqlQueries.length} queries, got ${queryResults.length} results`, {
          durationMs: Date.now() - startAgent2,
        })

        // Send metadata: client now sees clickhouse completed with all query details
        sendMetadata()

        // Agent 3: Stream the analysis response
        logs.log('orchestrator', 'info', 'Starting analysis stream')
        sendMetadata()

        const analysisResult = streamAnalysis(
          question,
          analysisPlan,
          queryResults,
          logs
        )

        // Manually stream text chunks (instead of writer.merge) to stay on same message
        const textId = 'analysis-text'
        writer.write({ type: 'text-start', id: textId })
        for await (const delta of analysisResult.textStream) {
          writer.write({ type: 'text-delta', id: textId, delta })
        }
        writer.write({ type: 'text-end', id: textId })
        writer.write({ type: 'finish' })
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
