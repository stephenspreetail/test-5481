# Kova

An AI app builder. Build full-stack web applications through natural language conversations using Claude Agent SDK.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (SPA)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │   React UI   │  │  Chat Panel  │  │   Preview Iframe      │ │
│  │  TanStack    │  │  Streaming   │  │   (Generated App)     │ │
│  │   Router     │  │   Messages   │  │                       │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────────────────┘ │
│         │                 │                                     │
│         └────────┬────────┘                                     │
│                  │ HTTP/WebSocket                               │
└──────────────────┼──────────────────────────────────────────────┘
                   │
┌──────────────────┼──────────────────────────────────────────────┐
│                  ▼              Backend (Fastify)               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                     REST API + WebSocket                  │  │
│  │  • Chat streaming    • App management    • File ops       │  │
│  │  • Version control   • Settings          • Integrations   │  │
│  └──────────────────────────────────────────────────────────┘  │
│         │                    │                    │             │
│         ▼                    ▼                    ▼             │
│  ┌────────────┐    ┌─────────────────┐    ┌──────────────┐     │
│  │ PostgreSQL │    │  @kova/agent    │    │ App Container│     │
│  │  (Drizzle) │    │ (Claude SDK)    │    │   (Docker)   │     │
│  └────────────┘    └─────────────────┘    └──────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (single .env at root)
cp .env.example .env
# Edit .env with your settings (see below)

# 3. Start PostgreSQL
docker compose up postgres -d

# 4. Run database migrations
npm run db:push

# 5. Start development
npm run dev:full        # Full platform (backend + frontend)
# OR
npm run dev:agent       # CLI only (no build needed)
```

Open http://localhost:5174 for the web UI.

---

## Environment Setup

**Single `.env` file at repository root** - used by all components.

```bash
cp .env.example .env
```

### Required Variables

```bash
# Claude Agent SDK (REQUIRED for all modes)
ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# Database (REQUIRED for web platform)
DATABASE_URL=postgresql://kova:kova_dev_password@localhost:5433/kova

# Security (REQUIRED for web platform)
# Generate with: openssl rand -hex 32
JWT_SECRET=your-jwt-secret-at-least-32-characters-long
ENCRYPTION_KEY=your-64-character-hex-encryption-key-here

# Spreetail Internal (REQUIRED for web platform)
PROGET_API_KEY=your-proget-api-key
DATA_PLATFORM_HOST=spreetail.routing.trino.galaxy.starburst.io
DATA_PLATFORM_USER=your_service_account_username
DATA_PLATFORM_PASSWORD=your_service_account_password
```

**Finding Spreetail credentials:** See [CI/CD Variables](https://gitlab.com/spreetail/engineering/scaled-innovation/app-builder/-/settings/ci_cd).

### For CLI Only

If you just want to use the agent CLI, you need:

```bash
# Required for CLI
ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# Data Platform (required for Trino queries and metadata search)
DATA_PLATFORM_HOST=spreetail.routing.trino.galaxy.starburst.io
DATA_PLATFORM_USER=your_service_account_username
DATA_PLATFORM_PASSWORD=your_service_account_password
```

**Alternative:** Instead of adding data platform credentials to `.env`, you can create `~/.config/kova/data-platform.env` with the `DATA_PLATFORM_*` variables. This keeps credentials separate from the repo.

---

## Development Commands

```bash
# Full Platform
npm run dev:full         # Backend + Frontend (ports 3002, 5174)
npm run dev:backend      # Backend only
npm run dev:web          # Frontend only

# Agent CLI
npm run dev:agent        # Run agent CLI (no build needed, uses tsx)
npm run build:agent      # Build for production/publishing
npm run start:agent      # Run the built version

# Database
npm run db:push          # Apply migrations
npm run db:studio        # Open Drizzle Studio

# Quality
npm run ts               # Type check
npm run lint             # Lint with oxlint
npm run prettier         # Format code
npm run presubmit        # Run before committing
npm run test             # Run tests
```

---

## @kova/agent CLI

The standalone agent package provides a terminal-based interface for AI-powered development.

### Usage

```bash
# Run CLI (no build needed, loads .env from root automatically)
npm run dev:agent

