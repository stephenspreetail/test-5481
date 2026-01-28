# TanStack Query Reference

> **Version:** 5.x | **Updated:** 2026-01-27

TanStack Query v5 is a data-fetching and state management library for React with automatic caching, background refetching, and stale data management.

## Important Defaults

| Option | Default | Description |
|--------|---------|-------------|
| `staleTime` | `0` | Data is immediately considered stale |
| `gcTime` | `5 min` | Unused cache entries garbage collected |
| `retry` | `3` | Failed queries retry 3 times |
| `refetchOnMount` | `true` | Refetch stale data on mount |
| `refetchOnWindowFocus` | `true` | Refetch on window focus |
| `refetchOnReconnect` | `true` | Refetch on network reconnect |

## QueryClientProvider Setup

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Create outside component for stable reference
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10,   // 10 minutes
      retry: 3,
      refetchOnWindowFocus: true,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <YourApp />
    </QueryClientProvider>
  )
}
```

## useQuery

### Basic Usage

```typescript
import { useQuery } from '@tanstack/react-query'

function TodoList() {
  const {
    data,
    error,
    isLoading,
    isPending,
    isError,
    isSuccess,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
  })

  if (isPending) return <div>Loading...</div>
  if (isError) return <div>Error: {error.message}</div>

  return (
    <ul>
      {data.map((todo) => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </ul>
  )
}
```

### Key Options

```typescript
useQuery({
  queryKey: ['todos', { status: 'done' }],
  queryFn: ({ queryKey }) => fetchTodos(queryKey[1]),

  // Timing
  staleTime: 5 * 60 * 1000,       // 5 minutes fresh
  gcTime: 10 * 60 * 1000,         // 10 minutes cache
  refetchInterval: 30000,          // Refetch every 30 seconds

  // Behavior
  enabled: !!userId,               // Conditional fetching
  retry: 3,
  retryDelay: (attempt) => attempt * 1000,

  // Data transformation
  select: (data) => data.filter(t => t.completed),

  // Placeholder data
  placeholderData: [],
})
```

### Dependent Queries

```typescript
const { data: user } = useQuery({
  queryKey: ['user', email],
  queryFn: () => getUserByEmail(email),
})

const { data: projects } = useQuery({
  queryKey: ['projects', user?.id],
  queryFn: () => getProjectsByUser(user!.id),
  enabled: !!user?.id, // Only runs when user.id exists
})
```

## useMutation

### Basic Usage

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'

function AddTodo() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (newTodo: Todo) => axios.post('/todos', newTodo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  return (
    <button
      onClick={() => mutation.mutate({ title: 'New Todo' })}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? 'Adding...' : 'Add Todo'}
    </button>
  )
}
```

### Mutation Callbacks

```typescript
const mutation = useMutation({
  mutationFn: createTodo,

  onMutate: async (variables) => {
    return { previousTodos: queryClient.getQueryData(['todos']) }
  },

  onSuccess: (data, variables, context) => {
    console.log('Created:', data)
  },

  onError: (error, variables, context) => {
    queryClient.setQueryData(['todos'], context.previousTodos)
  },

  onSettled: (data, error, variables, context) => {
    queryClient.invalidateQueries({ queryKey: ['todos'] })
  },
})
```

## Query Keys and Cache Management

### Query Key Structure

```typescript
// Simple key
useQuery({ queryKey: ['todos'], ... })

// With parameters
useQuery({ queryKey: ['todos', { status: 'done' }], ... })

// Hierarchical keys
useQuery({ queryKey: ['todos', todoId], ... })
useQuery({ queryKey: ['todos', todoId, 'comments'], ... })
```

### Invalidation

```typescript
const queryClient = useQueryClient()

// Invalidate everything
queryClient.invalidateQueries()

// Invalidate all queries starting with 'todos'
queryClient.invalidateQueries({ queryKey: ['todos'] })

// Exact match only
queryClient.invalidateQueries({
  queryKey: ['todos'],
  exact: true
})
```

### queryOptions Factory (Recommended)

```typescript
import { queryOptions } from '@tanstack/react-query'

export const todoQueries = {
  all: () => ['todos'] as const,
  lists: () => [...todoQueries.all(), 'list'] as const,

  list: (filters: TodoFilters) =>
    queryOptions({
      queryKey: [...todoQueries.lists(), filters] as const,
      queryFn: () => fetchTodos(filters),
    }),

  detail: (id: string) =>
    queryOptions({
      queryKey: [...todoQueries.all(), 'detail', id] as const,
      queryFn: () => fetchTodo(id),
      staleTime: 5 * 60 * 1000,
    }),
}

// Usage
useQuery(todoQueries.list({ status: 'done' }))
useQuery(todoQueries.detail('1'))

// Invalidation
queryClient.invalidateQueries({ queryKey: todoQueries.all() })
```

## Optimistic Updates

### Via the Cache (Full Rollback Support)

```typescript
const updateTodoMutation = useMutation({
  mutationFn: updateTodo,

  onMutate: async (newTodo) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['todos', newTodo.id] })

    // Snapshot previous value
    const previousTodo = queryClient.getQueryData(['todos', newTodo.id])

    // Optimistically update
    queryClient.setQueryData(['todos', newTodo.id], newTodo)

    return { previousTodo }
  },

  onError: (err, newTodo, context) => {
    // Rollback
    queryClient.setQueryData(['todos', newTodo.id], context?.previousTodo)
  },

  onSettled: (data, error, variables) => {
    queryClient.invalidateQueries({ queryKey: ['todos', variables.id] })
  },
})
```

## Infinite Queries

```typescript
import { useInfiniteQuery } from '@tanstack/react-query'

function PostList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['posts'],
    queryFn: ({ pageParam }) => fetchPosts(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      return lastPage.hasMore ? lastPage.nextCursor : undefined
    },
  })

  return (
    <div>
      {data?.pages.map((page, i) => (
        <React.Fragment key={i}>
          {page.items.map((post) => (
            <Post key={post.id} post={post} />
          ))}
        </React.Fragment>
      ))}

      <button
        onClick={() => fetchNextPage()}
        disabled={!hasNextPage || isFetchingNextPage}
      >
        {isFetchingNextPage ? 'Loading more...' : hasNextPage ? 'Load More' : 'No more'}
      </button>
    </div>
  )
}
```

## Prefetching

### Using queryClient.prefetchQuery

```typescript
const queryClient = useQueryClient()

// Prefetch on hover
function TodoLink({ todoId }: { todoId: string }) {
  return (
    <Link
      to={`/todos/${todoId}`}
      onMouseEnter={() => {
        queryClient.prefetchQuery({
          queryKey: ['todos', todoId],
          queryFn: () => fetchTodo(todoId),
          staleTime: 5 * 60 * 1000,
        })
      }}
    >
      View Todo
    </Link>
  )
}
```

### ensureQueryData

Returns cached data if available, otherwise fetches:

```typescript
// In a route loader
const todoLoader = async ({ params }) => {
  const todo = await queryClient.ensureQueryData(
    todoQueries.detail(params.todoId)
  )
  return { todo }
}
```

## Suspense Mode

### useSuspenseQuery

```typescript
import { useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'

function TodoDetail({ todoId }: { todoId: string }) {
  // data is guaranteed to be defined
  const { data } = useSuspenseQuery({
    queryKey: ['todos', todoId],
    queryFn: () => fetchTodo(todoId),
  })

  return <div>{data.title}</div>
}

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <TodoDetail todoId="1" />
    </Suspense>
  )
}
```

## TanStack Start Integration

### Server Functions with Query

```typescript
import { createServerFn } from '@tanstack/react-start'
import { queryOptions } from '@tanstack/react-query'

export const getTodos = createServerFn({ method: 'GET' })
  .handler(async () => {
    return await db.query.todos.findMany()
  })

export const todoServerQueries = {
  all: () => ['todos'] as const,

  list: () =>
    queryOptions({
      queryKey: [...todoServerQueries.all(), 'list'] as const,
      queryFn: () => getTodos(),
    }),
}

// In component
function TodoList() {
  const { data: todos } = useQuery(todoServerQueries.list())
  return (/* ... */)
}
```

### Route Loader Integration

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { todoServerQueries } from '@/lib/queries/todos'

export const Route = createFileRoute('/todos/$todoId')({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      todoServerQueries.detail(params.todoId)
    )
  },
  component: TodoDetail,
})

