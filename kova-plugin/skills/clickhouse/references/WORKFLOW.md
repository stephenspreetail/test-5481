# ClickHouse Integration Workflow

Full code examples for each step of the ClickHouse integration workflow.

## Prerequisites

### Install the client

```bash
bun add @clickhouse/client
```

### Environment variables

Add to `.env.example` and `.env`:

```env
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=default
```

### Client singleton (`src/lib/clickhouse/client.ts`)

Create a single shared client instance. Never create multiple clients.

```typescript
import { createClient, type ClickHouseClient } from "@clickhouse/client";

let client: ClickHouseClient | null = null;

export function getClickHouseClient(): ClickHouseClient {
  if (client) return client;

  const url = process.env.CLICKHOUSE_URL;
  const username = process.env.CLICKHOUSE_USER;
  const password = process.env.CLICKHOUSE_PASSWORD;
  const database = process.env.CLICKHOUSE_DATABASE;

  if (!url || !username || !database) {
    throw new Error(
      "Missing ClickHouse config. Set CLICKHOUSE_URL, CLICKHOUSE_USER, CLICKHOUSE_DATABASE in .env"
    );
  }

  client = createClient({
    url,
    username,
    password: password ?? "",
    database,
    request_timeout: 30_000,
    compression: { request: true, response: true },
    keep_alive: { enabled: true },
  });

  return client;
}

/** Verify connectivity. Call once at startup if desired. */
export async function pingClickHouse(): Promise<boolean> {
  const ch = getClickHouseClient();
  const { success } = await ch.ping();
  return success;
}
```

---

## Step 1 — Get Table Schema

Run `DESCRIBE TABLE` to understand the table before writing any code:

```typescript
const result = await getClickHouseClient().query({
  query: "DESCRIBE TABLE database.table_name",
  format: "JSONEachRow",
});
const columns = await result.json();
// Each row: { name, type, default_type, default_expression, comment, ... }
```

Look for:
- Column names and types (exact spelling matters)
- `Nullable(...)` wrappers — these become `T | null` in TypeScript
- Large integer types (`UInt64`, `Int128`) — these come back as strings
- `ORDER BY` columns if you need efficient filtering

---

## Step 2 — Define Raw Row Type

Create an interface that maps 1:1 to the ClickHouse columns. Use exact column names (snake_case).

Convention: name it `{TableName}Row` and place it in `src/lib/clickhouse/queries.ts`.

```typescript
// Raw type — exact match to ClickHouse column names and types
interface OrdersRow {
  order_id: string;       // UInt64 → string (exceeds MAX_SAFE_INTEGER)
  customer_name: string;  // String → string
  total_amount: number;   // Float64 → number
  status: string | null;  // Nullable(String) → string | null
  created_at: string;     // DateTime → string (ISO format)
}
```

See **TYPES.md** for the complete ClickHouse → TypeScript type mapping table.

---

## Step 3 — Define UI Type

Create a clean camelCase interface in `src/types/index.ts` with only the fields the UI needs.

```typescript
// UI type — clean names, only fields the frontend uses
export interface Order {
  orderId: string;
  customerName: string;
  totalAmount: number;
  status: string;
  createdAt: string;
}
```

Rules:
- camelCase property names
- Fix typos or abbreviations from the raw schema
- Drop columns the UI doesn't need
- Resolve nulls (provide defaults in the transform)

---

## Step 4 — Write Transform Function

Place in `src/lib/clickhouse/queries.ts` alongside query functions. This is a pure function: raw row in, UI object out.

```typescript
function transformOrder(row: OrdersRow): Order {
  return {
    orderId: row.order_id,
    customerName: row.customer_name,
    totalAmount: row.total_amount,
    status: row.status ?? "unknown",
    createdAt: row.created_at,
  };
}
```

Key patterns:
- Null handling: `row.field ?? 'default'`
- Number parsing: `Number(row.uint64_field)` when you need arithmetic (but beware precision loss for UInt64)
- Date formatting: parse `row.created_at` if the UI needs a different format

---

## Step 5 — Write Query Functions

All queries go in `src/lib/clickhouse/queries.ts`. Every query MUST:
1. Use **parameterized queries** with `{name:Type}` syntax and `query_params`
2. Use `format: 'JSONEachRow'`
3. Include a `LIMIT` clause
4. Return the UI type (transformed)

### Example: Search query with ILIKE

```typescript
export async function searchOrders(
  searchTerm: string,
  limit = 100
): Promise<Order[]> {
  const ch = getClickHouseClient();
  const result = await ch.query({
    query: `
      SELECT order_id, customer_name, total_amount, status, created_at
      FROM orders
      WHERE customer_name ILIKE {search:String}
      ORDER BY created_at DESC
      LIMIT {limit:UInt32}
    `,
    query_params: {
      search: `%${searchTerm}%`,
      limit,
    },
    format: "JSONEachRow",
  });
  const rows = await result.json<OrdersRow>();
  return rows.map(transformOrder);
}
```

### Example: Get by ID

```typescript
export async function getOrder(orderId: string): Promise<Order | null> {
  const ch = getClickHouseClient();
  const result = await ch.query({
    query: `
      SELECT order_id, customer_name, total_amount, status, created_at
      FROM orders
      WHERE order_id = {id:UInt64}
      LIMIT 1
    `,
    query_params: { id: orderId },
    format: "JSONEachRow",
  });
  const rows = await result.json<OrdersRow>();
  return rows.length > 0 ? transformOrder(rows[0]) : null;
}
```

### Example: Aggregation

