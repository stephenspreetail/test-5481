# Data Platform Query Patterns

## Trino Client Setup

> ⚠️ **IMPORTANT**: DO NOT create `.env` files with DATA_PLATFORM_* variables.
> The container already has credentials pre-configured. Just use `process.env` directly.

Create a shared client module in `src/lib/trino.ts`:

```typescript
import { Trino, BasicAuth } from 'trino-client'

export function createTrinoClient() {
  const host = process.env.DATA_PLATFORM_HOST
  const user = process.env.DATA_PLATFORM_USER
  const password = process.env.DATA_PLATFORM_PASSWORD

  if (!host || !user || !password) {
    throw new Error(
      'Missing required environment variables: DATA_PLATFORM_HOST, DATA_PLATFORM_USER, DATA_PLATFORM_PASSWORD'
    )
  }

  return Trino.create({
    server: `https://${host}:443`,
    auth: new BasicAuth(user, password),
    source: 'kova-app',
  })
}
```

## Server Function Patterns

### Pattern 1: Simple Query (No User Input)

```typescript
import { createServerFn } from '@tanstack/react-start'
import { createTrinoClient } from '../trino'
import type { YourResultType } from '../../types/data/your-domain'

export const getTopItems = createServerFn({ method: 'GET' })
  .handler(async () => {
    const client = createTrinoClient()

    const query = `
      SELECT column1, column2, column3
      FROM catalog.schema.table_name
      WHERE date >= current_date - interval '30' day
      ORDER BY column1 DESC
      LIMIT 100
    `

    const queryIterator = await client.query(query)
    const results: YourResultType[] = []

    for await (const result of queryIterator) {
      if (result.data) {
        for (const row of result.data) {
          results.push({
            column1: row[0] as string,
            column2: row[1] as number,
            column3: row[2] as string | null,
          })
        }
      }
    }

    return results
  })
```

### Pattern 2: Query with User Input (SECURITY CRITICAL)

**ALWAYS read SECURITY.md before implementing this pattern.**

```typescript
import { createServerFn } from '@tanstack/react-start'
import { createTrinoClient, sanitizeForTrino, validateStringInput } from '../trino'

export const searchItems = createServerFn({ method: 'GET' })
  .inputValidator((input: string) => validateStringInput(input, 200))
  .handler(async ({ data: searchTerm }) => {
    const client = createTrinoClient()
    const sanitized = sanitizeForTrino(searchTerm)

    const query = `
      SELECT column1, column2
      FROM catalog.schema.table_name
      WHERE name = '${sanitized}'
      LIMIT 100
    `

    const queryIterator = await client.query(query)
    const results: YourResultType[] = []

    for await (const result of queryIterator) {
      if (result.data) {
        for (const row of result.data) {
          results.push({
            column1: row[0] as string,
            column2: row[1] as number,
          })
        }
      }
    }

    return results
  })
```

### Pattern 3: Aggregation Query

```typescript
export const getCategoryStats = createServerFn({ method: 'GET' })
  .handler(async () => {
    const client = createTrinoClient()

    const query = `
      SELECT
        category,
        SUM(volume) as total_volume,
        COUNT(DISTINCT id) as item_count,
        AVG(price) as avg_price
      FROM catalog.schema.table_name
      WHERE category IS NOT NULL
      GROUP BY category
      ORDER BY total_volume DESC
      LIMIT 20
    `

    const queryIterator = await client.query(query)
    const results: CategoryStats[] = []

    for await (const result of queryIterator) {
      if (result.data) {
        for (const row of result.data) {
          results.push({
            category: row[0] as string,
            total_volume: Number(row[1]),
            item_count: Number(row[2]),
            avg_price: Number(row[3]),
          })
        }
      }
    }

    return results
  })
```

## TypeScript Type Patterns

Define types in `src/types/data/{domain}.ts`:

```typescript
// Full entity type (matches table columns)
export interface MarketInsightsForecast {
  asin: string
  search_term: string
  overall_position: number
  title: string | null           // Nullable columns use | null
  price: string | null
  adjusted_price: number | null
  adjusted_purchase_vol_forecast: number | null
  category_root_0: string | null
}

// Aggregated/summary types
export interface TopSearchTerm {
  search_term: string
  total_adjusted_volume: number
  asin_count: number
}

export interface CategoryStats {
  category: string
  total_volume: number
  item_count: number
  avg_price: number
}
```

## TanStack Query Integration

Use in React components:

```typescript
import { useQuery } from '@tanstack/react-query'
import { getTopItems, searchItems } from '../server/data/your-domain'

function Dashboard() {
  // Simple query
  const { data, isLoading, error } = useQuery({
    queryKey: ['topItems'],
    queryFn: () => getTopItems(),
  })

  // Query with parameter
  const { data: searchResults } = useQuery({
    queryKey: ['search', searchTerm],
    queryFn: () => searchItems({ data: searchTerm }),
    enabled: !!searchTerm, // Only run when searchTerm exists
  })

  if (error) {
    return <div>Error: {error.message}</div>
  }

  // ... render data
}
```

## Common Query Patterns

### Date Filtering
```sql
-- Last 30 days
WHERE date >= current_date - interval '30' day

-- Specific date range
WHERE date BETWEEN DATE '2024-01-01' AND DATE '2024-01-31'

-- Current week
WHERE date >= date_trunc('week', current_date)
```

### Null Handling
```sql
-- Filter out nulls
WHERE column IS NOT NULL

-- Coalesce nulls
SELECT COALESCE(column, 'default') as column
```

### Top N per Group
```sql
-- Using ROW_NUMBER
WITH ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY category ORDER BY volume DESC) as rn
  FROM table
)
SELECT * FROM ranked WHERE rn <= 10
```
