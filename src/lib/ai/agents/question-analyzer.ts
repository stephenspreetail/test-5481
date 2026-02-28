/**
 * Agent 1: Question Analyzer
 * Analyzes the user's question and produces a structured analysis plan.
 * Uses generateText (non-streaming) since this completes before the next agent runs.
 */
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { getQuestionAnalyzerPrompt } from '../system-prompts'
import type { AnalysisPlan } from '../types'
import type { PipelineLogCollector } from '../pipeline-log-collector'

export async function analyzeQuestion(
  question: string,
  conversationContext?: string,
  logs?: PipelineLogCollector
): Promise<AnalysisPlan> {
  const prompt = conversationContext
    ? `Question: ${question}\n\nConversation context:\n${conversationContext}`
    : `Question: ${question}`

  logs?.log('analyzer', 'info', 'Calling generateText')
  console.log('[question-analyzer] Calling generateText with prompt:', prompt.substring(0, 200))
  const result = await generateText({
    model: anthropic('claude-opus-4-20250514'),
    system: getQuestionAnalyzerPrompt(),
    prompt,
  })
  // Strip markdown code fences if present (LLM often wraps JSON in ```json ... ```)
  let text = result.text.trim()
  const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
  if (fenceMatch) {
    text = fenceMatch[1].trim()
  }

  console.log('[question-analyzer] Raw response (first 500 chars):', result.text.substring(0, 500))
  console.log('[question-analyzer] Cleaned text (first 300 chars):', text.substring(0, 300))

  try {
    const plan = JSON.parse(text) as AnalysisPlan
    logs?.log('analyzer', 'success', 'Analysis complete', {
      detail: `Intent: ${plan.intent}, Tables: ${plan.relevant_tables?.join(', ') ?? 'none'}`,
    })
    return plan
  } catch (err) {
    logs?.log('analyzer', 'error', 'Failed to parse response as JSON', {
      detail: text.substring(0, 200),
    })
    console.error('[question-analyzer] Failed to parse response as JSON:', err)
    console.error('[question-analyzer] Full cleaned text:', text)
    throw new Error(`Question analyzer returned invalid JSON: ${text.substring(0, 200)}`)
  }
}
