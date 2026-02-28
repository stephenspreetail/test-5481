/**
 * localStorage-based CRUD for conversation persistence.
 * Runs only on the client.
 */
import type { Conversation } from '@/types'

const STORAGE_KEY = 'iss-conversations'

function readAll(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Conversation[]
  } catch {
    return []
  }
}

function writeAll(conversations: Conversation[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
}

/**
 * List all conversations sorted by updatedAt descending.
 */
export function listConversations(): Conversation[] {
  return readAll().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

/**
 * Get a single conversation by ID.
 */
export function getConversation(id: string): Conversation | null {
  return readAll().find((c) => c.id === id) ?? null
}

/**
 * Save (insert or update) a conversation.
 */
export function saveConversation(conv: Conversation): void {
  const all = readAll()
  const idx = all.findIndex((c) => c.id === conv.id)
  if (idx >= 0) {
    all[idx] = conv
  } else {
    all.push(conv)
  }
  writeAll(all)
}

/**
 * Delete a conversation by ID.
 */
export function deleteConversation(id: string): void {
  writeAll(readAll().filter((c) => c.id !== id))
}

/**
 * Generate a unique conversation ID.
 */
export function generateId(): string {
  return crypto.randomUUID()
}
