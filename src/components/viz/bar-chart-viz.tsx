import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@spreetail/spreeform'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

type ChartConfig = Record<string, { label: string; color: string }>

interface BarChartVizProps {
  columns: string[]
  rows: Record<string, unknown>[]
}

function findFirstStringCol(columns: string[], row: Record<string, unknown>): string | undefined {
  return columns.find((col) => typeof row[col] === 'string' && isNaN(Number(row[col])))
}

function findNumericCols(columns: string[], row: Record<string, unknown>): string[] {
  return columns.filter((col) => {
    const val = row[col]
    return typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '')
  })
}

export function BarChartViz({ columns, rows }: BarChartVizProps) {
  if (rows.length === 0) return null

  const data = rows.slice(0, 20)
  const firstRow = data[0]
  const xCol = findFirstStringCol(columns, firstRow) ?? columns[0]
  const numericCols = findNumericCols(columns, firstRow).filter((c) => c !== xCol)

  if (numericCols.length === 0) return null

  const chartConfig: ChartConfig = {}
  numericCols.forEach((col, i) => {
    chartConfig[col] = {
      label: col,
      color: `hsl(var(--chart-${(i % 5) + 1}))`,
    }
  })

  return (
    <ChartContainer config={chartConfig} className="h-[350px] w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={xCol}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value) =>
            String(value).length > 15 ? `${String(value).slice(0, 15)}...` : String(value)
          }
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {numericCols.map((col) => (
          <Bar
            key={col}
            dataKey={col}
            fill={`var(--color-${col})`}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}
