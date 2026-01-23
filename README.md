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
│  │ PostgreSQL │    │   AI Providers  │    │ App Container│     │
│  │  (Drizzle) │    │ (Claude, GPT..) │    │   (Docker)   │     │
│  └────────────┘    └─────────────────┘    └──────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Node.js 20+
- Docker Desktop (for running generated apps)
- PostgreSQL (or use Docker Compose)

## Quick Start

```bash
# 1. Install dependencies
npm install
cd backend && npm install && cd ..

# 2. Start PostgreSQL
docker compose up postgres -d

# 3. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your settings

# 4. Run database migrations
cd backend && npm run db:push && cd ..

# 5. Start development servers
npm run dev:full
```

Open http://localhost:5174 and configure your AI provider API key in Settings.

## Project Structure

```
├── src/                    # Frontend (React SPA)
│   ├── app/               # App shell, layout, TitleBar
│   ├── atoms/             # Jotai global state
│   ├── client/api/        # API client (HTTP/WebSocket)
│   ├── components/        # React components
│   │   ├── chat/         # Chat UI (messages, input, markdown parser)
│   │   ├── preview_panel/ # App preview iframe
│   │   ├── settings/     # Settings pages
│   │   └── ui/           # shadcn/ui components
│   ├── hooks/             # React hooks (TanStack Query)
│   ├── lib/               # Utilities, schemas
│   ├── routes/            # TanStack Router pages
│   └── types/             # TypeScript types
│
├── backend/               # Backend (Fastify + Node.js)
│   └── src/
│       ├── api/routes/    # REST API endpoints
│       ├── db/            # Drizzle ORM schema
│       ├── services/      # Business logic
│       └── websocket/     # WebSocket handlers
│
├── worker/                # Preview iframe injections
│   ├── kova-shim.js      # Error reporting, navigation tracking
│   └── proxy_server.js   # Injects shim into preview iframe
│
└── app-container/         # Docker environment for generated apps
```

## Key Concepts

### Chat Flow

1. User sends a prompt via the chat UI
2. Backend invokes Claude Agent SDK with codebase context
3. Agent autonomously uses tools (file operations, code search, shell commands) to implement changes
4. Response streams to frontend showing progress
5. Generated app hot-reloads in the preview iframe

### Client Factory Pattern

The frontend abstracts API communication:

```typescript
import { getClient } from "@/client/api/client_factory";

const client = getClient();
const apps = await client.listApps();
```

### AI Providers

Bring your own API keys. Supported providers:

- Anthropic (Claude)
- OpenAI (GPT-4, etc.)
- Google (Gemini)
- OpenRouter
- Azure OpenAI
- AWS Bedrock
- Custom endpoints

## Development Commands

```bash
# Frontend
npm run dev:web          # Start frontend dev server (port 5174)
npm run build:web        # Production build

# Backend
npm run dev:backend      # Start backend (port 3002)
npm run build:backend    # Build backend

# Full Stack
npm run dev:full         # Run both frontend + backend

# Database
npm run db:generate      # Generate migrations
npm run db:push          # Apply migrations
npm run db:studio        # Open Drizzle Studio

# Quality
npm run ts               # Type check
npm run lint             # Lint with oxlint
npm run prettier         # Format code
npm run presubmit        # Run before committing
npm run test             # Run tests
```

## Environment Variables

Create `backend/.env` from the example:

```bash
cp backend/.env.example backend/.env
```

Required variables:

```bash
# Database
DATABASE_URL=postgresql://kova:kova_dev_password@localhost:5433/kova

# Security (generate with: openssl rand -hex 32)
JWT_SECRET=your_jwt_secret_at_least_32_chars
ENCRYPTION_KEY=your_64_char_hex_encryption_key

# ProGet - Internal npm registry for @spreetail packages
PROGET_API_KEY=your_proget_api_key

# Data Platform - Starburst Galaxy / Trino credentials
DATA_PLATFORM_HOST=spreetail.routing.trino.galaxy.starburst.io
DATA_PLATFORM_USER=your_service_account_username
DATA_PLATFORM_PASSWORD=your_service_account_password
```

**Finding credential values:** ProGet API key and Data Platform service account credentials can be found in the project's [CI/CD Variables](https://gitlab.com/spreetail/engineering/scaled-innovation/app-builder/-/settings/ci_cd) (Settings > CI/CD > Variables).

## Tech Stack

| Layer         | Technology                                                        |
| ------------- | ----------------------------------------------------------------- |
| Frontend      | React 19, TanStack Router, TanStack Query, Jotai, Tailwind CSS v4 |
| UI Components | Radix UI, shadcn/ui                                               |
| Backend       | Fastify, Node.js                                                  |
| Database      | PostgreSQL, Drizzle ORM                                           |
| AI            | Vercel AI SDK (multi-provider)                                    |
| Build         | Vite                                                              |
| Testing       | Vitest                                                            |

## Podman Compose

For full stack with Podman:

```bash
podman compose up
```

Services:

- `postgres` - PostgreSQL database (port 5433)
- `backend` - API server (port 3002)