```typescript
export async function getOrderStats(): Promise<{
  totalOrders: number;
  totalRevenue: number;
}> {
  const ch = getClickHouseClient();
  const result = await ch.query({
    query: `
      SELECT
        count() AS total_orders,
        sum(total_amount) AS total_revenue
      FROM orders
      LIMIT 1
    `,
    format: "JSONEachRow",
  });
  const rows = await result.json<{
    total_orders: string;
    total_revenue: number;
  }>();
  const row = rows[0];
  return {
    totalOrders: Number(row.total_orders),
    totalRevenue: row.total_revenue,
  };
}
```

---

## Step 6 — Write Server Functions (CRITICAL)

Server functions live in `src/lib/internal/{feature}.ts`. They are the bridge between route loaders and ClickHouse queries.

### Why dynamic imports are required

`@clickhouse/client` uses Node.js APIs (`net`, `tls`, `http`). TanStack Start bundles code for both server and client. A static import at the top of a server function file will be included in the client bundle, crashing the browser.

### Correct pattern: dynamic import

```typescript
// src/lib/internal/orders.ts
import { createServerFn } from "@tanstack/react-start";

export const getOrders = createServerFn({ method: "GET" }).handler(
  async () => {
    // Dynamic import — only loaded on the server at runtime
    const { searchOrders } = await import("../clickhouse/queries");
    try {
      return await searchOrders("", 50);
    } catch (err) {
      console.error("[orders] Failed to fetch:", err);
      throw new Error("Failed to load orders");
    }
  }
);

export const searchOrdersFn = createServerFn({ method: "GET" })
  .inputValidator((d: string) => d)
  .handler(async ({ data: searchTerm }) => {
    const { searchOrders } = await import("../clickhouse/queries");
    try {
      return await searchOrders(searchTerm);
    } catch (err) {
      console.error("[orders] Search failed:", err);
      throw new Error("Search failed");
    }
  });
```

### WRONG — static import (DO NOT DO THIS)

```typescript
// WRONG — will crash the browser bundle
import { searchOrders } from "../clickhouse/queries";

export const getOrders = createServerFn({ method: "GET" }).handler(
  async () => {
    return await searchOrders("", 50); // @clickhouse/client in browser = crash
  }
);
```

Read **SECURITY.md** for full security rules on input validation and error handling.

---

## Step 7 — Wire into Route Components

### Route loader pattern (preferred)

```typescript
// src/routes/orders.tsx
import { createFileRoute } from "@tanstack/react-router";
import { getOrders } from "../lib/internal/orders";

export const Route = createFileRoute("/orders")({
  loader: () => getOrders(),
  errorComponent: ({ error }) => (
    <div className="p-4 text-destructive">
      Failed to load orders: {error.message}
    </div>
  ),
  component: OrdersPage,
});

function OrdersPage() {
  const orders = Route.useLoaderData();
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Orders</h1>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Customer</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.orderId}>
              <td>{order.orderId}</td>
              <td>{order.customerName}</td>
              <td>${order.totalAmount.toFixed(2)}</td>
              <td>{order.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Interactive search (exception — uses TanStack Query)

For search-as-you-type, use TanStack Query instead of a route loader:

```typescript
import { useQuery } from "@tanstack/react-query";
import { searchOrdersFn } from "../lib/internal/orders";

function OrderSearch() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "search", debouncedSearch],
    queryFn: () => searchOrdersFn({ data: debouncedSearch }),
    enabled: debouncedSearch.length > 0,
  });

  return (
    <div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} />
      {isLoading ? <p>Searching...</p> : null}
      {/* render results */}
    </div>
  );
}
```

---

## Step 8 — Write Tests

### Mock `@clickhouse/client`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the ClickHouse client module
vi.mock("@clickhouse/client", () => ({
  createClient: vi.fn(() => ({
    query: vi.fn(),
    ping: vi.fn().mockResolvedValue({ success: true }),
  })),
}));
```

### Test transform functions

```typescript
describe("transformOrder", () => {
  it("handles null status", () => {
    const row: OrdersRow = {
      order_id: "123",
      customer_name: "Alice",
      total_amount: 99.99,
      status: null,
      created_at: "2024-01-15 10:30:00",
    };
    const result = transformOrder(row);
    expect(result.status).toBe("unknown");
    expect(result.customerName).toBe("Alice");
  });
});
```

### Test parameterized queries

```typescript
describe("searchOrders", () => {
  it("uses parameterized queries, not string concatenation", async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      json: () => Promise.resolve([]),
    });
    // ... setup mock client with mockQuery
    await searchOrders("test");
    const call = mockQuery.mock.calls[0][0];
    expect(call.query).toContain("{search:String}");
    expect(call.query_params.search).toBe("%test%");
    // Verify no string concatenation
    expect(call.query).not.toContain("'test'");
  });
});
```

### Optional: Integration tests

```typescript
describe.skipIf(!process.env.CLICKHOUSE_URL)("ClickHouse integration", () => {
  it("can ping the server", async () => {
    const ok = await pingClickHouse();
    expect(ok).toBe(true);
  });
});
```

---

## File Structure Convention

```
src/
├── lib/clickhouse/
│   ├── client.ts           # Singleton client (getClickHouseClient)
│   └── queries.ts          # Query functions + raw row types + transforms
├── types/
│   └── index.ts            # UI types (Order, etc.)
├── lib/internal/
│   └── {feature}.ts        # Server functions (dynamic imports!)
└── routes/
    └── {route}.tsx          # Route components with loaders
```