# Or with arguments
npm run dev:agent -- --help
npm run dev:agent -- --project my-app
npm run dev:agent -- --cwd ~/projects/my-app
npm run dev:agent -- --prompt "Create a React app"

# Project management
npm run dev:agent -- projects list
npm run dev:agent -- projects create my-app
npm run dev:agent -- projects delete my-app
```

### Direct Usage (without npm scripts)

```bash
# Set env var directly
export ANTHROPIC_API_KEY=sk-ant-...
node packages/agent/dist/cli/bin.js

# Or install globally
cd packages/agent && npm link
kova-agent --help
```

### Project Storage

Projects are stored in XDG-compliant locations:

| Platform    | Location                          |
| ----------- | --------------------------------- |
| macOS/Linux | `~/.local/share/kova/projects/`   |
| Windows     | `%LOCALAPPDATA%/kova/projects/`   |

Override with: `KOVA_PROJECTS_DIR=/custom/path`

### Programmatic Usage

```typescript
import { createAgent } from '@kova/agent';

const agent = createAgent({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Stream responses
for await (const event of agent.streamQuery("Create a hello world app")) {
  if (event.type === 'text') {
    console.log(event.text);
  }
}

// Or execute and wait
const result = await agent.executeQuery("Fix the bug in auth.ts");
console.log(result);
```

---

## Monorepo Structure

```
kova/
├── .env.example           # Environment template (copy to .env)
├── package.json           # Workspaces root + npm scripts
├── packages/
│   └── agent/             # @kova/agent - Standalone AI agent
│       ├── src/
│       │   ├── core/      # KovaAgent class (Claude SDK wrapper)
│       │   ├── config/    # System prompts, defaults
│       │   ├── tools/     # Tool presets
│       │   ├── projects/  # XDG project management
│       │   └── cli/       # Ink-based terminal UI
│       └── package.json
├── src/                   # Frontend (React SPA)
├── backend/               # Backend (Fastify + Node.js)
└── app-container/         # Docker environment for generated apps
```

---

## How It Works

### Web Platform Flow

1. User sends a prompt via the chat UI
2. Backend invokes `@kova/agent` with codebase context
3. Agent autonomously uses tools (file ops, code search, shell)
4. Response streams to frontend showing progress
5. Generated app hot-reloads in the preview iframe

### CLI Flow

1. User runs `npm run dev:agent` with optional flags
2. CLI creates/opens project in `~/.local/share/kova/projects/`
3. Agent runs with full tool access
4. Responses stream to terminal

### App Container Flow

1. Backend spawns Docker container with `@kova/agent`
2. Container receives env vars from backend
3. Agent runs inside container with access to `/workspace`
4. MCP servers provide Spreetail docs and Data Catalog

---

## Tech Stack

| Layer         | Technology                                                        |
| ------------- | ----------------------------------------------------------------- |
| Frontend      | React 19, TanStack Router, TanStack Query, Jotai, Tailwind CSS v4 |
| UI Components | Radix UI, shadcn/ui                                               |
| Backend       | Fastify, Node.js                                                  |
| Database      | PostgreSQL, Drizzle ORM                                           |
| AI Agent      | @kova/agent, Claude Agent SDK                                     |
| CLI           | Ink (React for CLI)                                               |
| Build         | Vite, TypeScript                                                  |
| Testing       | Vitest                                                            |

---

## Prerequisites

- Node.js 20+
- Docker Desktop or Podman (for running generated apps)
- PostgreSQL (or use Docker Compose)

---

## Podman/Docker Compose

```bash
# Build the app-container image
podman compose build app-container

# Start all services
podman compose up

# Or specific services
podman compose up postgres traefik -d
```

Services:

- `postgres` - PostgreSQL database (port 5433)
- `backend` - API server (port 3002)
- `traefik` - Reverse proxy for app previews (port 8081)
