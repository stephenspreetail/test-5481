# Kova Containerization Architecture

## Overview

Kova uses a **plugin-based orchestrator pattern** with a clear abstraction layer separating business logic from container management. The current implementation uses Docker/Podman, with designed-in extension points for Kubernetes and ECS.

**Key Concept:** Each user application runs in its own isolated container. When a user creates an app and starts chatting, Kova spawns a dedicated container for that app. Multiple users can have multiple apps, each with its own container running concurrently.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Backend (3002)                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              AppContainerService (Legacy)                │   │
│  │     - Direct Docker calls (being superseded)             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              ↓                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            ContainerOrchestrator Interface               │   │
│  │  - spawnContainer()  - stopContainer()  - healthCheck()  │   │
│  └─────────────────────────────────────────────────────────┘   │
│           ↙                    ↓                    ↘          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │   Podman     │    │  Kubernetes  │    │     ECS      │     │
│  │ Orchestrator │    │ Orchestrator │    │ Orchestrator │     │
│  │  (Current)   │    │   (Future)   │    │   (Future)   │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Multi-Container Architecture

### One Container Per App

Each Kova application runs in its own dedicated container:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Backend (port 3002)                            │
│                                                                             │
│  appContainers Map:                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  appId: 1  → { agentUrl: localhost:31100, container: app-1 }       │    │
│  │  appId: 2  → { agentUrl: localhost:31101, container: app-2 }       │    │
│  │  appId: 3  → { agentUrl: localhost:31102, container: app-3 }       │    │
│  │  ...                                                                │    │
│  └────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                    │               │               │
                    ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Docker Network: kova-network                         │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   Container:     │  │   Container:     │  │   Container:     │          │
│  │     app-1        │  │     app-2        │  │     app-3        │          │
│  │                  │  │                  │  │                  │          │
│  │ ┌──────────────┐ │  │ ┌──────────────┐ │  │ ┌──────────────┐ │          │
│  │ │Agent Server  │ │  │ │Agent Server  │ │  │ │Agent Server  │ │          │
│  │ │  :3100       │ │  │ │  :3100       │ │  │ │  :3100       │ │          │
│  │ │  ↔ :31100    │ │  │ │  ↔ :31101    │ │  │ │  ↔ :31102    │ │          │
│  │ └──────────────┘ │  │ └──────────────┘ │  │ └──────────────┘ │          │
│  │ ┌──────────────┐ │  │ ┌──────────────┐ │  │ ┌──────────────┐ │          │
│  │ │ Dev Server   │ │  │ │ Dev Server   │ │  │ │ Dev Server   │ │          │
│  │ │  :3000       │ │  │ │  :3000       │ │  │ │  :3000       │ │          │
│  │ └──────────────┘ │  │ └──────────────┘ │  │ └──────────────┘ │          │
│  │                  │  │                  │  │                  │          │
│  │ /workspace:      │  │ /workspace:      │  │ /workspace:      │          │
│  │  user's app code │  │  user's app code │  │  user's app code │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
                    │               │               │
                    ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Traefik (port 8081)                               │
│                                                                             │
│  Routes:                                                                    │
│    app-1.localhost:8081  →  http://app-1:3000                              │
│    app-2.localhost:8081  →  http://app-2:3000                              │
│    app-3.localhost:8081  →  http://app-3:3000                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Container Lifecycle

1. **Spawn on Demand:** Container created when user sends first chat message to an app
2. **Idle Timeout:** Container stopped after 15 minutes of inactivity (configurable)
3. **Reuse on Return:** If user returns to app, same container restarts (or new one spawned)
4. **Cleanup:** Idle containers are periodically scanned and removed

### Port Allocation Strategy

Each container needs a unique host port for the backend to communicate with its agent server:

| Container | Internal Agent Port | Host Port (Mapped) | Internal Dev Port |
|-----------|--------------------|--------------------|-------------------|
| app-1     | 3100               | 31100              | 3000              |
| app-2     | 3100               | 31101              | 3000              |
| app-3     | 3100               | 31102              | 3000              |
| ...       | 3100               | 311XX              | 3000              |

- **Agent ports range:** 31100-31999 (up to 900 concurrent containers)
- **Dev server:** Not exposed to host; accessed via Docker network DNS

---

## Abstraction Layer

### ContainerOrchestrator Interface

**Location:** `backend/src/services/orchestrator/types.ts`

```typescript
export interface ContainerOrchestrator {
  initialize(): Promise<void>;
  spawnContainer(config: SpawnContainerConfig): Promise<ContainerInfo>;
  stopContainer(containerId: string): Promise<void>;
  getContainer(appId: number): Promise<ContainerInfo | null>;
  healthCheck(containerId: string): Promise<HealthCheckResult>;
  listContainers(): Promise<ContainerInfo[]>;
  cleanupIdleContainers(maxIdleMs: number): Promise<number>;
  shutdown(): Promise<void>;
}
```

