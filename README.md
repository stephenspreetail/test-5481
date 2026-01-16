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
- Docker Desktop or Rancher Desktop (for running generated apps)
- PostgreSQL (or use Docker Compose)

## Quick Start

### 1. Install Dependencies

```bash
npm install
cd backend && npm install && cd ..
```

### 2. Build App Container Image

```bash
# Build the Docker image used for spawning user apps
docker-compose build app-container
```

### 3. Start Infrastructure Services

```bash
# Start PostgreSQL and Traefik
docker-compose up postgres traefik -d
```

**Important for Rancher Desktop users:** If you encounter networking issues where Traefik can't reach your backend, you may need to comment out the `extra_hosts` section in `docker-compose.yml` (lines 13-15). See the troubleshooting section below for details.

### 4. Configure Backend Environment

```bash
# Copy example environment file
cp backend/.env.example backend/.env
```

**Generate required secrets:**

```bash
# Generate JWT secret (copy the output)
openssl rand -hex 32

# Generate encryption key (copy the output)
openssl rand -hex 32
```

**Edit `backend/.env` and configure:**

```bash
# Database
DATABASE_URL=postgresql://kova:kova_dev_password@localhost:5433/kova

# Secrets (paste generated values)
JWT_SECRET=<paste-first-generated-value>
ENCRYPTION_KEY=<paste-second-generated-value>

# AI Provider (get from https://console.anthropic.com)
ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# ProGet (REQUIRED - get from GitLab CI/CD variables)
PROGET_API_KEY=your-proget-api-key-here

# App storage (create this directory in step 5)
APPS_BASE_PATH=/Users/YOUR_USERNAME/Repos/scaled-innovation/kova/backend/apps
```

> **⚠️ IMPORTANT:** The `PROGET_API_KEY` is **required** for the app builder to function properly. This key allows the Claude Agent SDK to install internal `@spreetail/*` packages from ProGet when building applications.
>
> **Where to get it:** Find the shared API key in this project's **GitLab Repository → Settings → CI/CD → Variables** (look for `PROGET_API_KEY`).

**If using Rancher Desktop (macOS):**

Find your Docker socket path:
```bash
ls -la ~/.rd/docker.sock
```

Add to `backend/.env`:
```bash
DOCKER_SOCKET=/Users/YOUR_USERNAME/.rd/docker.sock
```

**If using Docker Desktop:**
```bash
DOCKER_SOCKET=/var/run/docker.sock
```

**Note:** If using Rancher Desktop and Traefik can't reach your backend, see the troubleshooting section below for networking configuration.

### 5. Create Apps Directory

```bash
mkdir -p backend/apps
```

### 6. Run Database Migrations

```bash
cd backend && npm run db:push && cd ..
```

### 7. Start Development Servers

```bash
npm run dev:full
```

Open http://localhost:5174, create an account, and configure your AI provider API key in Settings.

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

Complete `backend/.env` configuration:

```bash
# Server Configuration
PORT=3002
HOST=0.0.0.0
NODE_ENV=development

# Database (PostgreSQL)
DATABASE_URL=postgresql://kova:kova_dev_password@localhost:5433/kova

# JWT Configuration (generate with: openssl rand -hex 32)
JWT_SECRET=your_jwt_secret_at_least_32_chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Encryption Key (generate with: openssl rand -hex 32)
ENCRYPTION_KEY=your_64_char_hex_encryption_key

# Docker Configuration
# Docker Desktop: /var/run/docker.sock
# Rancher Desktop (macOS): /Users/YOUR_USERNAME/.rd/docker.sock
DOCKER_SOCKET=/var/run/docker.sock
APPS_BASE_PATH=/path/to/kova/apps

# CORS
CORS_ORIGIN=http://localhost:5174

# Claude Agent SDK
# Get your API key from: https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
AGENT_MODEL=claude-sonnet-4-20250514

# App Container Configuration
APP_CONTAINER_IMAGE=kova-app-container:latest
APP_CONTAINER_IDLE_TIMEOUT_MS=1800000

# Container Orchestrator Configuration
CONTAINER_NETWORK=kova-network
PREVIEW_DOMAIN=localhost
PREVIEW_PORT=8081
AGENT_PORT=3100
DEV_SERVER_PORT=3000
```

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

## Docker Compose

The project uses a **hybrid approach** for development:

**Services running in Docker:**
- `postgres` - PostgreSQL database (port 5433)
- `traefik` - Reverse proxy for app previews (port 8081)
- `app-container` - Pre-built image for spawning user apps

**Services running on host:**
- Backend API server (via `npm run dev:backend`)
- Frontend dev server (via `npm run dev:web`)

To run backend/frontend in Docker, uncomment the respective services in `docker-compose.yml` and run:

```bash
docker-compose up
```

## Troubleshooting

