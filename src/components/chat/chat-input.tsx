import { Button, Textarea } from '@spreetail/spreeform'
import { ArrowUp } from 'lucide-react'
import { useCallback, useRef, useEffect } from 'react'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isLoading: boolean
  placeholder?: string
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  placeholder = 'Ask about your seller data...',
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const lineHeight = 24
    const maxHeight = lineHeight * 6
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !isLoading) {
        onSubmit()
      }
    }
  }

  return (
    <div className="border-t border-border p-4">
      <div className="flex items-end gap-2 rounded-xl border border-border bg-background p-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          rows={1}
          className="min-h-0 flex-1 resize-none border-0 bg-transparent p-2 shadow-none focus-visible:ring-0"
        />
        <Button
          size="icon"
          disabled={!value.trim() || isLoading}
          onClick={onSubmit}
          className="h-8 w-8 shrink-0 rounded-lg"
        >
          <ArrowUp size={16} />
        </Button>
      </div>
    </div>
  )
}