### Key Data Types

**SpawnContainerConfig** - Request to create a container:
```typescript
interface SpawnContainerConfig {
  appId: number;
  userId: number;
  appPath: string;      // Host path for volume mount
  image: string;        // Container image
  env: Record<string, string>;
}
```

**ContainerInfo** - Running container information:
```typescript
interface ContainerInfo {
  containerId: string;  // Platform-specific identifier
  containerName: string; // DNS-resolvable name (e.g., app-123)
  agentUrl: string;     // Internal URL for backend → container
  previewUrl: string;   // External URL for browser preview
  state: ContainerState;
  lastActivityAt: Date;
}
```

**ContainerState** - Unified state machine:
```typescript
type ContainerState = "pending" | "starting" | "running" | "stopping" | "stopped" | "failed";
```

---

## Current Implementation (Docker/Podman)

### File Locations
- **Orchestrator:** `backend/src/services/orchestrator/podman.orchestrator.ts`
- **Legacy Service:** `backend/src/services/app-container.service.ts`
- **Container Image:** `app-container/Dockerfile`

### Connection Strategy
| Platform | Socket/Connection |
|----------|-------------------|
| Linux | `/run/podman/podman.sock` or `/var/run/docker.sock` |
| macOS | Podman socket |
| Windows | SSH to Podman VM (port 52853) |
| Fallback | `//./pipe/docker_engine` |
| Override | `DOCKER_HOST` env var |

### Port Allocation
- **Agent Server:** 31100-31999 (dynamic)

### URL Patterns
| Purpose | Format | Example |
|---------|--------|---------|
| Agent URL | `http://localhost:{agentPort}` | `http://localhost:31100` |
| Preview URL | `http://{containerName}.{domain}:{port}` | `http://app-123.localhost:8081` |

### Network Topology (Simplified)

```
┌────────────────┐      ┌────────────────┐      ┌────────────────────────────┐
│    Browser     │      │    Backend     │      │    Docker Network          │
│                │      │    (3002)      │      │    (kova-network)          │
│ ┌────────────┐ │      │                │      │                            │
│ │ React App  │─┼─────▶│  WebSocket     │      │  ┌──────────────────────┐ │
│ │            │ │      │  /ws           │──────┼─▶│ app-123              │ │
│ └────────────┘ │      │                │      │  │  Agent :3100→:31100  │ │
│                │      │  HTTP calls to │      │  │  Dev    :3000        │ │
│ ┌────────────┐ │      │  localhost:311XX      │  └──────────────────────┘ │
│ │ Preview    │ │      │                │      │                            │
│ │ iframe     │─┼──────┼────────────────┼──────┼─▶ (via Traefik)           │
│ │            │ │      │                │      │                            │
│ └────────────┘ │      └────────────────┘      └────────────────────────────┘
└────────────────┘               │                          ▲
        │                        │                          │
        │                        ▼                          │
        │               ┌────────────────┐                  │
        └──────────────▶│   Traefik      │──────────────────┘
                        │   (8081)       │
                        │                │
                        │ app-123.localhost:8081
                        │   → app-123:3000
                        └────────────────┘
```

**Two separate communication paths:**
1. **Agent Communication:** Backend → `localhost:31100` → Container Agent Server (direct HTTP)
2. **Preview Access:** Browser → `app-123.localhost:8081` → Traefik → `app-123:3000` (reverse proxy)

---

## Container Image Structure

**Base:** `node:22-bookworm-slim`

**Source:** `app-container/Dockerfile`

### Dual-Server Architecture

