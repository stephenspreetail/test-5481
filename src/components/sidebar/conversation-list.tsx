import type { Conversation } from '../../types'
import { ConversationItem } from './conversation-item'

interface ConversationListProps {
  conversations: Conversation[]
  activeId: string | null
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
}

export function ConversationList({
  conversations,
  activeId,
  onSelectConversation,
  onDeleteConversation,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-sm text-muted-foreground">
        No conversations yet
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {conversations.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          id={conversation.id}
          title={conversation.title}
          updatedAt={conversation.updatedAt}
          isActive={conversation.id === activeId}
          onSelect={onSelectConversation}
          onDelete={onDeleteConversation}
        />
      ))}
    </div>
  )
}
