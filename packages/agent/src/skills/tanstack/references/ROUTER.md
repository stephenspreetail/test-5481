# TanStack Router Reference

> **Version:** 1.x | **Updated:** 2026-01-27

TanStack Router is a fully type-safe React router with built-in data loading, search param validation, and file-based routing.

## Installation

```bash
bun add @tanstack/react-router

# For file-based routing with Vite
bun add -D @tanstack/router-plugin @tanstack/router-devtools
```

## File-Based Routing

### Vite Plugin Setup

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
  ],
})
```

### File Naming Conventions

| File Pattern | Route Path | Description |
|-------------|-----------|-------------|
| `__root.tsx` | N/A | Root layout (required) |
| `index.tsx` | `/` | Index/home route |
| `about.tsx` | `/about` | Static route |
| `$postId.tsx` | `/$postId` | Dynamic segment |
| `posts.$postId.tsx` | `/posts/$postId` | Nested dynamic (flat) |
| `_layout.tsx` | N/A | Pathless layout |
| `posts_.edit.tsx` | `/posts/edit` | Non-nested route |
| `-ignored.tsx` | N/A | Ignored file |
| `(group)/` | N/A | Route group (organizational) |

### Directory Structure Example

```
src/routes/
├── __root.tsx              # Root layout (required)
├── index.tsx               # / (home page)
├── about.tsx               # /about
├── posts/
│   ├── index.tsx           # /posts
│   ├── $postId.tsx         # /posts/$postId
│   └── $postId.edit.tsx    # /posts/$postId/edit
├── _auth/                  # Pathless layout for auth pages
│   ├── route.tsx           # Layout component
│   ├── login.tsx           # /login
│   └── register.tsx        # /register
├── _authenticated/         # Pathless layout for protected routes
│   ├── route.tsx           # Auth guard layout
│   └── dashboard.tsx       # /dashboard
└── -components/            # Ignored directory
    └── shared.tsx          # Not a route
```

## Route Configuration

### Root Route

```typescript
// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </>
  )
}
```

### Root Route with Context

```typescript
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})
```

### TanStack Start Root Route (SSR)

TanStack Start projects use `shellComponent` for the HTML document structure:

```typescript
// src/routes/__root.tsx (TanStack Start pattern)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'

import appCss from '../styles.css?url'

const queryClient = new QueryClient()

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'My App' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),

  // component wraps route content with providers
  component: RootComponent,

  notFoundComponent: () => <div>Page not found</div>,

  // shellComponent defines the HTML document structure
  shellComponent: RootDocument,
})

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
```

**Important**: The TanStack Start CLI generates `shellComponent` but NOT `component`. You must add `component` to wrap routes with providers like `QueryClientProvider`.

### File Route

```typescript
// src/routes/posts/$postId.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    return fetchPost(params.postId)
  },
  component: PostComponent,
  pendingComponent: LoadingComponent,
  errorComponent: ErrorComponent,
  notFoundComponent: NotFoundComponent,
})

function PostComponent() {
  const post = Route.useLoaderData()
  return <article>{post.title}</article>
}
```

### Route Options Reference

```typescript
export const Route = createFileRoute('/path')({
  // Data loading
  beforeLoad: async ({ context, params, search }) => { /* ... */ },
  loader: async ({ context, params, search, abortController }) => { /* ... */ },
  loaderDeps: ({ search }) => ({ page: search.page }),

  // Components
  component: Component,
  pendingComponent: PendingComponent,
  errorComponent: ErrorComponent,
  notFoundComponent: NotFoundComponent,

  // Search params
  validateSearch: (search) => ({ /* validated search */ }),

  // Loading behavior
  pendingMs: 1000,
  pendingMinMs: 500,
  staleTime: 30000,
  gcTime: 300000,

  // SSR (TanStack Start)
  ssr: true,  // true | false | 'data-only'

  // Static data
  staticData: { breadcrumb: 'Posts' },
})
```

## Data Loading

### beforeLoad

Runs before loader, used for auth, redirects, context injection:

```typescript
export const Route = createFileRoute('/dashboard')({
  beforeLoad: async ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }

    return {
      user: await fetchUser(context.auth.userId),
    }
  },
})
```

### loader

Fetches data for the route, runs in parallel with siblings:

```typescript
export const Route = createFileRoute('/posts')({
  loader: async ({ context, params, abortController }) => {
    const response = await fetch(`/api/posts/${params.postId}`, {
      signal: abortController.signal,
    })
    return response.json()
  },
  component: PostsComponent,
})