### Error: `connect ENOENT /var/run/docker.sock`

**Cause**: Backend can't find the Docker socket.

**Solution**:
- For Rancher Desktop on macOS, set `DOCKER_SOCKET=/Users/YOUR_USERNAME/.rd/docker.sock` in `backend/.env`
- For Docker Desktop, use `DOCKER_SOCKET=/var/run/docker.sock`

### Error: `ENOENT: no such file or directory, mkdir '/data/kova-apps'`

**Cause**: The `APPS_BASE_PATH` points to a non-existent directory.

**Solution**:
1. Update `APPS_BASE_PATH` in `backend/.env` to a local path (e.g., `/path/to/kova/apps`)
2. Create the directory: `mkdir -p apps`

### Error: `No such image: kova-app-container:latest`

**Cause**: The app container image hasn't been built.

**Solution**: Run `docker-compose build app-container`

### Can't access generated apps at `http://app-{id}.localhost:8081`

**Cause**: Traefik can't reach your backend to fetch routing configuration. This commonly occurs with Rancher Desktop on macOS.

**How to diagnose**:

1. Check Traefik logs for connection errors:
```bash
docker logs kova-traefik --tail 50
```

2. Look for this error message:
```
Provider error, retrying in X.XXXs error="cannot fetch configuration data:
do fetch request: Get \"http://host.docker.internal:3002/api/traefik/config\":
dial tcp 172.17.0.1:3002: connect: connection refused" providerName=http
```

3. Test if Traefik can reach your backend:
```bash
# From inside the Traefik container
docker exec kova-traefik wget -qO- http://host.docker.internal:3002/api/traefik/config
```

If this fails with "connection refused", continue to the solution.

**Solution for Rancher Desktop users**:

The `extra_hosts` configuration can interfere with `host.docker.internal` resolution in Rancher Desktop.

1. In `docker-compose.yml`, **comment out** the `extra_hosts` section under the `traefik` service (lines 13-15):
```yaml
traefik:
  image: traefik:v3.0
  container_name: kova-traefik
  # extra_hosts:                              # Comment out these lines
  #   - "host.docker.internal:host-gateway"   # for Rancher Desktop
```

2. Restart Traefik:
```bash
docker compose restart traefik
```

3. Verify it's working:
```bash
docker logs kova-traefik --tail 20
# Should show successful connection and no "connection refused" errors
```

**Alternative solution (if above doesn't work)**:

If commenting out `extra_hosts` doesn't resolve the issue, you can hardcode your computer's IP:

1. Find your IP address:
```bash
ifconfig | grep "inet " | grep -v "127.0.0.1"
# Look for something like: inet 192.168.86.34
```

2. Update `traefik/traefik.yml` (line 14):
```yaml
providers:
  http:
    endpoint: "http://192.168.86.34:3002/api/traefik/config"  # Replace with your IP
    pollInterval: 2s
```

3. Restart Traefik with the updated config

**Note**: The hardcoded IP approach requires updating the IP whenever you switch networks.

### Can't create apps after login

**Check**:
1. Is PostgreSQL running? `docker-compose ps`
2. Is Traefik running? `docker-compose ps`
3. Is the app-container image built? `docker images | grep kova-app-container`
4. Are secrets configured in `backend/.env`?
5. Is `DOCKER_SOCKET` correct for your Docker installation?

### Error: `npm install` fails for `@spreetail/*` packages

**Cause**: Missing or invalid `PROGET_API_KEY`, or app-container image built before ProGet configuration.

**Symptoms**:
- Claude Agent SDK reports "404 Not Found" when installing `@spreetail/*` packages
- npm errors like "Unable to authenticate" or "unauthorized"
- Agent logs show npm authentication failures

**Solution**:
1. **Verify API key is set** in `backend/.env`:
   ```bash
   grep PROGET_API_KEY backend/.env
   # Should show: PROGET_API_KEY=your-key-here (not empty)
   ```

2. **Get the API key from GitLab** if missing:
   - Go to this project in GitLab
   - Navigate to **Settings → CI/CD → Variables**
   - Find `PROGET_API_KEY` and copy its value
   - Add to `backend/.env`

3. **Rebuild the app-container image** after updating `.env`:
   ```bash
   docker-compose build app-container
   ```

4. **Test the configuration** inside a container:
   ```bash
   # Start a test container
   docker run -it --rm \
     -e PROGET_API_KEY="$(grep PROGET_API_KEY backend/.env | cut -d '=' -f2)" \
     kova-app-container:latest bash

   # Inside container, verify .npmrc
   cat /home/kova/.npmrc
   # Should show: @spreetail:registry=https://proget.spreetail.org/npm/spreepm/

   # Test npm access
   npm whoami --registry=https://proget.spreetail.org/npm/spreepm/
   ```

## License

MIT
