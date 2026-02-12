# ClickHouse → TypeScript Type Mapping

## Complete Type Mapping Table

When ClickHouse returns data with `format: 'JSONEachRow'`, values are serialized as JSON. Use this table to write correct TypeScript interfaces.

| ClickHouse Type | TypeScript Type | JSONEachRow Returns | Notes |
|---|---|---|---|
| `UInt8`, `UInt16`, `UInt32` | `number` | `number` | Safe for JavaScript |
| `Int8`, `Int16`, `Int32` | `number` | `number` | Safe for JavaScript |
| `UInt64`, `UInt128`, `UInt256` | `string` | `string` | Exceeds `Number.MAX_SAFE_INTEGER` |
| `Int64`, `Int128`, `Int256` | `string` | `string` | Exceeds `Number.MAX_SAFE_INTEGER` |
| `Float32`, `Float64` | `number` | `number` | |
| `Decimal`, `Decimal32/64/128/256` | `string` | `string` | Preserve precision — don't convert to number |
| `String` | `string` | `string` | |
| `FixedString(N)` | `string` | `string` | May be padded with null bytes |
| `Date`, `Date32` | `string` | `string` | `YYYY-MM-DD` format |
| `DateTime` | `string` | `string` | `YYYY-MM-DD HH:mm:ss` format |
| `DateTime64` | `string` | `string` | Fractional seconds included |
| `Bool` | `boolean` | `boolean` | |
| `UUID` | `string` | `string` | |
| `Nullable(T)` | `T \| null` | `T \| null` | Always add `\| null` |
| `Array(T)` | `T[]` | `T[]` | Nested arrays supported |
| `Enum8`, `Enum16` | `string` | `string` | Returns the string value, not the numeric code |
| `LowCardinality(T)` | same as `T` | same as `T` | Storage optimization — transparent to queries |
| `Map(K, V)` | `Record<K, V>` | `object` | Keys are always strings in JSON |

## Raw / UI Dual-Type Pattern

Always define **two** types per ClickHouse table:

### 1. Raw Row Type (matches ClickHouse exactly)

```typescript
// In src/lib/clickhouse/queries.ts
// Naming: {TableName}Row
// Uses exact column names (snake_case)

interface ClustersRow {
  cluster_id: string;           // UInt64 → string
  cluster_name: string;         // String
  node_count: number;           // UInt32 → number
  total_memory_gb: string;      // Decimal(10,2) → string
  is_active: boolean;           // Bool → boolean
  tags: string[];               // Array(String) → string[]
  created_date: string;         // Date → string
  last_heartbeat: string | null; // Nullable(DateTime) → string | null
}
```

### 2. UI Type (clean, camelCase, frontend-friendly)

```typescript
// In src/types/index.ts
// Naming: {Entity} (no "Row" suffix)
// Uses camelCase, only fields UI needs

export interface Cluster {
  clusterId: string;
  clusterName: string;
  nodeCount: number;
  totalMemoryGb: number;       // Converted from string to number for display
  isActive: boolean;
  tags: string[];
  createdDate: string;
  lastHeartbeat: string;       // Null resolved to default
}
```

## Transform Function Template

```typescript
function transformCluster(row: ClustersRow): Cluster {
  return {
    clusterId: row.cluster_id,
    clusterName: row.cluster_name,
    nodeCount: row.node_count,
    totalMemoryGb: Number.parseFloat(row.total_memory_gb),  // Decimal string → number
    isActive: row.is_active,
    tags: row.tags,
    createdDate: row.created_date,
    lastHeartbeat: row.last_heartbeat ?? "Never",
  };
}
```

## Nullable Best Practices

1. **Always mark nullable columns** in the raw type:
   ```typescript
   // ClickHouse: Nullable(String)
   status: string | null;
   ```

2. **Resolve nulls in the transform**, not in the UI:
   ```typescript
   // Good — resolved in transform
   status: row.status ?? "unknown",

   // Bad — leaks nulls to UI components
   status: row.status,  // Now every component must handle null
   ```

3. **Use meaningful defaults**:
   ```typescript
   status: row.status ?? "unknown"
   lastSeen: row.last_seen ?? "Never"
   count: row.nullable_count ?? 0
   ```

## Large Integer Handling

UInt64 and larger types come back as strings. Choose based on use case:

```typescript
// Display only — keep as string
orderId: row.order_id,  // "18446744073709551615"

// Need arithmetic — convert (safe only if values < 2^53)
rowCount: Number(row.row_count),

// Need full precision arithmetic — use BigInt
totalBytes: BigInt(row.total_bytes),
```

## Aggregation Results

Aggregation functions return types based on the input:

| Function | Input Type | Return Type | TypeScript |
|---|---|---|---|
| `count()` | any | `UInt64` | `string` |
| `sum(Float64)` | `Float64` | `Float64` | `number` |
| `sum(UInt64)` | `UInt64` | `UInt64` | `string` |
| `avg(...)` | any numeric | `Float64` | `number` |
| `min/max(T)` | `T` | `T` | same as `T` |
| `uniq(...)` | any | `UInt64` | `string` |

Always name aggregation aliases with snake_case in the query, then transform:

```typescript
const result = await ch.query({
  query: "SELECT count() AS total_count, avg(price) AS avg_price FROM orders LIMIT 1",
  format: "JSONEachRow",
});
const rows = await result.json<{ total_count: string; avg_price: number }>();
```
