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
│  ┌────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │ PostgreSQL │    │App Container │    │Claude Plugin │     │
│  │  (Drizzle) │    │ (Claude SDK) │    │(Skills, MCP) │     │
│  └────────────┘    └──────────────┘    └──────────────┘     │
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
```

Open http://localhost:5174 for the web UI.

---

## Local AI Development (Claude Code + Plugin)

For AI-assisted development outside of the Kova web platform, use [Claude Code](https://claude.ai/code) with the **Kova Plugin**. The plugin provides Spreetail-specific skills (Spreeform UI, TanStack Start, data platform queries) and MCP servers (data catalog).

See the plugin README for installation and usage: https://gitlab.com/spreetail/engineering/scaled-innovation/spreetail-claude-plugins

---

## Environment Setup

**Single `.env` file at repository root** - used by all components.

```bash
cp .env.example .env
```

### Required Variables

```bash
# LLM Provider (REQUIRED for all modes)
# Choose ONE of three options:

# Option 1: Azure Foundry (Spreetail Internal - Recommended)
# Defaults: Spreetail Foundry URL + claude-opus-4-6 model
LLM_PROVIDER=azure
ANTHROPIC_API_KEY=your-azure-foundry-api-key

# Option 2: Direct Anthropic API
# Defaults to claude-opus-4-6 model
# LLM_PROVIDER=anthropic
# ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# Option 3: AWS Bedrock
# Defaults to claude-sonnet-4-5-20250929-v1:0 model (cost-optimized)
# See docs/aws-bedrock-setup.md for full setup guide
# Run script: source ./scripts/refresh-aws-sso.sh (Linux/macOS)
# LLM_PROVIDER=bedrock
# CLAUDE_CODE_USE_BEDROCK=1
# AWS_REGION=us-east-1
# AWS_AUTH_MODE=explicit

# Database (REQUIRED for web platform)
DATABASE_URL=postgresql://kova:kova_dev_password@localhost:5433/kova

# Security (REQUIRED for web platform)
# Generate with: openssl rand -hex 32
JWT_SECRET=your-jwt-secret-at-least-32-characters-long
ENCRYPTION_KEY=your-64-character-hex-encryption-key-here

# Kubernetes Environment (optional, defaults to "local")
# Choose your K8s environment (like LLM_PROVIDER):
#   - "local": k3d development cluster (default)
#   - "eks-dev": EKS development cluster
#   - "eks-prod": EKS production cluster
# K8S_ENVIRONMENT=local

# Spreetail Internal (REQUIRED for web platform)
PROGET_API_KEY=your-proget-api-key
DATA_PLATFORM_HOST=spreetail.routing.trino.galaxy.starburst.io
DATA_PLATFORM_USER=your_service_account_username
DATA_PLATFORM_PASSWORD=your_service_account_password
```

**Finding Spreetail credentials:** See [CI/CD Variables](https://gitlab.com/spreetail/engineering/scaled-innovation/app-builder/-/settings/ci_cd).

> **Note:** Bun automatically expands `$VAR` in `.env` files. If your password contains `$`, escape it with `\$`. Example: `pa$$word` becomes `pa\$\$word`. See [Bun docs](https://bun.com/docs/runtime/environment-variables).

---

## Development Commands

```bash
# Full Platform
bun run dev:full         # Backend + Frontend (ports 3002, 5174) - Ctrl+C stops all
bun run dev:backend      # Backend only
bun run dev:web          # Frontend only

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

## Monorepo Structure

```
kova/
├── .env.example           # Environment template (copy to .env)
├── package.json           # Workspaces root + bun scripts
├── src/                   # Frontend (React SPA)
├── backend/               # Backend (Fastify + Bun)
└── app-container/         # Container environment for generated apps (Claude Agent SDK)
```

---

## How It Works

### Web Platform Flow

1. User sends a prompt via the chat UI
2. Backend forwards the prompt to the app-container via HTTP
3. App-container invokes Claude Agent SDK, which autonomously uses tools (file ops, code search, shell)
4. Response streams to frontend showing progress
5. Generated app hot-reloads in the preview iframe

### App Container Flow

1. Backend spawns container with Claude Agent SDK
2. Container receives env vars from backend
3. Agent runs inside container with access to `/workspace`
4. Claude Plugin provides skills and MCP servers

---

## Tech Stack

| Layer         | Technology                                                        |
| ------------- | ----------------------------------------------------------------- |
| Runtime       | Bun                                                               |
| Frontend      | React 19, TanStack Router, TanStack Query, Jotai, Tailwind CSS v4 |
| UI Components | Radix UI, shadcn/ui                                               |
| Backend       | Fastify, Bun                                                      |
| Database      | PostgreSQL, Drizzle ORM                                           |
| AI Agent      | Claude Agent SDK + [Kova Plugin](https://gitlab.com/spreetail/engineering/scaled-innovation/spreetail-claude-plugins) |
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
