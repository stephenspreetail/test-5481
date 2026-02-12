# ClickHouse Security Rules

Follow these rules for every ClickHouse query in a TanStack Start application.

## 1. Parameterized Queries

**ALWAYS** use ClickHouse parameterized query syntax. **NEVER** concatenate user input into SQL strings.

### Correct — parameterized

```typescript
const result = await ch.query({
  query: `
    SELECT * FROM orders
    WHERE customer_name ILIKE {search:String}
    LIMIT {limit:UInt32}
  `,
  query_params: {
    search: `%${userInput}%`,
    limit: 100,
  },
  format: "JSONEachRow",
});
```

### WRONG — string concatenation (SQL injection vulnerability)

```typescript
// NEVER DO THIS
const result = await ch.query({
  query: `SELECT * FROM orders WHERE customer_name LIKE '%${userInput}%'`,
  format: "JSONEachRow",
});
```

### Parameter type reference

Common parameter types for `{name:Type}` syntax:

| Type | Use for |
|---|---|
| `String` | Text search, names, IDs stored as strings |
| `UInt32` | LIMIT, OFFSET, small positive integers |
| `UInt64` | Large IDs, counts |
| `Int32` | Signed integers |
| `Float64` | Decimal values |
| `Date` | Date filters (`YYYY-MM-DD` format) |
| `DateTime` | Timestamp filters |

## 2. Dynamic Imports (TanStack Start Bundling)

`@clickhouse/client` depends on Node.js built-in modules (`net`, `tls`, `http`). TanStack Start's Vite bundler processes server function files for both server and client targets. Static imports pull ClickHouse into the browser bundle, causing runtime crashes.

### Correct — dynamic import inside handler

```typescript
// src/lib/internal/orders.ts
import { createServerFn } from "@tanstack/react-start";

export const getOrders = createServerFn({ method: "GET" }).handler(
  async () => {
    const { searchOrders } = await import("../clickhouse/queries");
    return await searchOrders("", 50);
  }
);
```

### WRONG — static import at top of file

```typescript
// WRONG — @clickhouse/client ends up in browser bundle
import { searchOrders } from "../clickhouse/queries";

export const getOrders = createServerFn({ method: "GET" }).handler(
  async () => searchOrders("", 50)
);
```

### Why this happens

TanStack Start (via Vinxi/Vite) tree-shakes server functions but still analyzes the full module graph for both targets. A top-level import of a file that imports `@clickhouse/client` will cause Vite to try to bundle `node:net`, `node:tls`, etc. for the browser, which fails.

The `await import()` inside the handler function body is never reached during client-side bundling, so Vite skips it.

## 3. Input Validation

Validate all user-provided input in server functions using `.inputValidator()`.

### Search input validation

```typescript
export const searchOrdersFn = createServerFn({ method: "GET" })
  .inputValidator((d: string) => {
    if (typeof d !== "string") throw new Error("Invalid search input");
    return d.slice(0, 200); // Cap length
  })
  .handler(async ({ data: searchTerm }) => {
    const { searchOrders } = await import("../clickhouse/queries");
    return await searchOrders(searchTerm);
  });
```

### Dynamic column names — use allowlists

If users can choose which column to sort or filter by, **never** pass the column name directly into SQL. Use an allowlist:

```typescript
const ALLOWED_SORT_COLUMNS = ["customer_name", "total_amount", "created_at"] as const;
type SortColumn = (typeof ALLOWED_SORT_COLUMNS)[number];

export const getOrdersSorted = createServerFn({ method: "GET" })
  .inputValidator((d: { sortBy: string; order: string }) => {
    if (!ALLOWED_SORT_COLUMNS.includes(d.sortBy as SortColumn)) {
      throw new Error("Invalid sort column");
    }
    if (d.order !== "ASC" && d.order !== "DESC") {
      throw new Error("Invalid sort order");
    }
    return d as { sortBy: SortColumn; order: "ASC" | "DESC" };
  })
  .handler(async ({ data: { sortBy, order } }) => {
    const { getOrdersSorted } = await import("../clickhouse/queries");
    return await getOrdersSorted(sortBy, order);
  });
```

In the query function, use the validated column name directly (it's from the allowlist, not user input):

```typescript
export async function getOrdersSorted(
  sortBy: SortColumn,
  order: "ASC" | "DESC",
  limit = 100
): Promise<Order[]> {
  const ch = getClickHouseClient();
  // sortBy is safe — validated against allowlist before reaching here
  const result = await ch.query({
    query: `SELECT * FROM orders ORDER BY ${sortBy} ${order} LIMIT {limit:UInt32}`,
    query_params: { limit },
    format: "JSONEachRow",
  });
  const rows = await result.json<OrdersRow>();
  return rows.map(transformOrder);
}
```

## 4. Error Handling

Never expose SQL errors, query text, or ClickHouse internals to the browser.

### Correct pattern

```typescript
export const getOrders = createServerFn({ method: "GET" }).handler(
  async () => {
    const { fetchOrders } = await import("../clickhouse/queries");
    try {
      return await fetchOrders();
    } catch (err) {
      // Log full error on server for debugging
      console.error("[orders] ClickHouse query failed:", err);
      // Throw generic message to client
      throw new Error("Failed to load orders");
    }
  }
);
```

### WRONG — leaking details

```typescript
// WRONG — exposes SQL and server details to the browser
export const getOrders = createServerFn({ method: "GET" }).handler(
  async () => {
    const { fetchOrders } = await import("../clickhouse/queries");
    return await fetchOrders(); // Unhandled ClickHouse error goes straight to client
  }
);
```

## 5. Service Accounts

- Use **read-only** ClickHouse users for application connections
- Use **dedicated** accounts per application (not shared `default` user)
- Follow **least privilege**: grant only `SELECT` on required tables
- Store credentials in environment variables, never in code

## 6. Security Checklist

Use this checklist before completing any ClickHouse integration:

- [ ] All queries use `{name:Type}` parameterized syntax
- [ ] No string concatenation of user input into SQL
- [ ] `@clickhouse/client` imported with `await import()` inside server function handlers
- [ ] No static imports of ClickHouse modules at file top level
- [ ] `.inputValidator()` on every server function that accepts user input
- [ ] Dynamic column/table names validated against allowlists
- [ ] `try/catch` around every ClickHouse call in server functions
- [ ] Error logs include full error; thrown errors are generic
- [ ] Every query includes a `LIMIT` clause
- [ ] `.env.example` documents required ClickHouse variables
- [ ] ClickHouse credentials are not committed to source control
