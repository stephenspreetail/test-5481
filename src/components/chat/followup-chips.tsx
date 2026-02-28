import { Button } from '@spreetail/spreeform'

interface FollowupChipsProps {
  questions: string[]
  onSelect: (question: string) => void
}

export function FollowupChips({ questions, onSelect }: FollowupChipsProps) {
  if (questions.length === 0) return null

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {questions.map((question) => (
        <Button
          key={question}
          variant="outline"
          size="sm"
          className="h-auto whitespace-normal rounded-full px-3 py-1.5 text-left text-xs"
          onClick={() => onSelect(question)}
        >
          {question}
        </Button>
      ))}
    </div>
  )
}
