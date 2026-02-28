import type { ChatMode } from '../../types'
import { ModeSelector } from './mode-selector'

interface ChatHeaderProps {
  conversationTitle?: string
  mode: ChatMode
  onModeChange: (mode: ChatMode) => void
}

export function ChatHeader({
  conversationTitle,
  mode,
  onModeChange,
}: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <h2 className="text-sm font-semibold text-foreground truncate">
        {conversationTitle || 'New Chat'}
      </h2>
      <ModeSelector mode={mode} onModeChange={onModeChange} />
    </div>
  )
}
