import { ScrollArea } from '@spreetail/spreeform'
import { useEffect, useRef } from 'react'
import type { UIMessage } from 'ai'
import type { AgentStep } from '../../types'
import { AGENT_LABELS } from '@/lib/utils/pipeline-display'
import { AssistantMessageBlocks } from './assistant-message-blocks'
import { WorkingStepBlock } from './working-step-block'
import { MessageBubble } from './message-bubble'
import { SuggestedQuestions } from './suggested-questions'

interface ChatMessagesProps {
  messages: UIMessage[]
  isStreaming: boolean
  agentSteps?: AgentStep[]
  onSuggestedQuestion: (question: string) => void
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

export function ChatMessages({
  messages,
  isStreaming,
  agentSteps,
  onSuggestedQuestion,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming, agentSteps])

  if (messages.length === 0) {
    return <SuggestedQuestions onSelectQuestion={onSuggestedQuestion} />
  }

  const filteredMessages = messages.filter(
    (m): m is UIMessage & { role: 'user' | 'assistant' } =>
      m.role === 'user' || m.role === 'assistant'
  )

  // During streaming, check if the last message is already an assistant message.
  // If not, we need standalone working step blocks.
  const lastMessage = filteredMessages[filteredMessages.length - 1]
  const hasStreamingAssistant = isStreaming && lastMessage?.role === 'assistant'
  const needsStandaloneSteps =
    isStreaming && !hasStreamingAssistant && agentSteps && agentSteps.length > 0

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-4 p-4">
        {filteredMessages.map((message, index) => {
          if (message.role === 'user') {
            return (
              <MessageBubble key={message.id} role="user">
                {getMessageText(message)}
              </MessageBubble>
            )
          }

          const isLast = index === filteredMessages.length - 1
          const isThisStreaming = isLast && isStreaming

          return (
            <AssistantMessageBlocks
              key={message.id}
              message={message}
              agentSteps={isThisStreaming ? agentSteps : undefined}
              isStreaming={isThisStreaming}
              isLastMessage={isLast}
              onSuggestedQuestion={onSuggestedQuestion}
            />
          )
        })}

        {/* Standalone working steps before assistant message appears (submitted phase) */}
        {needsStandaloneSteps && (
          <div className="flex flex-col items-start gap-1">
            <span className="mb-1 px-1 text-xs text-muted-foreground">Assistant</span>
            {agentSteps
              .filter((s) => s.status !== 'pending')
              .map((step) => (
                <WorkingStepBlock
                  key={step.agent}
                  agent={step.agent}
                  status={step.status}
                  label={AGENT_LABELS[step.agent]}
                  defaultExpanded={step.status === 'running'}
                />
              ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
