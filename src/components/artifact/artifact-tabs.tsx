import { Tabs, TabsContent, TabsList, TabsTrigger } from '@spreetail/spreeform'
import { Table2, BarChart3, Code2 } from 'lucide-react'
import type { ArtifactData } from '@/types'
import { DataTable } from '../viz/data-table'
import { DataVisualization } from '../viz/data-visualization'
import { SqlDisplay } from '../viz/sql-display'

interface ArtifactTabsProps {
  data: ArtifactData
  activeTab: string
  onTabChange: (tab: string) => void
}

export function ArtifactTabs({ data, activeTab, onTabChange }: ArtifactTabsProps) {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="flex flex-1 flex-col">
      <div className="border-b px-4">
        <TabsList>
          <TabsTrigger value="table">
            <Table2 className="mr-1.5 h-3.5 w-3.5" />
            Table
          </TabsTrigger>
          <TabsTrigger value="chart">
            <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
            Chart
          </TabsTrigger>
          <TabsTrigger value="sql">
            <Code2 className="mr-1.5 h-3.5 w-3.5" />
            SQL
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <TabsContent value="table" className="mt-0">
          <DataTable columns={data.result.columns} rows={data.result.rows} />
        </TabsContent>
        <TabsContent value="chart" className="mt-0">
          <DataVisualization data={data} />
        </TabsContent>
        <TabsContent value="sql" className="mt-0">
          <SqlDisplay query={data.result.query} />
        </TabsContent>
      </div>
    </Tabs>
  )
}
