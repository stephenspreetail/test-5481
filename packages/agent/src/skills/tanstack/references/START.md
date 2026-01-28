# TanStack Start Reference

> **Version:** 1.x | **Updated:** 2026-01-27

TanStack Start is a full-stack React framework built on TanStack Router providing SSR, streaming, and server functions.

## Server Functions (createServerFn)

### Correct Import Path

```typescript
// CORRECT
import { createServerFn } from '@tanstack/react-start'

// WRONG - outdated
import { createServerFn } from '@tanstack/start'
```

### Basic Syntax

```typescript
import { createServerFn } from '@tanstack/react-start'

// GET request (default)
export const getData = createServerFn().handler(async () => {
  return { message: 'Hello from server!' }
})

// Explicit GET method
export const getUser = createServerFn({ method: 'GET' }).handler(async () => {
  return await db.users.findFirst()
})

// POST request for mutations
export const createUser = createServerFn({ method: 'POST' }).handler(async () => {
  return await db.users.create({ data: { name: 'New User' } })
})
```

### Input Validation

Use `inputValidator` (not `validator`):

```typescript
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

// Simple function validator
export const greetUser = createServerFn({ method: 'GET' })
  .inputValidator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    return `Hello, ${data.name}!`
  })

// Zod schema validator
const UserSchema = z.object({
  name: z.string().min(1),
  age: z.number().min(0),
})

export const createUser = createServerFn({ method: 'POST' })
  .inputValidator(UserSchema)
  .handler(async ({ data }) => {
    // data is typed as { name: string; age: number }
    return `Created user: ${data.name}, age ${data.age}`
  })
```

### FormData Validation

```typescript
export const submitForm = createServerFn({ method: 'POST' })
  .inputValidator((data) => {
    if (!(data instanceof FormData)) {
      throw new Error('Expected FormData')
    }
    return {
      name: data.get('name')?.toString() || '',
      email: data.get('email')?.toString() || '',
    }
  })
  .handler(async ({ data }) => {
    return { success: true }
  })
```

## Middleware

### Creating Middleware

```typescript
import { createMiddleware } from '@tanstack/react-start'

export const loggingMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    console.log('Request started')
    const result = await next()
    console.log('Request completed')
    return result
  }
)
```

### Authentication Middleware

```typescript
import { redirect } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'

export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const session = await getUserSession()

    if (!session) {
      throw redirect({ to: '/login' })
    }

    return next({ context: { session } })
  }
)
```

### Using Middleware with Server Functions

```typescript
export const getProtectedData = createServerFn()
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { session } = context
    return await db.data.findMany({ where: { userId: session.user.id } })
  })
```

## Server Routes (API Routes)

### Creating API Routes

```typescript
// routes/api/hello.ts
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/hello')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return Response.json({ message: 'Hello!' })
      },
    },
  },
})
```

### Multiple HTTP Methods

```typescript
// routes/api/users.ts
export const Route = createFileRoute('/api/users')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const users = await db.users.findMany()
        return Response.json(users)
      },
      POST: async ({ request }) => {
        const body = await request.json()
        const user = await db.users.create({ data: body })
        return Response.json(user, { status: 201 })
      },
    },
  },
})
```

### Dynamic Parameters

```typescript
// routes/api/users/$id.ts
export const Route = createFileRoute('/api/users/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const user = await db.users.findUnique({ where: { id: params.id } })
        if (!user) {
          return new Response('Not found', { status: 404 })
        }
        return Response.json(user)
      },
    },
  },
})
```

## Environment Variables

### Server-Side Access

Server functions can safely access any environment variable:

```typescript
export const connectToDatabase = createServerFn().handler(async () => {
  const connectionString = process.env.DATABASE_URL // Safe - server only
  const apiKey = process.env.EXTERNAL_API_SECRET    // Safe - server only
  return await database.connect(connectionString)
})
```

### Client-Side Access

Client code can only access variables prefixed with `VITE_`:

```typescript
const apiUrl = import.meta.env.VITE_PUBLIC_API_URL // OK
const secret = process.env.DATABASE_URL            // UNDEFINED on client
```

### CRITICAL: Loaders Are Isomorphic

Loaders run on BOTH server and client. Never access secrets directly:

```typescript
// WRONG - Exposes secret to client!
export const Route = createFileRoute('/users')({
  loader: () => {
    const secret = process.env.SECRET // Gets sent to client!
    return fetch(`/api/users?key=${secret}`)
  },
})

// CORRECT - Use server function
const fetchUsers = createServerFn().handler(async () => {
  const secret = process.env.SECRET // Server only
  return fetch(`/api/users?key=${secret}`).then(r => r.json())
})

export const Route = createFileRoute('/users')({
  loader: () => fetchUsers(),
})
```

## Request/Response Handling

### Accessing Request Information

