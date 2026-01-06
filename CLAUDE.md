# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kova is an AI app builder (like Lovable, v0, or Bolt) that allows users to build apps using AI with their own API keys. It runs as a web application with a Node.js backend and PostgreSQL database.

## Container Runtime

**This project uses Podman, NOT Docker.** Use `podman` and `podman-compose` commands instead of `docker` and `docker-compose`.

```sh
# Build the app-container image
podman-compose build app-container

# Start services
podman-compose up postgres -d
```

## Development Commands

```sh
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend && npm install && cd ..

# Start PostgreSQL (requires Podman)
podman-compose up postgres -d

# Run database migrations
cd backend && npm run db:push && cd ..

# Development (run both frontend and backend)
npm run dev:full        # Runs backend on :3002 and frontend on :5174

# Or run separately:
npm run dev:backend     # Backend API server on :3002
npm run dev:web         # Frontend dev server on :5174

# Build for production
npm run build:web       # Build frontend to dist/web/
npm run build:backend   # Build backend

# Run with Podman Compose (full stack)
podman-compose up       # Starts postgres, backend, and frontend

# Type checking
npm run ts              # Check TypeScript types

# Linting and formatting
npm run lint            # Run oxlint with auto-fix
npm run lint:fix        # Run oxlint with aggressive fixes
npm run prettier        # Format code
npm run presubmit       # Run before submitting (prettier:check + lint)

# Testing
npm test                # Run unit tests once
npm run test:watch      # Run tests in watch mode
npm run test:ui         # Run tests with UI

# Setup pre-commit hooks
npm run init-precommit
```

### Backend Environment Setup

Copy `backend/.env.example` to `backend/.env` and configure:

```sh
DATABASE_URL=postgresql://kova:kova_dev_password@localhost:5432/kova
JWT_SECRET=your_jwt_secret_at_least_32_chars
JWT_REFRESH_SECRET=your_refresh_secret_at_least_32_chars
ENCRYPTION_KEY=your_64_char_hex_encryption_key
```

## Architecture

### Overview

- **Frontend**: React SPA served by Vite
- **Backend**: Fastify Node.js server with REST API + WebSocket
- Communication via HTTP/WebSocket
- Database: PostgreSQL with Drizzle ORM

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
- `src/routes/` - TanStack Router page components
- `src/hooks/` - React hooks (most use TanStack Query + client factory)
- `src/atoms/` - Jotai atoms for global state
- `src/components/` - React components

### LLM Integration Pattern

Kova uses the Claude Agent SDK for AI-powered code generation. The agent has access to tools like:

- File operations (read, write, edit, delete)
- Code search (glob, grep)
- Shell execution (npm install, etc.)

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

### Tech Stack

- React 19 with TanStack Router (NOT Next.js or React Router)
- TanStack Query for data fetching/caching
- Jotai for global state
- Drizzle ORM with PostgreSQL
- Tailwind CSS v4
- Radix UI components
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
