# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kova is an AI application builder similar to Lovable and v0. Unlike its counterparts, Kova enables users to develop applications within their organization's existing infrastructure. The platform is a React web application, backed by a Node.js backend and a PostgreSQL database. While some claim that Kova is an acronym for Kit for Operational Value Acceleration, Kova says this is a myth and that the name originates from a grandparent.

## Container Runtime

**Local build instructions are for Podman, NOT Docker.** Use `podman` and `podman compose` commands instead of `docker` and `docker compose`. Feel free to use OCI-compatible alternatives.

```sh
# Build the app-container image
podman compose build app-container

# Start services
podman compose up postgres traefik -d
```

## Development Commands

```sh
# Install dependencies
npm install
cd backend && npm install && cd ..

# Start PostgreSQL
podman compose up postgres -d

# Run database migrations
cd backend && npm run db:push && cd ..

# Development (run both frontend and backend)
npm run dev:full        # Runs backend on :3002 and frontend on :5174

# Or run separately:
npm run dev:backend     # Backend API server on :3002
npm run dev:frontend    # Frontend dev server on :5174

# Build for production
npm run build:frontend  # Build frontend to dist/web/
npm run build:backend   # Build backend

# Type checking
npm run ts              # Check TypeScript types

# Linting and formatting
npm run lint            # Run oxlint with auto-fix
npm run lint:fix        # Run oxlint with aggressive fixes
npm run imports:fix     # Organize imports with Biome
npm run prettier        # Format code
npm run presubmit       # Run before submitting (prettier:check + lint)

# Testing
npm test                # Run unit tests once
npm run test:watch      # Run tests in watch mode
npm run test:ui         # Run tests with UI

# Database
npm run db:push         # Apply schema changes
npm run db:generate     # Generate migration files
npm run db:studio       # Open Drizzle Studio GUI
```

### Backend Environment Setup

Copy `backend/.env.example` to `backend/.env` and configure:

```sh
DATABASE_URL=postgresql://kova:kova_dev_password@localhost:5433/kova
JWT_SECRET=your_jwt_secret_at_least_32_chars
ENCRYPTION_KEY=your_64_char_hex_encryption_key
```

## Architecture

### Overview

- **Frontend**: React SPA served by Vite (port 5174)
- **Backend**: Fastify Node.js server with REST API + WebSocket (port 3002)
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

- `src/client/api/` - API client layer
  - `client_factory.ts` - Factory that returns ApiClient
  - `client_interface.ts` - Interface definition
  - `api_client.ts` - HTTP/WebSocket client
  - `websocket_client.ts` - WebSocket client for streaming
- `backend/` - Backend server (Fastify + PostgreSQL)
  - `src/api/routes/` - REST API endpoints
  - `src/websocket/` - WebSocket handlers for streaming
  - `src/services/` - Core services including Claude Agent SDK integration
  - `src/db/` - Drizzle ORM with PostgreSQL schema
  - `src/prompts/` - System prompts for LLM interactions
- `src/routes/` - TanStack Router page components
- `src/hooks/` - React hooks (most use TanStack Query + client factory)
- `src/atoms/` - Jotai atoms for global state
- `src/components/` - React components
- `app-container/` - Docker image for running user-generated apps

### Client-Server Communication

1. **REST API** (`/api/*`) - CRUD operations on apps, chats, settings
2. **WebSocket** (`/ws`) - Real-time streaming:
   - `chat:stream` - Streaming LLM responses
   - `chat:cancel` - Cancel in-progress requests
   - `subscribe:app` / `unsubscribe:app` - App output streams

### LLM Integration Pattern

Kova uses the Claude Agent SDK for AI-powered code generation. The agent has access to tools like:

- File operations (read, write, edit, delete)
- Code search (glob, grep)
- Shell execution (npm install, etc.)

Flow:
1. User sends a prompt
2. Backend invokes the Claude Agent with codebase context
3. Agent autonomously uses tools to implement the requested changes
4. Response streams to the frontend showing progress
5. Generated app hot-reloads in the preview iframe

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
- AI SDK for LLM providers (Anthropic, OpenAI, Google, Azure, Bedrock, etc.)

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
