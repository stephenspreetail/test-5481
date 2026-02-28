import { Button, ScrollArea } from '@spreetail/spreeform'
import { Database, Plus } from 'lucide-react'
import type { Conversation } from '../../types'
import { ConversationList } from './conversation-list'

interface ChatSidebarProps {
  conversations: Conversation[]
  activeId: string | null
  onNewChat: () => void
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
}

export function ChatSidebar({
  conversations,
  activeId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
}: ChatSidebarProps) {
  return (
    <div className="flex h-full flex-col border-r border-border bg-background">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <Database size={20} className="text-primary" />
          <div>
            <h1 className="text-lg font-bold leading-tight text-foreground">
              ISS
            </h1>
            <p className="text-xs text-muted-foreground">
              Seller Intelligence
            </p>
          </div>
        </div>
        <Button variant="outline" className="w-full justify-start gap-2" onClick={onNewChat}>
          <Plus size={16} />
          New Chat
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelectConversation={onSelectConversation}
          onDeleteConversation={onDeleteConversation}
        />
      </ScrollArea>
    </div>
  )
}
