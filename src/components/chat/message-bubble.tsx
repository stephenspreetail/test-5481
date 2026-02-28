interface MessageBubbleProps {
  role: 'user' | 'assistant'
  children: React.ReactNode
}

export function MessageBubble({ role, children }: MessageBubbleProps) {
  const isUser = role === 'user'

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <span className="mb-1 px-1 text-xs text-muted-foreground">
        {isUser ? 'You' : 'Assistant'}
      </span>
      <div
        className={`rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? 'max-w-[80%] bg-primary text-primary-foreground'
            : 'w-full bg-muted text-foreground'
        }`}
      >
        {children}
      </div>
    </div>
  )
}