function PostsComponent() {
  const posts = Route.useLoaderData()
  return <PostsList posts={posts} />
}
```

### loaderDeps (Cache Invalidation)

```typescript
export const Route = createFileRoute('/posts')({
  loaderDeps: ({ search }) => ({
    page: search.page,
    filter: search.filter,
  }),
  loader: async ({ deps }) => {
    return fetchPosts({ page: deps.page, filter: deps.filter })
  },
})
```

### Using with TanStack Query

```typescript
import { queryOptions } from '@tanstack/react-query'

const postsQueryOptions = (page: number) =>
  queryOptions({
    queryKey: ['posts', page],
    queryFn: () => fetchPosts(page),
  })

export const Route = createFileRoute('/posts')({
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(postsQueryOptions(deps.page))
  },
  component: PostsComponent,
})

function PostsComponent() {
  const { page } = Route.useSearch()
  const { data: posts } = useSuspenseQuery(postsQueryOptions(page))
  return <PostsList posts={posts} />
}
```

## Navigation

### Link Component

```typescript
import { Link } from '@tanstack/react-router'

// Static route
<Link to="/about">About</Link>

// With params
<Link to="/posts/$postId" params={{ postId: '123' }}>
  View Post
</Link>

// With search params
<Link to="/posts" search={{ page: 2, filter: 'recent' }}>
  Recent Posts
</Link>

// Preserve existing search params
<Link to="/posts" search={(prev) => ({ ...prev, page: 2 })}>
  Page 2
</Link>

// Active link styling
<Link
  to="/posts"
  activeProps={{ className: 'active' }}
  inactiveProps={{ className: 'inactive' }}
>
  Posts
</Link>
```

### useNavigate Hook

```typescript
import { useNavigate } from '@tanstack/react-router'

function SearchForm() {
  const navigate = useNavigate()

  const handleSubmit = (query: string) => {
    navigate({
      to: '/search',
      search: { q: query },
    })
  }

  // Navigate with replacement
  const handleReplace = () => {
    navigate({
      to: '/posts',
      replace: true,
    })
  }
}
```

## Search Params

### Basic Validation

```typescript
type ProductSearch = {
  page: number
  filter: string
  sort: 'newest' | 'oldest' | 'price'
}

export const Route = createFileRoute('/products')({
  validateSearch: (search: Record<string, unknown>): ProductSearch => ({
    page: Number(search?.page ?? 1),
    filter: (search.filter as string) || '',
    sort: (search.sort as ProductSearch['sort']) || 'newest',
  }),
  component: ProductsComponent,
})

function ProductsComponent() {
  const { page, filter, sort } = Route.useSearch()
  // All fully typed!
}
```

### Validation with Zod

```typescript
import { zodValidator, fallback } from '@tanstack/zod-adapter'
import { z } from 'zod'

const searchSchema = z.object({
  page: fallback(z.number(), 1).default(1),
  q: fallback(z.string(), '').default(''),
  category: fallback(z.enum(['all', 'tech', 'design']), 'all').default('all'),
})

export const Route = createFileRoute('/search')({
  validateSearch: zodValidator(searchSchema),
  component: SearchComponent,
})
```

### Updating Search Params

```typescript
import { useNavigate } from '@tanstack/react-router'

