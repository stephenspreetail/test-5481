export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export function formatCurrency(cents: number): string {
  const dollars = cents / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars)
}

export function formatPercentage(value: number): string {
  const pct = value > 0 && value < 1 ? value * 100 : value
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(pct)}%`
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function detectColumnFormat(
  columnName: string
): 'currency' | 'percentage' | 'number' | 'text' {
  const lower = columnName.toLowerCase()
  if (/price|cost|fee|revenue|amount|total|spend|budget/.test(lower))
    return 'currency'
  if (/rate|percent|pct|ratio/.test(lower)) return 'percentage'
  if (/count|qty|quantity|num|sum|avg|min|max|id/.test(lower)) return 'number'
  return 'text'
}

export function formatCellValue(value: unknown, columnName: string): string {
  if (value === null || value === undefined) return '-'

  const format = detectColumnFormat(columnName)

  if (format === 'text' || typeof value === 'string') {
    if (typeof value === 'number') return formatNumber(value)
    return String(value)
  }

  const numValue = typeof value === 'number' ? value : Number(value)
  if (isNaN(numValue)) return String(value)

  switch (format) {
    case 'currency':
      return formatCurrency(numValue)
    case 'percentage':
      return formatPercentage(numValue)
    case 'number':
      return formatNumber(numValue)
    default:
      return String(value)
  }
}
