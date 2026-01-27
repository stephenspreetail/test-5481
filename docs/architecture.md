# Kova Architecture

This doc describes how the Kova web application works at a high-level. If something is out of date, please feel free to suggest a change via a pull request.

## Overview

Kova is an AI app builder (like Lovable, v0, or Bolt) that allows users to build apps using Claude Agent SDK. It runs as a web application with a Node.js backend and PostgreSQL database.

## Web Architecture

Kova uses a standard web application architecture with clear separation between frontend and backend:

### Frontend (React SPA)

- **Framework**: React 19 with TanStack Router
- **State Management**: TanStack Query for server state, Jotai for client state
- **Styling**: Tailwind CSS v4 with Radix UI components
- **Build Tool**: Vite (serves on port 5174 in development)
- **API Communication**: HTTP requests and WebSocket connections to the backend

### Backend (Fastify Server)

- **Framework**: Fastify Node.js server (runs on port 3002)
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: JWT-based auth with access/refresh tokens
- **Real-time**: WebSocket support for streaming LLM responses and app output
- **App Preview Containers**: Spawns per-app preview containers via Docker-compatible APIs (Docker Desktop / Podman)

### Infrastructure

- **Reverse Proxy**: Traefik (port 8081) for routing app previews (e.g., `http://app-{id}.localhost:8081`)
- **Database**: PostgreSQL 16 for persistent storage
- **App Containers**: A per-app container image (`kova-app-container:latest`) run per app in an isolated container

### Container Strategy & Preview Routing (Traefik)

Kova runs each generated app in its own container (named `app-{appId}`) and uses Traefik as a reverse proxy to route preview traffic to the correct container.

Key pieces:

1. **Shared network**

   - Traefik and all app preview containers join the same bridge network (default: `kova-network`).
   - Because they share a network, Traefik can reach containers by name (e.g., `http://app-123:3000`).

2. **Traefik entrypoint and hostnames**

   - Traefik listens on the `preview` entrypoint at port **8081**.
   - Previews are addressed by hostname: `http://app-{appId}.localhost:8081`.
   - The Traefik dashboard is exposed at `http://traefik.localhost:8081` (development-only / insecure dashboard).

3. **Dynamic routes via Docker labels**

   - Traefik uses the Docker provider to auto-discover routes via container labels.
   - When the backend creates app containers, it adds Traefik labels for routing.
   - Each router rule maps a host like `Host(\`app-123.localhost\`)` to the container's dev server port.

4. **Container ports**
   - Inside the app container, the dev server listens on port **3000** (this is what Traefik routes to).
   - The agent server listens on port **3100** and is typically bound to a host port for backend-to-agent communication.

In development, Traefik runs as a container (see `docker-compose.yml`) and discovers app containers via the Docker socket.

### Client-Server Communication

The frontend communicates with the backend using:

1. **REST API** (`/api/*` endpoints) - For CRUD operations on apps, chats, settings, etc.
2. **WebSocket** (`/ws` endpoint) - For real-time features:
   - `chat:stream` - Streaming LLM responses
   - `chat:cancel` - Cancelling in-progress requests
   - `app:input` - Sending input to running app containers
   - `subscribe:app` / `unsubscribe:app` - Subscribing to app output streams

The frontend uses a client factory pattern (`src/client/api/client_factory.ts`) to abstract API calls:

```typescript
import { getClient } from "@/client/api/client_factory";

const client = getClient();
const apps = await client.listApps();
```

### Data Fetching & Caching Architecture

The frontend uses TanStack Query for data fetching with automatic caching and request deduplication. This prevents redundant API calls when multiple components need the same data.

**How it works:**

```
Component A calls useLoadApps()  ──┐
                                   ├──► Same queryKey ["apps"]
Component B calls useLoadApps()  ──┤         │
                                   │         ▼
Component C calls useLoadApps()  ──┘    Single API call
                                              │
                                              ▼
                                    All 3 components get
                                    the same cached result
```

**Key hooks and their cache configuration:**

| Hook | Query Key | staleTime | Purpose |
|------|-----------|-----------|---------|
| `useLoadApps()` | `["apps"]` | 2 min | App list |
| `useSettings()` | `["settings"]` | 5 min | User settings |
| `useChats(appId)` | `["chats", appId]` | 1 min | Chat list |

**Cache behavior:**

- `staleTime`: How long data is considered "fresh" (no refetch on access)
- `gcTime`: How long unused data stays in cache (default 30 min)
- Multiple hook instances share the same cached data via matching query keys

**Real-time updates via WebSocket:**

WebSocket handlers update the cache directly for instant UI updates:

```
                    ┌─────────────────────────────────┐
                    │         TanStack Query          │
                    │            Cache                │
                    └─────────────────────────────────┘
                           ▲                 │
        setQueryData       │                 │  staleTime controls
        (WebSocket push)   │                 │  when this happens
                           │                 ▼
                    ┌──────┴──────┐   ┌──────────────┐
                    │  WebSocket  │   │  HTTP fetch  │
                    └─────────────┘   └──────────────┘
```

