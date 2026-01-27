# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kova is an AI application builder similar to Lovable and v0. Unlike its counterparts, Kova enables users to develop applications within their organization's existing infrastructure. The platform is a React web application, backed by a Bun/Fastify backend and a PostgreSQL database. While some claim that Kova is an acronym for Kit for Operational Value Acceleration, Kova says this is a myth and that the name originates from a grandparent.

## Runtime

**This project uses Bun as its JavaScript/TypeScript runtime and package manager.** Use `bun` commands instead of `npm`/`node`. Bun provides built-in TypeScript support and automatic `.env` file loading.

## Container Runtime

Use any OCI-compatible container runtime (Podman, Rancher Desktop, etc.). Commands below use `docker` but work with `podman` too.

```sh
# Build the app-container image
docker compose build app-container

# Start services
docker compose up postgres traefik -d
```

## Development Commands

```sh
# Install dependencies (from root - installs all workspaces)
bun install

# Start PostgreSQL
docker compose up postgres -d

# Run database migrations
bun run db:push

# Development (run both frontend and backend)
bun run dev:full        # Runs backend on :3002 and frontend on :5174

# Or run separately:
bun run dev:backend     # Backend API server on :3002
bun run dev:web         # Frontend dev server on :5174

# Build for production
bun run build:web       # Build frontend to dist/web/
bun run build:backend   # Build backend

# Type checking
bun run ts              # Check TypeScript types

# Linting and formatting
bun run lint            # Run oxlint with auto-fix
bun run lint:fix        # Run oxlint with aggressive fixes
bun run imports:fix     # Organize imports with Biome
bun run prettier        # Format code
bun run presubmit       # Run before submitting (prettier:check + lint)

# Testing
bun test                # Run unit tests once
bun run test:watch      # Run tests in watch mode
bun run test:ui         # Run tests with UI

# Database
bun run db:push         # Apply schema changes
bun run db:generate     # Generate migration files
bun run db:studio       # Open Drizzle Studio GUI
```

### Environment Setup

Copy `.env.example` to `.env` at the repository root and configure:

```sh
cp .env.example .env
```

Required variables:

```sh
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
DATABASE_URL=postgresql://kova:kova_dev_password@localhost:5433/kova
JWT_SECRET=your_jwt_secret_at_least_32_chars
ENCRYPTION_KEY=your_64_char_hex_encryption_key
```

### Agent CLI

```sh
bun run dev:agent            # Run agent CLI (no build needed)
bun run dev:agent -- --help  # Show CLI help

# Production build (for publishing/deployment)
bun run build:agent          # Build the agent package
bun run start:agent          # Run the built version
```

## Architecture

### Overview

- **Frontend**: React SPA served by Vite (port 5174)
- **Backend**: Fastify server running on Bun with REST API + WebSocket (port 3002)
- **Database**: PostgreSQL with Drizzle ORM (port 5433)
- **Preview Proxy**: Traefik routes `app-{id}.localhost:8081` to app containers

### Client Factory Pattern

The frontend uses a client factory to get the API client:

```typescript
import { getClient } from "@/client/api/client_factory";

const client = getClient();
const apps = await client.listApps();
```

### Key Directories

- `packages/agent/` - **@kova/agent** - Standalone AI agent package
  - `src/core/` - `kovaQuery()` - thin wrapper around Claude Agent SDK
  - `src/config/` - System prompts, defaults, credentials
  - `src/tools/` - Tool presets and constants
  - `src/projects/` - XDG-compliant project management
  - `src/data-platform/` - Trino client, metadata search, MCP server
  - `src/skills/` - Bundled skills (xlsx, data-platform, etc.)
  - `src/cli/` - Ink-based terminal UI
- `src/client/api/` - API client layer
  - `client_factory.ts` - Factory that returns ApiClient
  - `client_interface.ts` - Interface definition
  - `api_client.ts` - HTTP/WebSocket client
  - `websocket_client.ts` - WebSocket client for streaming
- `backend/` - Backend server (Fastify + PostgreSQL)
  - `src/api/routes/` - REST API endpoints
  - `src/websocket/` - WebSocket handlers for streaming
  - `src/services/` - Container orchestration, app management
  - `src/db/` - Drizzle ORM with PostgreSQL schema
- `src/routes/` - TanStack Router page components
- `src/hooks/` - React hooks (most use TanStack Query + client factory)
- `src/atoms/` - Jotai atoms for global state
- `src/components/` - React components
- `app-container/` - Docker image for running user-generated apps (uses @kova/agent)

### Client-Server Communication

1. **REST API** (`/api/*`) - CRUD operations on apps, chats, settings
2. **WebSocket** (`/ws`) - Real-time streaming:
   - `chat:stream` - Streaming LLM responses
   - `chat:cancel` - Cancel in-progress requests
   - `subscribe:app` / `unsubscribe:app` - App output streams

### LLM Integration Pattern

Kova uses `@kova/agent` (wrapping the Claude Agent SDK) for AI-powered code generation. The agent has access to tools like:

- File operations (read, write, edit, delete)
- Code search (glob, grep)
- Shell execution (npm install, etc.)
- Skills (xlsx, data-platform, etc.)
- MCP servers (data-catalog for metadata search)

Flow:

1. User sends a prompt via the chat UI
2. Backend forwards the prompt to the app-container via HTTP
3. App-container invokes `kovaQuery()` from `@kova/agent`
4. Agent autonomously uses tools to implement the requested changes
5. Response streams back: container → backend (SSE) → frontend (WebSocket)
6. Generated app hot-reloads in the preview iframe

### Adding New Features

When creating new features that need backend access:

1. **React Hook**: Use `useQuery`/`useMutation` with `getClient()`
2. **API Client**: Add method in `api_client.ts` making HTTP requests
3. **Backend Route**: Add route in `backend/src/api/routes/`
4. **For Streaming**: Use WebSocket handlers in `backend/src/websocket/`

### State Management

- **TanStack Query**: Server state (apps, chats, settings) - cached, deduped, synced
- **Jotai atoms**: Client state (selected app ID, UI state) - local, ephemeral

### Tech Stack

- React 19 with TanStack Router (NOT Next.js or React Router)
- TanStack Query for data fetching/caching
- Jotai for global state
- Drizzle ORM with PostgreSQL
- Tailwind CSS v4
- Radix UI / shadcn/ui components
- **@kova/agent** - Standalone AI agent package (wraps Claude Agent SDK)
- Ink (React for CLI) - Terminal UI for agent CLI

## Testing

- Unit tests use Vitest with happy-dom environment
- Test files: `*.test.ts` or `*.spec.ts` in `src/__tests__/`

### Mocking in Tests

```typescript
// Mock node:fs
vi.mock("node:fs", async () => ({
  default: { mkdirSync: vi.fn(), writeFileSync: vi.fn() },
}));

// Mock isomorphic-git
vi.mock("isomorphic-git", () => ({
  default: { add: vi.fn().mockResolvedValue(undefined) },
}));
```
