# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Known Issues & Fixes

### Corporate VPN + k3d Network Issue

**Problem**: Pods in k3d cannot reach external package registries (npm, apt, etc.) when a corporate VPN with transparent proxy is active.

**Solution**: Use `hostNetwork: true` in pod specs. This allows pods to use the host's network stack, letting the VPN client (Axis) handle split-tunneling automatically for both external (npm) and internal (ProGet) resources.

**Files Modified**:
- `backend/src/services/orchestrator/k8s.orchestrator.ts` - Added `hostNetwork: true`
- `backend/src/services/orchestrator/kubectl.orchestrator.ts` - Added `hostNetwork: true`

## Project Overview

Kova is an AI application builder similar to Lovable and v0. Unlike its counterparts, Kova enables users to develop applications within their organization's existing infrastructure. The platform is a React web application, backed by a Bun/Fastify backend and a PostgreSQL database. While some claim that Kova is an acronym for Kit for Operational Value Acceleration, Kova says this is a myth and that the name originates from a grandparent.

## Runtime

**This project uses Bun as its JavaScript/TypeScript runtime and package manager.** Use `bun` commands instead of `npm`/`node`. Bun provides built-in TypeScript support and automatic `.env` file loading.

## Container Runtime

**For Kubernetes (k3d):**

```sh
# Build and import app-container image into k3d
docker build -f Dockerfile.appcontainer -t kova-app-container:latest .
k3d image import kova-app-container:latest -c kova-dev

# Rebuild after changes to app-container
docker build -f Dockerfile.appcontainer -t kova-app-container:latest . && k3d image import kova-app-container:latest -c kova-dev
```

**For Docker/Podman (legacy):**

```sh
# Build the app-container image
docker compose build app-container

# Start services
docker compose up postgres traefik -d
```

## Quick Start (Local Development)

> Full walkthrough with prerequisites and troubleshooting: **[docs/local-dev-quickstart.md](docs/local-dev-quickstart.md)**

**Prerequisites:** Bun, Docker, k3d, kubectl, and the `dev01-eks-app-ro` kubectl context (for TLS cert).

```sh
# 1. Install dependencies and configure environment
bun install
cp .env.example .env              # then fill in API keys + secrets

# 2. Create k3d cluster (includes Istio, TLS cert, PostgreSQL)
bun run scripts/cluster-up.ts

# 3. Label namespace and build app container
kubectl apply -f manifests/kova/namespace-kova-apps.yaml
bun run container:rebuild

# 4. Set up database and seed dev user
bun run db:push
bun run dev:backend &             # seed script needs the REST API running
sleep 3 && bun run --cwd backend seed:dev-user
kill %1 2>/dev/null

# 5. Start the application
bun run dev:full                  # Backend :3002 + Frontend :5174
```

Login at `http://localhost:5174/login` with:
- **Email**: `dev@kova.local`
- **Password**: `devpassword123`

Teardown: `bun run scripts/cluster-down.ts` (add `--volumes` for full cleanup).

## Development Commands

```sh
# Install dependencies (from root - installs all workspaces)
bun install

# Start PostgreSQL (via K8s)
kubectl apply -f manifests/kova/

# Run database migrations
bun run db:push

# Create dev user account
bun run --cwd backend seed:dev-user

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

Generate security keys:

```sh
# Generate JWT_SECRET (32+ characters)
openssl rand -hex 32

# Generate ENCRYPTION_KEY (must be exactly 64 hex characters)
openssl rand -hex 32
```

Required variables:

```sh
# Azure Foundry Anthropic endpoint (Spreetail internal)
ANTHROPIC_API_KEY=7jIL0zSfScariKPeWg7nrthptFKxOvIVXCPF9PkCZjTWzgsxHBJ6JQQJ99BLACHYHv6XJ3w3AAAAACOGaDtA
ANTHROPIC_BASE_URL=https://tk-dot-dev-foundry-resource.openai.azure.com/anthropic
AGENT_MODEL=claude-sonnet-4-5

# Database
DATABASE_URL=postgresql://kova:kova_dev_password@localhost:5433/kova

# Security keys (generated above)
JWT_SECRET=<output from first openssl command>
ENCRYPTION_KEY=<output from second openssl command>
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
- `app-container/` - Docker image for running user-generated apps (Claude Agent SDK + Kova Plugin)

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
- Skills (via Claude Plugin)
- MCP servers (via Claude Plugin)

Flow:

1. User sends a prompt via the chat UI
2. Backend forwards the prompt to the app-container via HTTP
3. App-container invokes `query()` from the Claude Agent SDK
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
- Claude Agent SDK + [Kova Plugin](https://gitlab.com/spreetail/engineering/scaled-innovation/spreetail-claude-plugins) - AI agent for code generation

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