- `staleTime` controls *outbound* requests ("don't poll server for X minutes")
- `setQueryData` handles *inbound* updates ("server pushed new data, update cache now")

These work together: WebSocket pushes provide instant updates, while staleTime prevents redundant polling.

**Example: App name update via WebSocket**

```typescript
// In useLoadApps.ts
const handleAppNameUpdate = useCallback(
  (appId: number, name: string) => {
    queryClient.setQueryData(appsQueryKey, (oldData) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        apps: oldData.apps.map((app) =>
          app.id === appId ? { ...app, name } : app
        ),
      };
    });
  },
  [queryClient],
);

// Subscribe to WebSocket updates
useEffect(() => {
  const wsClient = WebSocketClient.getInstance();
  return wsClient.onAppNameUpdate(handleAppNameUpdate);
}, [handleAppNameUpdate]);
```

**State management split:**

- **TanStack Query**: Server state (apps, chats, settings) - cached, deduped, synced
- **Jotai atoms**: Client state (selected app ID, UI state) - local, ephemeral

## Life of a request

The core workflow of Kova is that a user sends a prompt to the AI which edits the code and is reflected in the preview. We'll break this down step-by-step.

1. **Forwarding to the App Container** - When a user sends a prompt, the backend forwards it to the app's container via HTTP POST to `/query`. The container runs `kovaQuery()` from the `@kova/agent` package, which wraps the Claude Agent SDK with Spreetail-specific defaults (system prompts, tools, MCP servers).

2. **Stream the agent response to the UI** - The container streams events via SSE (Server-Sent Events) back to the backend, which translates them to WebSocket messages for the frontend. This provides real-time visual feedback showing tool calls and their results.

3. **Agent executes tools autonomously** - The Claude Agent autonomously decides which tools to use and executes them directly. For example, it might read existing files to understand the codebase, then write new files or edit existing ones to implement the requested feature. It also has access to skills (xlsx, data-platform) and MCP servers (data-catalog).

4. **App Preview** - When changes are made, the backend ensures there is a running app container for that app (container name `app-{appId}`), and Traefik routes `http://app-{appId}.localhost:8081` to that container's dev server (port 3000 on the shared `kova-network`).

To recap, Kova uses `@kova/agent` (which wraps the Claude Agent SDK) to give the AI direct access to file operations, shell commands, skills, and MCP servers. The agent autonomously implements the requested changes, and the backend manages app containers for live preview.

## Key Directories

```
├── packages/
│   └── agent/                # @kova/agent - Standalone AI agent package
│       └── src/
│           ├── core/         # kovaQuery() - thin wrapper around Claude Agent SDK
│           ├── config/       # System prompts, defaults, credentials
│           ├── tools/        # Tool presets and constants
│           ├── projects/     # XDG-compliant project management
│           ├── data-platform/ # Trino client, metadata search, MCP server
│           ├── skills/       # Bundled skills (xlsx, data-platform, etc.)
│           └── cli/          # Ink-based terminal UI
│
├── src/                      # Frontend React application
│   ├── client/api/           # API client layer
│   │   ├── client_factory.ts # Factory that returns ApiClient
│   │   ├── client_interface.ts # Interface definition
│   │   ├── api_client.ts     # HTTP/WebSocket client
│   │   └── websocket_client.ts # WebSocket client for streaming
│   ├── components/           # React components
│   ├── routes/               # TanStack Router page components
│   ├── hooks/                # React hooks (most use TanStack Query)
│   └── atoms/                # Jotai atoms for global state
│
├── backend/                  # Backend Fastify server
│   └── src/
│       ├── api/routes/       # REST API endpoints
│       ├── websocket/        # WebSocket handlers for streaming
│       ├── services/         # Business logic services
│       │   ├── app-container.service.ts # Spawns/monitors app preview containers
│       │   └── orchestrator/ # Container orchestration abstractions
│       ├── db/               # Drizzle ORM with PostgreSQL schema
│       └── config/           # Server configuration
│
├── app-container/            # Docker image for running user apps (uses @kova/agent)
├── traefik/                  # Traefik reverse proxy configuration (static + dynamic)
└── docker-compose.yml        # Development infrastructure
```

## FAQ

### Why use the Claude Agent SDK?

Kova uses the Claude Agent SDK for its AI capabilities. This provides several benefits:

1. **Native tool calling** - The agent has direct access to tools (file operations, code search, shell commands) rather than simulating them with XML-like syntax.
2. **Autonomous execution** - The agent can decide which tools to use and execute them directly, without requiring user approval for each step.
3. **MCP support** - The Claude Agent SDK supports MCP (Model Context Protocol), allowing integration with additional tools and services.
