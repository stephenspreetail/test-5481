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
│  │  (Drizzle) │    │ (Claude SDK)    │    │  (Container) │     │
│  └────────────┘    └─────────────────┘    └──────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- [Bun](https://bun.sh/) 1.0+
- Container runtime (free, open source options):
  - [Rancher Desktop](https://rancherdesktop.io/)
  - [Podman](https://podman.io/)
- PostgreSQL (or use Docker Compose)

## Quick Start

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env
# Edit .env with your settings (see Environment Setup below)

# 3. Start PostgreSQL and Traefik (reverse proxy for app previews)
docker compose up postgres traefik -d

# 4. Run database migrations
bun run db:push

# 5. Start development
bun run dev:full        # Full platform (backend + frontend)
# OR
bun run dev:agent       # CLI only (no build needed)
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
# Option 1: Direct Anthropic API
ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# Option 2: AWS Bedrock (alternative to ANTHROPIC_API_KEY)
# See docs/aws-bedrock-setup.md for full setup guide
# Linux/macOS: source ./scripts/refresh-aws-sso.sh
# Windows:     .\scripts\refresh-aws-sso.ps1
# Script automatically sets: CLAUDE_CODE_USE_BEDROCK, AWS_AUTH_MODE, AWS_REGION,
#                            AGENT_MODEL, and AWS credentials

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

> **Note:** Bun automatically expands `$VAR` in `.env` files. If your password contains `$`, escape it with `\$`. Example: `pa$$word` becomes `pa\$\$word`. See [Bun docs](https://bun.com/docs/runtime/environment-variables).

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
bun run dev:full         # Backend + Frontend (ports 3002, 5174) - Ctrl+C stops all
bun run dev:backend      # Backend only
bun run dev:web          # Frontend only

# Agent CLI
bun run dev:agent        # Run agent CLI (no build needed)
bun run build:agent      # Build for production/publishing
bun run start:agent      # Run the built version

# Database
bun run db:push          # Apply migrations
bun run db:studio        # Open Drizzle Studio

# Quality
bun run ts               # Type check
bun run lint             # Lint with oxlint
bun run prettier         # Format code
bun run presubmit        # Run before committing
bun run test             # Run tests
```

---

## @kova/agent CLI

The standalone agent package provides a terminal-based interface for AI-powered development.

### Usage

```bash
# Run CLI (no build needed, loads .env from root automatically)
bun run dev:agent

# Or with arguments
bun run dev:agent -- --help
bun run dev:agent -- --project my-app
bun run dev:agent -- --cwd ~/projects/my-app
bun run dev:agent -- --prompt "Create a React app"

# Project management
bun run dev:agent -- projects list
bun run dev:agent -- projects create my-app
bun run dev:agent -- projects delete my-app
```

### Direct Usage (without bun scripts)

```bash
# Set env var directly
export ANTHROPIC_API_KEY=sk-ant-...
bun packages/agent/dist/cli/bin.js

# Or install globally
cd packages/agent && bun link
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
├── package.json           # Workspaces root + bun scripts
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
├── backend/               # Backend (Fastify + Bun)
└── app-container/         # Container environment for generated apps
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

1. User runs `bun run dev:agent` with optional flags
2. CLI creates/opens project in `~/.local/share/kova/projects/`
3. Agent runs with full tool access
4. Responses stream to terminal

### App Container Flow

1. Backend spawns container with `@kova/agent`
2. Container receives env vars from backend
3. Agent runs inside container with access to `/workspace`
4. MCP servers provide Spreetail docs and Data Catalog

---

## Tech Stack

| Layer         | Technology                                                        |
| ------------- | ----------------------------------------------------------------- |
| Runtime       | Bun                                                               |
| Frontend      | React 19, TanStack Router, TanStack Query, Jotai, Tailwind CSS v4 |
| UI Components | Radix UI, shadcn/ui                                               |
| Backend       | Fastify, Bun                                                      |
| Database      | PostgreSQL, Drizzle ORM                                           |
| AI Agent      | @kova/agent, Claude Agent SDK                                     |
| CLI           | Ink (React for CLI)                                               |
| Build         | Vite, TypeScript                                                  |
| Testing       | Vitest                                                            |

---

## Container Compose

Works with any OCI-compatible container runtime (Docker, Podman, Rancher Desktop, etc.):

```bash
# Build the app-container image
docker compose build app-container

# Start all services
docker compose up

# Or specific services
docker compose up postgres traefik -d
```

Services:

- `postgres` - PostgreSQL database (port 5433)
- `backend` - API server (port 3002)
- `traefik` - Reverse proxy for app previews (port 8081)

### Runtime-Specific Setup

**Rancher Desktop** (macOS/Windows/Linux): Use "dockerd" engine mode (Preferences → Container Engine → dockerd). The default socket path works.

**Podman Desktop** (macOS/Windows): Default socket path works. No additional configuration needed.

**Podman rootless** (Linux only): Enable the socket and configure the path:
```bash
systemctl --user enable --now podman.socket
echo "DOCKER_SOCKET=$XDG_RUNTIME_DIR/podman/podman.sock" >> .env
```
