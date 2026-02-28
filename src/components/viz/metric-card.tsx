import { Card, CardContent, CardHeader, CardTitle } from '@spreetail/spreeform'
import { formatCellValue } from '@/lib/viz/formatters'

interface MetricCardProps {
  columns: string[]
  rows: Record<string, unknown>[]
}

export function MetricCard({ columns, rows }: MetricCardProps) {
  if (rows.length === 0) return null

  const row = rows[0]

  return (
    <div className="flex flex-wrap gap-4">
      {columns.map((col) => (
        <Card key={col} className="min-w-[180px] flex-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              {col}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCellValue(row[col], col)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
