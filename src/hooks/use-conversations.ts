import { useState, useCallback } from 'react'
import type { ChatMode, Conversation } from '@/types'
import {
  listConversations,
  getConversation,
  saveConversation,
  deleteConversation as removeConversation,
  generateId,
} from '@/lib/store/conversations'

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    listConversations()
  )
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null)

  const refresh = useCallback(() => {
    setConversations(listConversations())
  }, [])

  const createConversation = useCallback(
    (mode: ChatMode) => {
      const now = new Date().toISOString()
      const conv: Conversation = {
        id: generateId(),
        title: 'New Conversation',
        createdAt: now,
        updatedAt: now,
        messages: [],
        mode,
      }
      saveConversation(conv)
      setActiveConversationId(conv.id)
      refresh()
      return conv
    },
    [refresh]
  )

  const loadConversation = useCallback((id: string) => {
    const conv = getConversation(id)
    if (conv) {
      setActiveConversationId(id)
    }
    return conv
  }, [])

  const saveCurrentConversation = useCallback(
    (messages: unknown[]) => {
      if (!activeConversationId) return
      const conv = getConversation(activeConversationId)
      if (!conv) return

      const title =
        messages.length > 0
          ? extractTitle(messages[0])
          : conv.title

      saveConversation({
        ...conv,
        messages,
        title,
        updatedAt: new Date().toISOString(),
      })
      refresh()
    },
    [activeConversationId, refresh]
  )

  const deleteConv = useCallback(
    (id: string) => {
      removeConversation(id)
      if (activeConversationId === id) {
        setActiveConversationId(null)
      }
      refresh()
    },
    [activeConversationId, refresh]
  )

  return {
    conversations,
    activeConversationId,
    createConversation,
    loadConversation,
    saveCurrentConversation,
    deleteConversation: deleteConv,
  }
}

function extractTitle(firstMessage: unknown): string {
  if (
    typeof firstMessage === 'object' &&
    firstMessage !== null &&
    'content' in firstMessage
  ) {
    const content = (firstMessage as { content: unknown }).content
    if (typeof content === 'string') {
      return content.length > 50 ? content.slice(0, 50) + '...' : content
    }
  }
  return 'New Conversation'
}