Each container runs **two servers** in a single Node.js process:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         App Container (app-{id})                            │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      Agent Server (port 3100)                         │ │
│  │                                                                       │ │
│  │  Purpose: Execute AI-generated code changes via Claude Agent SDK     │ │
│  │                                                                       │ │
│  │  Endpoints:                                                           │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │ POST /query          → Execute prompt via Claude Agent SDK      │ │ │
│  │  │                        Returns: SSE stream of events            │ │ │
│  │  │                        (text, tool_use, tool_result, result)    │ │ │
│  │  ├─────────────────────────────────────────────────────────────────┤ │ │
│  │  │ GET  /health         → Container health check                   │ │ │
│  │  │                        Returns: { status, devServer }           │ │ │
│  │  ├─────────────────────────────────────────────────────────────────┤ │ │
│  │  │ POST /dev-server/restart → Restart the dev server              │ │ │
│  │  │ GET  /dev-server/status  → Dev server status                   │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                       │ │
│  │  Tools Available to Agent:                                            │ │
│  │    Read, Write, Edit, Bash, Glob, Grep, Skill                        │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                       Dev Server (port 3000)                          │ │
│  │                                                                       │ │
│  │  Purpose: Run the user's application for live preview                │ │
│  │                                                                       │ │
│  │  Framework Detection (auto):                                          │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │ vite.config.*      → npm run dev (Vite)                         │ │ │
│  │  │ next.config.*      → npm run dev (Next.js)                      │ │ │
│  │  │ angular.json       → npm start (Angular)                        │ │ │
│  │  │ Default            → npm run dev                                │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                       │ │
│  │  Lifecycle:                                                           │ │
│  │    - Auto-starts on container initialization                         │ │
│  │    - Restarts after file changes (triggered by agent)                │ │
│  │    - Max 3 restart attempts on failure                               │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         /workspace (volume)                           │ │
│  │                                                                       │ │
│  │  User's application source code:                                      │ │
│  │    /workspace/                                                        │ │
│  │    ├── src/                    ← App source code                     │ │
│  │    ├── package.json            ← Dependencies                        │ │
│  │    ├── node_modules/           ← Named volume (persistent)           │ │
│  │    └── .claude/                                                       │ │
│  │        └── skills/             ← Named volume (bundled skills)       │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Port Mapping Detail

| Port | Protocol | Purpose | Exposure |
|------|----------|---------|----------|
| **3100** | HTTP | Agent Server - Claude SDK queries | Mapped to host (31100-31999) |
| **3000** | HTTP | Dev Server - User's app preview | Internal only (via Docker DNS) |

**Why different exposure patterns?**
- **Agent Server (exposed):** Backend needs direct HTTP access to send prompts and receive streaming responses. Each container gets a unique host port.
- **Dev Server (internal):** Browser access goes through Traefik reverse proxy using container DNS name. No host port needed.

### Communication Flows

```
┌──────────┐     ┌──────────┐     ┌─────────────────────────────────────┐
│ Frontend │────▶│ Backend  │────▶│ Container: app-123                  │
│ (React)  │     │ (3002)   │     │                                     │
└──────────┘     └──────────┘     │  ┌─────────────────────────────┐   │
     │                │           │  │ Agent Server (:3100→:31100) │   │
     │                │           │  │                             │   │
     │           WebSocket        │  │  POST /query                │   │
     │           chat:stream ────▶│  │    ↓                        │   │
     │                │           │  │  Claude Agent SDK           │   │
     │                │           │  │    ↓                        │   │
     │                │◀── SSE ───│  │  Tool calls (Write, Edit)   │   │
     │                │           │  │    ↓                        │   │
     │                │           │  │  Files modified             │   │
     │                │           │  └─────────────────────────────┘   │
     │                │           │                │                   │
     │                │           │                ▼                   │
     │                │           │  ┌─────────────────────────────┐   │
     │                │           │  │ Dev Server (:3000)          │   │
     │                │           │  │                             │   │
     │                │  restart ─│  │  Hot reload triggered       │   │
     │                │           │  │                             │   │
     │                │           │  └─────────────────────────────┘   │
     │                │           └─────────────────────────────────────┘
     │                │                            │
     │                │                            ▼
     │           ┌────────────────────────────────────────────┐
     │           │              Traefik (:8081)               │
     │           │  app-123.localhost:8081 → app-123:3000     │
     │           └────────────────────────────────────────────┘
     │                                 │
     │◀────────── Preview iframe ──────┘
     │
```

### Volume Mounts

| Host | Container | Type | Purpose |
|------|-----------|------|---------|
| `/data/kova-apps/{appId}/` | `/workspace` | Bind mount | User's app source code |
| `app-{id}-modules` | `/workspace/node_modules` | Named volume | Dependencies (avoids Windows symlink issues) |
| `app-{id}-skills` | `/workspace/.claude/skills` | Named volume | Claude Code skills (persistent) |

### Resource Limits

| Resource | Limit | Notes |
|----------|-------|-------|
| Memory | 2GB | Base allocation |
| Swap | 2GB | Additional swap space |
| CPU | 2 cores | 200% of single core |

### Environment Variables (inside container)

```bash
APP_ID=123                              # Application identifier
WORKSPACE_DIR=/workspace                # Working directory for agent
AGENT_PORT=3100                         # Agent server listen port
DEV_SERVER_PORT=3000                    # Dev server listen port
CLAUDE_CONFIG_DIR=/workspace/.claude    # Claude Code config location
ANTHROPIC_API_KEY=sk-ant-...           # API key for Claude Agent SDK
```

