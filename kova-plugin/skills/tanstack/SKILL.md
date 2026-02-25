---
name: tanstack
description: Build apps with TanStack ecosystem - Start (server functions), Router (file-based routing), Query (data fetching), and Table (data grids). Use when working with routing, server functions, data fetching, or tables in Kova apps.
---

# TanStack Stack

> **Versions:** Start/Router 1.x | Query 5.x | Table 8.x | **Updated:** 2026-01-27

Kova apps use the TanStack ecosystem: Start, Router, Query, and Table.

## Critical: Common Mistakes

### Wrong Import Path

```typescript
// WRONG
import { createServerFn } from '@tanstack/start'

// CORRECT
import { createServerFn } from '@tanstack/react-start'
```

### Wrong Validator Method

```typescript
// WRONG
.validator((data) => data)

// CORRECT
.inputValidator((data) => data)
```

## Quick Reference

### Server Functions (TanStack Start)

```typescript
import { createServerFn } from '@tanstack/react-start'

// GET request
const getData = createServerFn({ method: 'GET' })
  .handler(async () => {
    return await db.items.findMany()
  })

// POST request with validation
const createItem = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    return await db.items.create({ data })
  })
```

### TanStack Query

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// Fetch data
const { data, isLoading } = useQuery({
  queryKey: ['items'],
  queryFn: () => getData(),
})

// Mutate data
const queryClient = useQueryClient()
const mutation = useMutation({
  mutationFn: createItem,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['items'] })
  },
})
```

### File-Based Routing

| File | Route |
|------|-------|
| `__root.tsx` | Root layout |
| `index.tsx` | `/` |
| `about.tsx` | `/about` |
| `posts/$postId.tsx` | `/posts/:id` |
| `_auth/login.tsx` | `/login` (pathless layout) |

### Route with Loader

```typescript
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    return await getPost({ data: { id: params.postId } })
  },
  component: PostComponent,
})

function PostComponent() {
  const post = Route.useLoaderData()
  return <div>{post.title}</div>
}
```

### Protected Routes

```typescript
// src/routes/_authenticated/route.tsx
import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
  component: () => <Outlet />,
})
```

### TanStack Table with Spreeform

```typescript
import { Table, FlexTableHeader, FlexTableBody } from '@spreetail/spreeform'
import { useReactTable, getCoreRowModel, getSortedRowModel } from '@tanstack/react-table'

const table = useReactTable({
  data,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
})

<Table>
  <FlexTableHeader table={table} />
  <FlexTableBody table={table} fallback={<div>No data</div>} />
</Table>
```

## Key Patterns

### Query Options Factory

```typescript
import { queryOptions } from '@tanstack/react-query'

export const itemQueries = {
  all: () => ['items'] as const,
  list: () => queryOptions({
    queryKey: [...itemQueries.all(), 'list'],
    queryFn: () => getItems(),
  }),
  detail: (id: string) => queryOptions({
    queryKey: [...itemQueries.all(), id],
    queryFn: () => getItem({ data: { id } }),
  }),
}

// Usage
useQuery(itemQueries.list())
queryClient.invalidateQueries({ queryKey: itemQueries.all() })
```

### Route Loader with Query Prefetch

```typescript
export const Route = createFileRoute('/items')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(itemQueries.list())
  },
  component: ItemsComponent,
})

function ItemsComponent() {
  const { data } = useSuspenseQuery(itemQueries.list())
  return <ItemsList items={data} />
}
```

## Common Gotchas

| Issue | Cause | Solution |
|-------|-------|----------|
| Secrets exposed to client | Accessing `process.env` in loader | Use server function instead |
| Stale data after mutation | Missing invalidation | Add `onSuccess: () => queryClient.invalidateQueries()` |
| Infinite re-renders in table | Unstable `columns` reference | Wrap in `useMemo()` |
| Query key mismatch | Typo in key | Use `queryOptions` factory |
| Hydration mismatch | Date/random values | Use `useEffect` for client-only values |
| `localStorage is not defined` | `ThemeProvider`/`SidebarProvider` rendered during SSR | Wrap in `<ClientOnly>` from `@tanstack/react-router` (see **/spreeform** → SSR Compatibility) |

## Related Skills

- **/init-project** - Initialize a new TanStack Start project

## Reference Files

- **references/START.md** - Server functions, middleware, SSR
- **references/QUERY.md** - useQuery, useMutation, caching
- **references/TABLE.md** - Column definitions, sorting, filtering
- **references/ROUTER.md** - File routing, navigation, params
