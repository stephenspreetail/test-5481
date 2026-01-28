---
name: init-project
description: Initialize a new TanStack Start project with React, TypeScript, Vite, and Spreeform. Use when creating a new app, starting from scratch, or when the user mentions "new project", "initialize", "scaffold", "create app", or "start fresh".
---

# Initialize New Project

This skill initializes a new TanStack Start project using Spreetail's pre-configured template.

## Quick Start

### 1. Copy Template Files

Copy all files from the template directory to your project. The template is located at `.claude/templates/tanstack-start/`:

```bash
cp -r .claude/templates/tanstack-start/* .
cp .claude/templates/tanstack-start/.gitignore .
cp -r .claude/templates/tanstack-start/.vscode .
```

**IMPORTANT**: The template is automatically copied to `.claude/templates/` when the agent starts. Always use this path.

### 2. Rename Template Files

```bash
mv package.json.template package.json
mv README.md.template README.md
```

### 3. Substitute Project Name

Replace `{{PROJECT_NAME}}` with the actual project name in these files:
- `package.json`
- `README.md`
- `src/routes/__root.tsx`
- `src/routes/index.tsx`
- `public/manifest.json`

```bash
PROJECT_NAME="my-app"
sed -i '' "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" package.json README.md src/routes/__root.tsx src/routes/index.tsx public/manifest.json
```

### 4. Install Dependencies

```bash
bun install
```

### 5. Start Development

```bash
bun dev
```

The app will be available at http://localhost:3000

## What's Pre-Configured

The template includes everything needed for a Spreetail app:

| Feature | Status |
|---------|--------|
| TanStack Start | Configured |
| TanStack Router | File-based routing ready |
| TanStack Query | QueryClientProvider in __root.tsx |
| Spreeform | Installed and CSS configured |
| Tailwind CSS v4 | Vite plugin configured |
| TypeScript | Strict mode enabled |
| 404 Page | notFoundComponent configured |

## Project Structure

```
project/
├── package.json          # Dependencies and scripts
├── vite.config.ts        # Vite with Tailwind plugin
├── tsconfig.json         # TypeScript config
├── .gitignore            # Git ignore rules
├── .vscode/              # VS Code settings
├── public/               # Static assets
│   └── robots.txt
├── src/
│   ├── router.tsx        # Router configuration
│   ├── styles.css        # Tailwind + Spreeform imports
│   ├── components/       # UI components (create as needed)
│   ├── server/           # Server functions (create as needed)
│   └── routes/
│       ├── __root.tsx    # Root layout with QueryClientProvider
│       └── index.tsx     # Home page
└── README.md             # Project documentation
```

## TanStack Start API Patterns

### CRITICAL: Common Mistakes to Avoid

| Wrong | Correct |
|-------|---------|
| `import { ... } from '@tanstack/start'` | `import { ... } from '@tanstack/react-start'` |
| `.validator()` | `.inputValidator()` |

### Server Functions

```typescript
import { createServerFn } from '@tanstack/react-start'

// GET request (no input)
const getData = createServerFn({ method: 'GET' })
  .handler(async () => {
    const data = await fetchFromDatabase()
    return data
  })

// POST request with validation
const submitData = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    await saveToDatabase(data)
    return { success: true }
  })
```

### Using Server Functions with TanStack Query

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

function MyComponent() {
  const queryClient = useQueryClient()

  // Fetch data
  const { data, isLoading } = useQuery({
    queryKey: ['items'],
    queryFn: () => getData(),
  })

  // Mutate data
  const mutation = useMutation({
    mutationFn: submitData,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })

  return (
    <button onClick={() => mutation.mutate({ name: 'New Item' })}>
      Add Item
    </button>
  )
}
```

## File-Based Routing

TanStack Start uses file-based routing in `src/routes/`:

| File | Route |
|------|-------|
| `index.tsx` | `/` |
| `about.tsx` | `/about` |
| `users/index.tsx` | `/users` |
| `users/$id.tsx` | `/users/:id` (dynamic) |
| `__root.tsx` | Layout wrapper |

### Route Example

```tsx
// src/routes/users/$id.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/users/$id')({
  component: UserPage,
  loader: async ({ params }) => {
    return await fetchUser(params.id)
  },
})

function UserPage() {
  const user = Route.useLoaderData()
  return <div>{user.name}</div>
}
```

## Adding Spreeform Page Layout

For a full app with sidebar, update `src/routes/__root.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import {
  Page, PageBody, PageContainer,
  Sidebar, SidebarContent, SidebarHeader, SidebarMenu,
  SidebarMenuItem, SidebarMenuButton, SidebarProvider,
  ThemeProvider, Toaster
} from '@spreetail/spreeform'

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
  component: RootComponent,
  notFoundComponent: () => <div>Page not found</div>,
  shellComponent: RootDocument,
})

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system">
        <SidebarProvider>
          <Sidebar>
            <SidebarHeader>My App</SidebarHeader>
            <SidebarContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <a href="/">Dashboard</a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarContent>
          </Sidebar>
          <Page>
            <PageBody>
              <PageContainer>
                <Outlet />
              </PageContainer>
            </PageBody>
          </Page>
        </SidebarProvider>
        <Toaster />
      </ThemeProvider>
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

## Architecture Guidelines

1. **Server functions** for all backend operations (database, external APIs)
2. **File-based routing** in `src/routes/`
3. **UI components** in `src/components/`
4. **Server code** in `src/server/`
5. **Types** can go in `src/types/` or colocated with components

## Checklist

- [ ] Copy template files to project directory
- [ ] Rename `.template` files (package.json, README.md)
- [ ] Replace `{{PROJECT_NAME}}` with actual project name
- [ ] Run `bun install`
- [ ] Run `bun dev` to verify setup
- [ ] Create `src/components/` directory as needed
- [ ] Create `src/server/` directory for server functions

## Template Info

- **Template Version**: 1.0.0
- **Location**: `.claude/templates/tanstack-start/` (copied automatically at runtime)
- **Last Updated**: 2026-01-27

## Related Skills

- **/tanstack** - Detailed TanStack Start, Router, Query, and Table patterns
- **/spreeform** - Spreeform component library reference

## Maintenance

- **/refresh-template** - Project-level command to update template dependencies
