export type VizType = 'table' | 'bar-chart' | 'line-chart' | 'metric-card'

const DATE_PATTERNS = /^(date|time|timestamp|created|updated|day|month|year|week|period|dt)/i

function isDateColumn(col: string): boolean {
  return DATE_PATTERNS.test(col)
}

function isNumericValue(value: unknown): boolean {
  if (typeof value === 'number') return true
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed !== '' && !isNaN(Number(trimmed))
  }
  return false
}

function hasNumericColumn(columns: string[], row: Record<string, unknown>): boolean {
  return columns.some((col) => isNumericValue(row[col]))
}

function hasStringColumn(columns: string[], row: Record<string, unknown>): boolean {
  return columns.some(
    (col) => typeof row[col] === 'string' && !isNumericValue(row[col])
  )
}

export function suggestVisualization(
  columns: string[],
  rows: Record<string, unknown>[]
): VizType {
  if (rows.length === 0) return 'table'

  if (rows.length === 1 && columns.length <= 3) return 'metric-card'

  const firstRow = rows[0]

  const hasDate = columns.some((col) => isDateColumn(col))
  const hasNumeric = hasNumericColumn(columns, firstRow)

  if (hasDate && hasNumeric && rows.length > 2) return 'line-chart'

  if (hasStringColumn(columns, firstRow) && hasNumeric && rows.length <= 20)
    return 'bar-chart'

  return 'table'
}