---

## EKS Implementation Guide

### Architecture Differences

| Aspect | Docker/Podman | Kubernetes/EKS |
|--------|---------------|----------------|
| Container ID | Container SHA | Pod name |
| Discovery | Label filter | Label selectors, watch API |
| Network | Bridge network | Service DNS, ClusterIP |
| Agent URL | `localhost:31100` | `app-123.default.svc:3100` |
| Port Allocation | Manual in-memory | Service port allocation |
| Volumes | Named volumes | PersistentVolumeClaims |
| Routing | Traefik Docker labels | Ingress/IngressRoute |
| Logging | Container logs stream | Pod logs API |
| Health Check | Manual HTTP polling | K8s probes |

### Required Implementation

#### 1. Create `kubernetes.orchestrator.ts`

```typescript
export class KubernetesOrchestrator implements ContainerOrchestrator {
  private k8sClient: KubernetesClient;

  async spawnContainer(config: SpawnContainerConfig): Promise<ContainerInfo> {
    // 1. Create PersistentVolumeClaim for app files
    // 2. Create Pod with app-container image
    // 3. Create Service for internal DNS
    // 4. Create Ingress for preview routing
    // 5. Return ContainerInfo with K8s-specific URLs
  }

  async stopContainer(containerId: string): Promise<void> {
    // Delete Pod, Service, Ingress
    // Keep PVC for data persistence
  }
}
```

#### 2. Kubernetes Resource Mapping

**Pod Spec:**
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-{appId}
  labels:
    kova.app-container: "true"
    kova.app.id: "{appId}"
spec:
  containers:
  - name: app-container
    image: kova-app-container:latest
    ports:
    - containerPort: 3000  # Dev server
    - containerPort: 3100  # Agent server
    volumeMounts:
    - name: app-files
      mountPath: /workspace
    resources:
      limits:
        memory: 2Gi
        cpu: 2
  volumes:
  - name: app-files
    persistentVolumeClaim:
      claimName: app-{appId}-pvc
```

**Service:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: app-{appId}
spec:
  selector:
    kova.app.id: "{appId}"
  ports:
  - name: agent
    port: 3100
  - name: dev
    port: 3000
```

**Ingress:**
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-{appId}
spec:
  rules:
  - host: app-{appId}.{PREVIEW_DOMAIN}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: app-{appId}
            port:
              number: 3000
```

#### 3. Configuration Extension

```typescript
interface KubernetesOrchestratorConfig extends OrchestratorConfig {
  kubeconfig?: string;
  namespace: string;
  imagePullSecrets?: string[];
  storageClass: string;
  ingressClassName: string;
  ingressDomain: string;
}
```

#### 4. Factory Pattern Integration

**Location:** `backend/src/services/orchestrator/index.ts`

```typescript
export function createOrchestrator(type: string): ContainerOrchestrator {
  switch(type) {
    case 'podman': return new PodmanOrchestrator(config);
    case 'kubernetes': return new KubernetesOrchestrator(config);
    case 'ecs': return new ECSOrchestrator(config);
    default: throw new Error(`Unknown orchestrator: ${type}`);
  }
}
```

---

## Migration Path

### Phase 1: Decouple from Docker
1. Integrate `PodmanOrchestrator` into backend (replace direct Docker calls)
2. Update all container service calls to use interface
3. Add `ORCHESTRATOR_TYPE` environment variable

### Phase 2: Implement Kubernetes Orchestrator
1. Create `KubernetesOrchestrator` class
2. Implement Pod/Service/Ingress management
3. Add kubeconfig authentication
4. Handle PersistentVolumeClaim lifecycle

### Phase 3: EKS-Specific Features
1. EBS volume provisioner for storage
2. IAM roles for pod authentication
3. ALB Ingress Controller or Traefik CRDs
4. Auto-scaling policies

### Phase 4: Testing & Validation
1. Integration tests with minikube/kind
2. Load testing (concurrent containers)
3. Failover testing (pod eviction)
4. Idle cleanup validation

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `backend/src/services/orchestrator/types.ts` | Interface definitions |
| `backend/src/services/orchestrator/podman.orchestrator.ts` | Current implementation |
| `backend/src/services/app-container.service.ts` | Legacy service (to migrate) |
| `backend/src/config/index.ts` | Configuration schema |
| `backend/src/api/routes/app-execution.routes.ts` | API endpoints using containers |
| `backend/src/websocket/handlers/chat-stream.handler.ts` | Agent communication |
| `app-container/Dockerfile` | Container image definition |
| `app-container/src/server.ts` | Dual server startup |
| `docker-compose.yml` | Local orchestration |
| `traefik/traefik.yml` | Reverse proxy config |
