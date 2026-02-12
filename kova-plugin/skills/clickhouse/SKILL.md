---
name: clickhouse
description: Integrate ClickHouse analytics databases into TanStack Start applications. Use when building apps that query ClickHouse, when the user mentions ClickHouse, analytical queries, OLAP, or connecting to a ClickHouse Cloud database.
---

# ClickHouse Integration

Integrate ClickHouse into TanStack Start applications with type-safe queries, proper server/client separation, and security best practices.

## Quick Start

```bash
bun add @clickhouse/client
```

Add to `.env.example`:

```env
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=default
```

## 8-Step Workflow

Follow each step in order. Read the referenced files for full code examples.

### 1. Get Table Schema
Run `DESCRIBE TABLE database.table_name` to understand columns, types, and nullability.

### 2. Define Raw Row Type
Interface named `{TableName}Row` in `src/lib/clickhouse/queries.ts`. Exact column names (snake_case). See **references/TYPES.md** for the complete type mapping table.

### 3. Define UI Type
Clean camelCase interface in `src/types/index.ts`. Only fields the UI needs. Resolve nulls in the transform.

### 4. Write Transform Function
Pure function in `src/lib/clickhouse/queries.ts`. Raw row in → UI object out. Handle nulls with `?? 'default'`.

### 5. Write Query Functions
In `src/lib/clickhouse/queries.ts`. Every query MUST use:
- `{name:Type}` parameterized syntax with `query_params`
- `format: 'JSONEachRow'`
- `LIMIT` clause

### 6. Write Server Functions (CRITICAL)
In `src/lib/internal/{feature}.ts`. **MUST use dynamic imports**:
```typescript
const { fn } = await import("../clickhouse/queries");
```
Static imports of `@clickhouse/client` crash the browser bundle. Read **references/SECURITY.md** for details.

### 7. Wire into Route Components
Route `loader` calls server function. `Route.useLoaderData()` for data access. For interactive search, use TanStack Query.

### 8. Write Tests
Mock `@clickhouse/client` with `vi.mock()`. Test transforms (null handling) and queries (verify parameterized, not concatenated).

## File Structure

```
src/
├── lib/clickhouse/
│   ├── client.ts           # Singleton client
│   └── queries.ts          # Query functions + raw types + transforms
├── types/
│   └── index.ts            # UI types
├── lib/internal/
│   └── {feature}.ts        # Server functions (dynamic imports!)
└── routes/
    └── {route}.tsx          # Route components
```

## Critical Rules

1. **Parameterized queries only** — never concatenate user input into SQL
2. **Dynamic imports** — `await import()` inside handler, never static `import` at top
3. **LIMIT every query** — prevent unbounded result sets
4. **Validate input** — `.inputValidator()` on every server function with user input
5. **Catch and log** — `try/catch` in server functions, generic errors to client

## Reference Files

- **references/WORKFLOW.md** — Full 8-step workflow with complete code examples
- **references/TYPES.md** — ClickHouse → TypeScript type mapping table
- **references/SECURITY.md** — Parameterized queries, dynamic imports, error handling