function Filters() {
  const navigate = useNavigate({ from: '/products' })

  const setPage = (newPage: number) => {
    navigate({
      search: (prev) => ({ ...prev, page: newPage }),
    })
  }
}
```

## Path Params

### Defining Dynamic Routes

```typescript
// src/routes/posts/$postId.tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    // params.postId is typed as string
    return fetchPost(params.postId)
  },
})
```

### Multiple Dynamic Segments

```typescript
// src/routes/users/$userId/posts/$postId.tsx
export const Route = createFileRoute('/users/$userId/posts/$postId')({
  loader: async ({ params }) => {
    // params: { userId: string, postId: string }
    return fetchUserPost(params.userId, params.postId)
  },
})
```

### useParams Hook

```typescript
function PostComponent() {
  const { postId } = Route.useParams()
}

// Or for deep components
import { getRouteApi } from '@tanstack/react-router'

const routeApi = getRouteApi('/posts/$postId')

function DeepComponent() {
  const { postId } = routeApi.useParams()
}
```

## Nested Layouts

### Layout Routes

```typescript
// src/routes/dashboard/route.tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard')({
  component: DashboardLayout,
})

function DashboardLayout() {
  return (
    <div className="dashboard-layout">
      <aside>
        <nav>
          <Link to="/dashboard">Overview</Link>
          <Link to="/dashboard/analytics">Analytics</Link>
        </nav>
      </aside>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
```

### Pathless Layout Routes

Apply layouts without affecting URL path (prefix with `_`):

```typescript
// src/routes/_auth/route.tsx
export const Route = createFileRoute('/_auth')({
  component: AuthLayout,
})

function AuthLayout() {
  return (
    <div className="auth-layout">
      <div className="auth-card">
        <Outlet />
      </div>
    </div>
  )
}

// src/routes/_auth/login.tsx -> URL: /login
// src/routes/_auth/register.tsx -> URL: /register
```

## Protected Routes

### Basic Authentication Guard

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

### Post-Login Redirect

```typescript
// src/routes/_auth/login.tsx
export const Route = createFileRoute('/_auth/login')({
  validateSearch: (search) => ({
    redirect: (search.redirect as string) || '/',
  }),
  component: LoginComponent,
})

function LoginComponent() {
  const { redirect } = Route.useSearch()
  const navigate = useNavigate()

  const handleLogin = async (credentials: Credentials) => {
    await login(credentials)
    navigate({ to: redirect })
  }
}
```

## Error Handling

### Route-Level Error Component

```typescript
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)
    if (!post) throw new Error('Post not found')
    return post
  },
  errorComponent: PostErrorComponent,
})

function PostErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <div className="error">
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
```

### Not Found Handling

```typescript
import { createFileRoute, notFound } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)
    if (!post) throw notFound()
    return post
  },
  notFoundComponent: () => (
    <div>
      <h2>Post not found</h2>
      <Link to="/posts">Back to posts</Link>
    </div>
  ),
})
```

## Loading States

### Pending Component

```typescript
export const Route = createFileRoute('/posts')({
  loader: async () => {
    await new Promise((r) => setTimeout(r, 2000))
    return fetchPosts()
  },
  pendingComponent: PostsLoading,
  pendingMs: 500,      // Show loading after 500ms
  pendingMinMs: 200,   // Show for at least 200ms
})

function PostsLoading() {
  return (
    <div className="loading">
      <Spinner />
      <p>Loading posts...</p>
    </div>
  )
}
```

### Deferred Data Loading

```typescript
import { defer, Await } from '@tanstack/react-router'
import { Suspense } from 'react'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId) // Critical
    const commentsPromise = fetchComments(params.postId) // Deferred

    return {
      post,
      comments: defer(commentsPromise),
    }
  },
  component: PostComponent,
})

function PostComponent() {
  const { post, comments } = Route.useLoaderData()

  return (
    <article>
      <h1>{post.title}</h1>
      <Suspense fallback={<p>Loading comments...</p>}>
        <Await promise={comments}>
          {(resolvedComments) => <CommentsList comments={resolvedComments} />}
        </Await>
      </Suspense>
    </article>
  )
}
```

## Type Registration

Register your router for global type safety:

```typescript
// src/router.ts
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  context: {
    queryClient: undefined!,
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

This enables:
- Type-safe `<Link to="...">` with autocomplete
- Type-safe `useNavigate()` with proper params/search types
- Type-safe `useParams()` and `useSearch()` globally
