import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@spreetail/spreeform'
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'

type ChartConfig = Record<string, { label: string; color: string }>

interface LineChartVizProps {
  columns: string[]
  rows: Record<string, unknown>[]
}

const DATE_PATTERNS = /^(date|time|timestamp|created|updated|day|month|year|week|period|dt)/i

function findDateCol(columns: string[]): string | undefined {
  return columns.find((col) => DATE_PATTERNS.test(col))
}

function findNumericCols(columns: string[], row: Record<string, unknown>): string[] {
  return columns.filter((col) => {
    const val = row[col]
    return typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '')
  })
}

export function LineChartViz({ columns, rows }: LineChartVizProps) {
  if (rows.length === 0) return null

  const xCol = findDateCol(columns) ?? columns[0]
  const numericCols = findNumericCols(columns, rows[0]).filter((c) => c !== xCol)

  if (numericCols.length === 0) return null

  const chartConfig: ChartConfig = {}
  numericCols.forEach((col, i) => {
    chartConfig[col] = {
      label: col,
      color: `hsl(var(--chart-${(i % 5) + 1}))`,
    }
  })

  const isSingleSeries = numericCols.length === 1

  if (isSingleSeries) {
    const col = numericCols[0]
    return (
      <ChartContainer config={chartConfig} className="h-[350px] w-full">
        <AreaChart data={rows}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey={xCol}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area
            dataKey={col}
            type="monotone"
            fill={`var(--color-${col})`}
            fillOpacity={0.2}
            stroke={`var(--color-${col})`}
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="h-[350px] w-full">
      <LineChart data={rows}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={xCol}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {numericCols.map((col) => (
          <Line
            key={col}
            dataKey={col}
            type="monotone"
            stroke={`var(--color-${col})`}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  )
}
