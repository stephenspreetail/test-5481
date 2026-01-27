# Container Architecture

This document explains how Kova manages app containers for running the Claude Agent SDK and dev servers.

## Overview

Each app gets its own isolated container running:
- **Agent Server** (port 3100) - Claude Agent SDK for code generation
- **Dev Server** (port 3000) - Vite/React dev server for the generated app

## Docker/Podman Compatibility

Kova uses the `dockerode` npm package which speaks the Docker API protocol. This works with both Docker and Podman because **Podman exposes a Docker-compatible API**.

### Windows (Podman Desktop)

```typescript
// backend/src/services/app-container.service.ts
if (process.platform === "win32") {
  return new Docker({ socketPath: "//./pipe/docker_engine" });
}
```

Podman Desktop on Windows creates a named pipe at `//./pipe/docker_engine` - the same location Docker Desktop uses. This provides seamless compatibility without code changes.

### Linux/macOS

Uses the socket path from config (typically `/var/run/docker.sock` or `/run/podman/podman.sock`).

## Container Lifecycle

### 1. Starting a Container

When a user sends a chat message, `AppContainerService.startContainer()` is called:

1. **Check for existing container** - Reuse if already running
2. **Allocate ports** - Agent port from 31100-31999 range
3. **Create app directory** - `backend/apps/{userId}/{appId}/`
4. **Create container** with:
   - Image: `kova-app-container:latest`
   - Network: `kova-network` (for Traefik routing)
   - Volume: App directory mounted to `/workspace`
   - Memory: 2GB (+ 4GB swap)
   - CPU: 2 cores
5. **Start container** and wait for health check

### 2. Container Configuration

```typescript
HostConfig: {
  NetworkMode: "kova-network",
  Binds: [`${appPath}:/workspace:rw`],
  PortBindings: {
    "3100/tcp": [{ HostPort: agentPort.toString() }],
  },
  Memory: 2 * 1024 * 1024 * 1024,     // 2GB
  MemorySwap: 4 * 1024 * 1024 * 1024, // 4GB with swap
  CpuPeriod: 100000,
  CpuQuota: 200000,                    // 2 cores
}
```

### 3. Idle Timeout

Containers are automatically stopped after 15 minutes of inactivity (configurable via `APP_CONTAINER_IDLE_TIMEOUT_MS`).

Activity is recorded on:
- Agent queries (chat messages)
- Preview iframe access

### 4. Stopping a Container

Containers are stopped via `stopContainer()` which:
1. Sends SIGTERM with 10-second timeout
2. Releases allocated ports
3. Removes container from tracking map

## Networking

### Container Network

All app containers join `kova-network` (bridge network). This allows:
- Traefik to route to containers by name
- Containers to communicate with each other if needed

### Port Mapping

| Internal Port | Purpose | Host Port |
|---------------|---------|-----------|
| 3100 | Agent Server | 31100-31999 (dynamic) |
| 3000 | Dev Server | Not exposed (Traefik routes) |

### Traefik Routing

Traefik provides preview URLs like `http://app-{id}.localhost:8081`:

1. Containers are created with Traefik labels for automatic route discovery
2. Traefik's Docker provider watches for container changes via Docker socket
3. Traefik routes `app-{id}.localhost:8081` → `http://app-{id}:3000`

Labels set on each container:
```typescript
Labels: {
  "traefik.enable": "true",
  "traefik.http.routers.app-{id}.rule": "Host(`app-{id}.localhost`)",
  "traefik.http.routers.app-{id}.entrypoints": "preview",
  "traefik.http.services.app-{id}.loadbalancer.server.port": "3000",
}
```

## App Container Image

Built from `app-container/Dockerfile`:

- **Base**: `node:22-bookworm-slim`
- **Includes**: Git, Claude Code CLI (`@anthropic-ai/claude-code`)
- **User**: `kova:kova` (non-root, UID 1001)

### Services Inside Container

1. **Agent Server** (`src/server.ts`)
   - Fastify server on port 3100
   - `/query` endpoint invokes Claude Agent SDK
   - `/health` endpoint for readiness checks

2. **Dev Server Manager** (`src/dev-server.ts`)
   - Auto-detects framework (Vite, Next.js, etc.)
   - Runs `npm install` if needed
   - Starts dev server on port 3000

## Windows-Specific Considerations

### Volume Mounts

Windows NTFS doesn't support Unix file permissions. This causes issues with:
- `npm install` trying to `chmod` bin scripts
- Symlinks in `node_modules/.bin/`

**Solution**: Named Docker/Podman volume for `node_modules`. The workspace source code is bind-mounted from Windows, but `node_modules` lives on a Linux filesystem (named volume). This allows npm to work normally with bin-links and symlinks.

```typescript
// In app-container.service.ts
Binds: [
  `${dockerAppPath}:/workspace:rw`,           // Source code on Windows
  `app-${appId}-modules:/workspace/node_modules`  // node_modules on Linux volume
]
```

### Traefik Host Access

Traefik uses the Docker provider to discover routes via container labels. Ensure Traefik can access the Docker socket:

```yaml
# docker-compose.yml
volumes:
  - ${DOCKER_SOCKET:-/var/run/docker.sock}:/var/run/docker.sock:ro
```

For Podman on Linux, set `DOCKER_SOCKET` in your `.env`:
```sh
DOCKER_SOCKET=$XDG_RUNTIME_DIR/podman/podman.sock
```

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/services/app-container.service.ts` | Container lifecycle management |
| `app-container/Dockerfile` | Container image definition |
| `app-container/src/server.ts` | Agent server entry point |
| `app-container/src/agent.ts` | Claude Agent SDK wrapper |
| `app-container/src/dev-server.ts` | Dev server manager |
| `traefik/traefik.yml` | Traefik static config (Docker provider) |

## Troubleshooting

### Container crashes with SIGABRT

Likely out of memory. Increase memory limits in `app-container.service.ts`:
```typescript
Memory: 2 * 1024 * 1024 * 1024, // Increase if needed
```

### npm install fails with EPERM

Windows volume mount issue. Ensure `node_modules` is on a named volume (not bind-mounted from Windows):
```typescript
Binds: [
  `${dockerAppPath}:/workspace:rw`,
  `app-${appId}-modules:/workspace/node_modules`  // Named volume for node_modules
]
```

### Traefik can't reach backend

On Windows with Podman, update `traefik/traefik.yml` to use your actual IP instead of `host.docker.internal`.

### Container not found after backend restart

The service scans for existing containers on startup (`scanExistingContainers`). If a container was started by a previous backend instance, it will be rediscovered.
