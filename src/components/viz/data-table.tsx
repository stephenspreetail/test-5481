import {
  ScrollArea,
  ScrollBar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@spreetail/spreeform'
import { formatCellValue } from '@/lib/viz/formatters'

interface DataTableProps {
  columns: string[]
  rows: Record<string, unknown>[]
}

export function DataTable({ columns, rows }: DataTableProps) {
  return (
    <div className="flex flex-col gap-2">
      <ScrollArea className="w-full">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col} className="text-sm whitespace-nowrap">
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i} className="even:bg-muted/30">
                {columns.map((col) => (
                  <TableCell
                    key={col}
                    className="py-2 text-sm whitespace-nowrap"
                  >
                    {formatCellValue(row[col], col)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <p className="text-xs text-muted-foreground">
        Showing {rows.length} rows
      </p>
    </div>
  )
}
