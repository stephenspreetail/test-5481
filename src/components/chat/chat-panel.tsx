import type { UIMessage } from 'ai'
import type { AgentStep, ChatMode } from '../../types'
import { ChatHeader } from './chat-header'
import { ChatInput } from './chat-input'
import { ChatMessages } from './chat-messages'

interface ChatPanelProps {
  messages: UIMessage[]
  input: string
  isLoading: boolean
  mode: ChatMode
  agentSteps?: AgentStep[]
  onModeChange: (mode: ChatMode) => void
  onInputChange: (value: string) => void
  onSubmit: () => void
  conversationTitle?: string
  onSuggestedQuestion: (question: string) => void
}

export function ChatPanel({
  messages,
  input,
  isLoading,
  mode,
  agentSteps,
  onModeChange,
  onInputChange,
  onSubmit,
  conversationTitle,
  onSuggestedQuestion,
}: ChatPanelProps) {
  return (
    <div className="flex h-full flex-col bg-background">
      <ChatHeader
        conversationTitle={conversationTitle}
        mode={mode}
        onModeChange={onModeChange}
      />
      <ChatMessages
        messages={messages}
        isStreaming={isLoading}
        agentSteps={agentSteps}
        onSuggestedQuestion={onSuggestedQuestion}
      />
      <ChatInput
        value={input}
        onChange={onInputChange}
        onSubmit={onSubmit}
        isLoading={isLoading}
      />
    </div>
  )
}
