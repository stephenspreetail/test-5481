import { useState } from 'react'
import { ScrollArea, ScrollBar, Button } from '@spreetail/spreeform'
import { Copy, Check } from 'lucide-react'

interface SqlDisplayProps {
  query: string
}

const SQL_KEYWORDS =
  /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|GROUP\s+BY|ORDER\s+BY|LIMIT|AS|ON|AND|OR|HAVING|FINAL|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|INTO|VALUES|SET|WITH|UNION|ALL|DISTINCT|CASE|WHEN|THEN|ELSE|END|IN|NOT|NULL|IS|BETWEEN|LIKE|EXISTS|COUNT|SUM|AVG|MIN|MAX|COALESCE|CAST|IF|USING|ASC|DESC)\b/gi

function highlightSQL(sql: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let key = 0

  const regex = new RegExp(SQL_KEYWORDS.source, 'gi')
  let match: RegExpExecArray | null

  while ((match = regex.exec(sql)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++}>{sql.slice(lastIndex, match.index)}</span>
      )
    }
    parts.push(
      <span key={key++} className="text-blue-400 font-semibold">
        {match[0]}
      </span>
    )
    lastIndex = regex.lastIndex
  }

  if (lastIndex < sql.length) {
    parts.push(<span key={key++}>{sql.slice(lastIndex)}</span>)
  }

  return parts
}

export function SqlDisplay({ query }: SqlDisplayProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(query)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative rounded-md bg-muted/50">
      <div className="absolute top-2 right-2 z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopy}
          className="h-8 w-8"
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
      <ScrollArea className="w-full">
        <pre className="p-4 pr-12 font-mono text-sm leading-relaxed whitespace-pre-wrap">
          <code>{highlightSQL(query)}</code>
        </pre>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}
