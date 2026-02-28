import type { ArtifactData } from '@/types'
import { suggestVisualization } from '@/lib/viz/data-analyzer'
import { Badge } from '@spreetail/spreeform'
import { DataTable } from './data-table'
import { BarChartViz } from './bar-chart-viz'
import { LineChartViz } from './line-chart-viz'
import { MetricCard } from './metric-card'

interface DataVisualizationProps {
  data: ArtifactData
}

export function DataVisualization({ data }: DataVisualizationProps) {
  const { columns, rows, executionTimeMs } = data.result
  const vizType = data.vizHint ?? suggestVisualization(columns, rows)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <Badge variant="secondary">Completed in {executionTimeMs}ms</Badge>
      </div>
      <VizRenderer vizType={vizType} columns={columns} rows={rows} />
    </div>
  )
}

function VizRenderer({
  vizType,
  columns,
  rows,
}: {
  vizType: string
  columns: string[]
  rows: Record<string, unknown>[]
}) {
  switch (vizType) {
    case 'metric-card':
      return <MetricCard columns={columns} rows={rows} />
    case 'bar-chart':
      return <BarChartViz columns={columns} rows={rows} />
    case 'line-chart':
      return <LineChartViz columns={columns} rows={rows} />
    case 'table':
    default:
      return <DataTable columns={columns} rows={rows} />
  }
}
