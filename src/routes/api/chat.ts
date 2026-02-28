/**
 * API route for the chat endpoint.
 * Receives POST requests with chat messages and streams back the agent pipeline response.
 *
 * Note: The route path type will resolve once the TanStack Router codegen
 * picks up this file (happens automatically on `vite dev` or `vite build`).
 */
import { createFileRoute } from '@tanstack/react-router'
import { runAgentPipeline } from '@/lib/ai/orchestrator'
import type { ChatMode } from '@/types'
import type { UIMessage } from 'ai'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        console.log('[api/chat] POST received')
        const body = await request.json()
        const { messages, mode = 'metadata' } = body as {
          messages: UIMessage[]
          mode?: ChatMode
        }
        console.log('[api/chat] mode=%s, messages=%d', mode, messages?.length ?? 0)

        try {
          const response = await runAgentPipeline({ messages, mode })
          console.log('[api/chat] Pipeline returned response, status=%d', response.status)
          return response
        } catch (err) {
          console.error('[api/chat] Pipeline error:', err)
          return new Response(
            JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      },
    },
  },
})