function TodoDetail() {
  const { todoId } = Route.useParams()
  const { data } = useSuspenseQuery(todoServerQueries.detail(todoId))
  return <div>{data.title}</div>
}
```

## Common Mistakes

### 1. Forgetting to Invalidate

```typescript
// BAD
const mutation = useMutation({ mutationFn: updateTodo })

// GOOD
const mutation = useMutation({
  mutationFn: updateTodo,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] })
  },
})
```

### 2. Query Key Mismatches

```typescript
// BAD - typo in key
queryClient.prefetchQuery({ queryKey: ['user', id], ... })
useQuery({ queryKey: ['users', id], ... }) // Different key!

// GOOD - use queryOptions factory
const userQueries = {
  detail: (id: string) => queryOptions({
    queryKey: ['users', id] as const,
    queryFn: () => fetchUser(id),
  }),
}
queryClient.prefetchQuery(userQueries.detail(id))
useQuery(userQueries.detail(id))
```

### 3. Stale Closure Issues

```typescript
// BAD - key doesn't include filter
useQuery({
  queryKey: ['todos'],
  queryFn: () => fetchTodos(filter), // filter may be stale
})

// GOOD - include dependencies in key
useQuery({
  queryKey: ['todos', filter],
  queryFn: () => fetchTodos(filter),
})
```

### 4. Creating QueryClient Every Render

```typescript
// BAD - new client every render
function App() {
  const queryClient = new QueryClient() // Created every render!
  return <QueryClientProvider client={queryClient}>...</QueryClientProvider>
}

// GOOD - stable instance
const queryClient = new QueryClient()
function App() {
  return <QueryClientProvider client={queryClient}>...</QueryClientProvider>
}
```

### 5. Not Canceling Queries in Optimistic Updates

```typescript
// BAD
onMutate: async (newTodo) => {
  queryClient.setQueryData(['todos'], [...todos, newTodo])
}

// GOOD - cancel first
onMutate: async (newTodo) => {
  await queryClient.cancelQueries({ queryKey: ['todos'] })
  queryClient.setQueryData(['todos'], [...todos, newTodo])
}
```