```typescript
import { createServerFn } from '@tanstack/react-start'
import {
  getRequest,
  getRequestHeaders,
  getRequestHeader,
  getRequestIP,
} from '@tanstack/react-start/server'

export const getRequestInfo = createServerFn().handler(async () => {
  const request = getRequest()
  const headers = getRequestHeaders()
  const authHeader = getRequestHeader('Authorization')
  const clientIP = getRequestIP()

  return { method: request.method, url: request.url, clientIP }
})
```

### Setting Response Headers

```typescript
import {
  setResponseHeaders,
  setResponseStatus,
} from '@tanstack/react-start/server'

export const getCachedData = createServerFn().handler(async () => {
  setResponseHeaders(
    new Headers({
      'Cache-Control': 'public, max-age=300',
    })
  )
  return await fetchExpensiveData()
})
```

## Error Handling

### Throwing Errors

```typescript
import { createServerFn } from '@tanstack/react-start'
import { redirect, notFound } from '@tanstack/react-router'

export const getPost = createServerFn({ method: 'GET' })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const post = await db.posts.findUnique({ where: { id: data.id } })

    if (!post) {
      throw notFound()
    }

    if (post.isDraft && !isAdmin()) {
      throw redirect({ to: '/posts' })
    }

    return post
  })
```

### JSON Error Responses

```typescript
import { json } from '@tanstack/react-start'

export const validateInput = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw json({ message: 'Invalid input' }, { status: 400 })
    }
    return data as Record<string, unknown>
  })
  .handler(async ({ data }) => {
    return { success: true }
  })
```

## SSR Patterns

### Selective SSR

```typescript
export const Route = createFileRoute('/heavy-page')({
  ssr: false, // Disable SSR for this route
  loader: async () => {
    return await fetchData() // Only runs on client
  },
})
```

### Client-Only Components

```typescript
import { ClientOnly } from '@tanstack/react-router'

function MyPage() {
  return (
    <div>
      <h1>My Page</h1>
      <ClientOnly fallback={<div>Loading...</div>}>
        {() => <BrowserOnlyComponent />}
      </ClientOnly>
    </div>
  )
}
```

## Using with TanStack Query

### Server Functions as Query Functions

```typescript
import { createServerFn } from '@tanstack/react-start'
import { queryOptions, useQuery } from '@tanstack/react-query'

export const getUsers = createServerFn({ method: 'GET' }).handler(async () => {
  return await db.users.findMany()
})

export const usersQueryOptions = () =>
  queryOptions({
    queryKey: ['users'],
    queryFn: getUsers,
    staleTime: 1000 * 60 * 5,
  })

function UserList() {
  const { data: users, isLoading } = useQuery(usersQueryOptions())
  if (isLoading) return <div>Loading...</div>
  return (
    <ul>
      {users?.map(user => <li key={user.id}>{user.name}</li>)}
    </ul>
  )
}
```

### Mutations with useServerFn

```typescript
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export const createUser = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; email: string }) => data)
  .handler(async ({ data }) => {
    return await db.users.create({ data })
  })

function CreateUserForm() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: useServerFn(createUser),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      const formData = new FormData(e.currentTarget)
      mutation.mutate({
        data: {
          name: formData.get('name') as string,
          email: formData.get('email') as string,
        }
      })
    }}>
      <input name="name" required />
      <input name="email" type="email" required />
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating...' : 'Create User'}
      </button>
    </form>
  )
}
```

## File Organization

### Recommended Structure

```
src/
├── routes/
│   ├── __root.tsx
│   ├── index.tsx
│   └── users/
│       ├── index.tsx
│       └── $id.tsx
├── lib/
│   ├── api.functions.ts    # Server function exports
│   ├── api.server.ts       # Server-only code
│   └── api.ts              # Shared types/schemas
├── middleware/
│   ├── auth.ts
│   └── logging.ts
└── start.ts                # Global middleware config
```

### File Naming Convention

- `.functions.ts` - Export createServerFn wrappers, safe to import anywhere
- `.server.ts` - Server-only code, only import inside server function handlers
- `.ts` (no suffix) - Client-safe code (types, schemas, constants)

## Quick Reference

### Server Function Chained API

```typescript
createServerFn({ method: 'GET' | 'POST' })
  .middleware([middleware1, middleware2])     // Optional
  .inputValidator(validatorFnOrSchema)        // Optional
  .handler(async ({ data, context }) => {
    return result
  })
```

### Middleware Chained API

```typescript
createMiddleware({ type: 'function' })
  .middleware([parentMiddleware])             // Optional
  .client(async ({ next, context }) => {      // Optional
    return next({ sendContext: { ... } })
  })
  .server(async ({ next, context }) => {      // Required
    return next({ context: { ... } })
  })
```

### Server Route API

```typescript
createFileRoute('/api/path')({
  server: {
    middleware: [middleware],                 // Optional
    handlers: {
      GET: async ({ request, params, context }) => Response,
      POST: async ({ request, params, context }) => Response,
    },
  },
})
```
