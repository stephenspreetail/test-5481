import { Button } from '@spreetail/spreeform'
import { MessageSquare } from 'lucide-react'

interface SuggestedQuestionsProps {
  onSelectQuestion: (question: string) => void
}

const questions = [
  'Top 10 sellers by Buy Box win rate',
  'Brands with the most products competing with Amazon',
  'Seller rating distribution over 30/90/365 days',
  'Products with highest monthly sales volume',
  'Sellers shipping from China with FBA usage',
  'Price trends for top-selling products',
]

export function SuggestedQuestions({
  onSelectQuestion,
}: SuggestedQuestionsProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <MessageSquare size={32} className="text-muted-foreground" />
        <h3 className="text-lg font-semibold text-foreground">
          What would you like to know?
        </h3>
        <p className="text-sm text-muted-foreground">
          Ask questions about your seller data or try one of these
        </p>
      </div>
      <div className="grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {questions.map((question) => (
          <Button
            key={question}
            variant="outline"
            size="sm"
            className="h-auto whitespace-normal rounded-full px-4 py-2 text-left text-xs"
            onClick={() => onSelectQuestion(question)}
          >
            {question}
          </Button>
        ))}
      </div>
    </div>
  )
}
