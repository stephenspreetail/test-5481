# Configuration Reference

## Overview

Kova uses a single `.env` file at the repository root for all configuration. The backend validates all configuration via a Zod schema at startup (`backend/src/config/index.ts`). Invalid or missing required values cause the backend to crash with clear error messages.

**Config flow**: `.env` → `process.env` → Zod validation → `config` object → passed to containers at runtime.

To get started:
```sh
cp .env.example .env
# Edit .env with your values
```

## Scope Matrix

Complete table of every environment variable:

| Variable | Scope | Required | Validation | Default | Description |
|----------|-------|----------|------------|---------|-------------|
| **AI / LLM** |
| AGENT_MODEL | Backend → Container | Yes | `string().min(1)` | — | Claude model ID (Bedrock format like `claude-sonnet-4-5-20250929-v1:0` or Anthropic format like `claude-sonnet-4-5-20250929`) |
| CLAUDE_CODE_USE_BEDROCK | Backend → Container | Yes | `enum(["0","1"])` | — | `1` = use AWS Bedrock, `0` = use Anthropic API |
| ANTHROPIC_API_KEY | Backend → Container | Conditional | `string().optional()` | — | Required if `CLAUDE_CODE_USE_BEDROCK=0`. Get from https://console.anthropic.com/settings/keys |
| AWS_AUTH_MODE | Backend → Container | Conditional | `enum(["explicit","pod-identity"]).optional()` | — | Required if `CLAUDE_CODE_USE_BEDROCK=1`. Use `explicit` for local dev, `pod-identity` for EKS Pod Identity |
| AWS_REGION | Backend → Container | Conditional | `string().optional()` | — | Required if `CLAUDE_CODE_USE_BEDROCK=1` (e.g., `us-east-1`) |
| AWS_ACCESS_KEY_ID | Backend → Container | Conditional | `string().optional()` | — | Only passed when `AWS_AUTH_MODE=explicit`. Obtained from AWS SSO session |
| AWS_SECRET_ACCESS_KEY | Backend → Container | Conditional | `string().optional()` | — | Only passed when `AWS_AUTH_MODE=explicit`. Obtained from AWS SSO session |
| AWS_SESSION_TOKEN | Backend → Container | Conditional | `string().optional()` | — | Only passed when `AWS_AUTH_MODE=explicit`. Obtained from AWS SSO session |
| **Database** |
| DATABASE_URL | Backend | Yes | `string().min(1)` | — | PostgreSQL connection string (e.g., `postgresql://kova:password@localhost:5433/kova`) |
| **Security** |
| JWT_ACCESS_EXPIRES_IN | Backend | Yes | `regex: ^\d+[smhd]$` | — | Access token lifetime. Format: number + unit (s/m/h/d). Example: `15m` |
| JWT_REFRESH_EXPIRES_IN | Backend | Yes | `regex: ^\d+[smhd]$` | — | Refresh token lifetime. Format: number + unit (s/m/h/d). Example: `7d` |
| JWT_SECRET | Backend | Yes | `string().min(32)` | — | HMAC signing key for JWTs. Generate with `openssl rand -hex 32` |
| ENCRYPTION_KEY | Backend | Yes | `regex: ^[0-9a-fA-F]{64}$` | — | 32-byte hex key for encryption. Generate with `openssl rand -hex 32` |
| **Internal Services** |
| PROGET_API_KEY | Backend → Container | Yes | `string().min(1)` | — | ProGet API key for accessing `@spreetail` npm packages |
| DATA_PLATFORM_HOST | Backend → Container | Yes | `string().min(1)` | — | Starburst Galaxy / Trino host (e.g., `spreetail.routing.trino.galaxy.starburst.io`) |
| DATA_PLATFORM_USER | Backend → Container | Yes | `string().min(1)` | — | Trino service account username |
| DATA_PLATFORM_PASSWORD | Backend → Container | Yes | `string().min(1)` | — | Trino service account password. Escape `$` as `\$` in Bun |
| DATA_PLATFORM_PORT | Backend | No | `coerce.number()` | `443` | Trino port |
| DATA_PLATFORM_SSL | Backend | No | `string()` | `"true"` | Enable TLS for Trino connections |
| **Server** |
| NODE_ENV | Backend | Yes | `enum(["development","production","test"])` | — | Runtime environment |
| BACKEND_HOST | Backend | Yes | `string().min(1)` | — | Server bind address (e.g., `0.0.0.0` or `127.0.0.1`) |
| BACKEND_PORT | Backend | Yes | `coerce.number().min(1)` | — | Server port (e.g., `3002`) |
| CORS_ORIGIN | Backend | No | `string().optional()` | — | Allowed CORS origin (e.g., `http://localhost:5174`) |
| **Docker Connectivity** |
| DOCKER_USE_SOCKET | Backend | Yes | `enum(["0","1"])` | — | `1` = socket mode, `0` = TCP mode |
| DOCKER_SOCKET | Backend | Conditional | `string().optional()` | — | Required if `DOCKER_USE_SOCKET=1`. Path to Docker socket. Auto-detected if omitted |
| DOCKER_URL_HOST | Backend | Conditional | `string().optional()` | — | Required if `DOCKER_USE_SOCKET=0`. Docker daemon host/IP |
| DOCKER_URL_PORT | Backend | Conditional | `string().optional()` | — | Required if `DOCKER_USE_SOCKET=0`. Docker daemon port (typically `2375`) |
| **Container Settings** |
| CONTAINER_IMAGE | Backend | Yes | `string().min(1)` | — | Docker image for app containers (e.g., `kova-app-container:latest`) |
| CONTAINER_NETWORK | Backend | Yes | `string().min(1)` | — | Docker network name (e.g., `kova-network`) |
| CONTAINER_IDLE_TIMEOUT_MS | Backend | Yes | `coerce.number().min(1)` | — | Milliseconds before idle containers are stopped (e.g., `900000` = 15 minutes) |
| CONTAINER_SCAN_INTERVAL_MS | Backend | Yes | `coerce.number().min(1)` | — | Milliseconds between container health scans (e.g., `16000` = 16 seconds) |
| CONTAINER_AGENT_PORT | Backend | Yes | `coerce.number().min(1)` | — | Agent HTTP port inside container (e.g., `3100`) |
| CONTAINER_DEV_PORT | Backend | Yes | `coerce.number().min(1)` | — | Dev server port inside container (e.g., `3000`) |
| APPS_BASE_PATH | Backend | Yes | `string().min(1)` | — | Base directory for app files on host (e.g., `./backend/apps`) |
| **Preview** |
| PREVIEW_DOMAIN | Backend | Yes | `string().min(1)` | — | Traefik preview domain (e.g., `localhost`) |
| PREVIEW_PORT | Backend | Yes | `coerce.number().min(1)` | — | Traefik entrypoint port (e.g., `8081`) |
| **Logging** |
| VERBOSE_AGENT_LOGGING | Backend → Container | Yes | `enum(["0","1"])` | — | `1` = verbose Claude SDK message logging, `0` = minimal |
| **Frontend** |
| VITE_API_URL | Frontend | Yes | Not validated by backend | — | Backend API URL for Vite dev proxy (e.g., `http://localhost:3002`) |

### Scope Definitions

- **Backend** - Only used by the backend server (`backend/src/`)
- **Backend → Container** - Validated by backend, passed to app containers at runtime
- **Frontend** - Only used by Vite/frontend build (`src/`, `vite.config.ts`)
- **Script** - Only used by helper scripts (`scripts/`)

## Cross-Field Validation Rules

The Zod schema enforces two critical cross-field validation rules that check combinations of values. Both must pass for the backend to start.

### LLM Provider Validation

Exactly ONE of these configurations must be complete:

**Option A: Anthropic API**
- `CLAUDE_CODE_USE_BEDROCK=0` AND
- `ANTHROPIC_API_KEY` is set

**Option B: AWS Bedrock**
- `CLAUDE_CODE_USE_BEDROCK=1` AND
- `AWS_AUTH_MODE` is set AND
- `AWS_REGION` is set AND
- `AWS_ACCESS_KEY_ID` is set AND
- `AWS_SECRET_ACCESS_KEY` is set AND
- `AWS_SESSION_TOKEN` is set

**Error message if validation fails:**
```
Either CLAUDE_CODE_USE_BEDROCK = 0 with ANTHROPIC_API_KEY -OR- CLAUDE_CODE_USE_BEDROCK = 1 with complete AWS Bedrock config (AWS_AUTH_MODE, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN) is required
```

### Docker Mode Validation

Exactly ONE of these configurations must be complete:

**Option A: Socket Mode**
- `DOCKER_USE_SOCKET=1` AND
- `DOCKER_SOCKET` is set

**Option B: TCP Mode**
- `DOCKER_USE_SOCKET=0` AND
- `DOCKER_URL_HOST` is set AND
- `DOCKER_URL_PORT` is set

**Error message if validation fails:**
```
Either DOCKER_USE_SOCKET = 1 with DOCKER_SOCKET -OR- DOCKER_USE_SOCKET = 0 with DOCKER_URL_HOST and DOCKER_URL_PORT is required
```

## Container Environment Injection

When the backend starts an app container, it injects environment variables from the validated config. This happens in `backend/src/services/app-container.service.ts`.

### Always Passed to Containers

These variables are always set in the container environment:

| Variable | Source | Notes |
|----------|--------|-------|
| CLAUDE_CODE_USE_BEDROCK | `.env` | `"0"` or `"1"` — tells container which LLM provider to use |
| AGENT_MODEL | `.env` | Claude model ID |
| VERBOSE_AGENT_LOGGING | `.env` | `"0"` or `"1"` |
| PROGET_API_KEY | `.env` | Empty string if not configured |
| DATA_PLATFORM_HOST | `.env` | Trino host |
| DATA_PLATFORM_USER | `.env` | Trino username |
| DATA_PLATFORM_PASSWORD | `.env` | Trino password |

### Conditionally Passed (LLM Provider)

LLM credentials are passed based on the `CLAUDE_CODE_USE_BEDROCK` toggle:

**When `CLAUDE_CODE_USE_BEDROCK=0` (Anthropic API):**

| Variable | Source | When Passed |
|----------|--------|-------------|
| ANTHROPIC_API_KEY | `.env` | Only if `CLAUDE_CODE_USE_BEDROCK=0` |

**When `CLAUDE_CODE_USE_BEDROCK=1` (AWS Bedrock):**

| Variable | Source | When Passed |
|----------|--------|-------------|
| AWS_REGION | `.env` | Always when `CLAUDE_CODE_USE_BEDROCK=1` |
| AWS_ACCESS_KEY_ID | `.env` | Only if `CLAUDE_CODE_USE_BEDROCK=1` AND `AWS_AUTH_MODE=explicit` |
| AWS_SECRET_ACCESS_KEY | `.env` | Only if `CLAUDE_CODE_USE_BEDROCK=1` AND `AWS_AUTH_MODE=explicit` |
| AWS_SESSION_TOKEN | `.env` | Only if `CLAUDE_CODE_USE_BEDROCK=1` AND `AWS_AUTH_MODE=explicit` |

When `AWS_AUTH_MODE=pod-identity`, the STS credentials are NOT passed. The container's AWS SDK will discover credentials from EKS Pod Identity instead.

### Container-Specific Variables

These are generated by the backend and NOT from `.env`:

| Variable | Source | Description |
|----------|--------|-------------|
| APP_ID | Generated | UUID of the Kova app |
| WORKSPACE_DIR | Hardcoded | `/workspace` (container path) |
| AGENT_PORT | Derived from `CONTAINER_AGENT_PORT` | Agent HTTP port inside container |
| DEV_SERVER_PORT | Derived from `CONTAINER_DEV_PORT` | Dev server port inside container |
| CLAUDE_CONFIG_DIR | Hardcoded | `/workspace/.claude` (persisted via bind mount) |

## Platform-Specific Notes

### Docker Socket Paths

The Docker socket path varies by platform and container runtime:

| Platform | Runtime | Path |
|----------|---------|------|
| Linux | Docker | `/var/run/docker.sock` |
| Linux | Podman | `/run/podman/podman.sock` |
| macOS | Docker Desktop | `/var/run/docker.sock` |
| macOS | Rancher Desktop | `~/.rd/docker.sock` |
| macOS | Colima | `~/.colima/default/docker.sock` |
| Windows | Docker Desktop | `//./pipe/docker_engine` (via WSL2) |
| Windows | Rancher Desktop | Via WSL2 path or use TCP mode |
| Windows | Podman Desktop | Use TCP mode (see below) |

### Socket Auto-Detection

When `DOCKER_USE_SOCKET=1` and `DOCKER_SOCKET` is NOT set, the backend attempts to auto-detect the socket path. It tries these paths in order:

1. `/var/run/docker.sock` (standard Docker/Podman on Linux)
2. `~/.rd/docker.sock` (Rancher Desktop on macOS)
3. `~/.docker/run/docker.sock` (newer Docker Desktop versions)

If none of these paths exist or are accessible, the backend will fail to start. In this case, explicitly set `DOCKER_SOCKET` or use TCP mode.

### TCP Mode (Podman on Windows)

When using Podman Desktop on Windows, the Docker socket is isolated inside the Podman Machine WSL2 distro and is NOT accessible from the Windows host. Use TCP mode instead:

1. **Enable the Podman API service on TCP** inside the Podman Machine:
   ```sh
   podman system service --time=0 tcp:0.0.0.0:2375
   ```

2. **Find the WSL2 IP address**:
   ```powershell
   wsl -d podman-machine-default -- hostname -I
   ```

3. **Configure `.env` for TCP mode**:
   ```
   DOCKER_USE_SOCKET=0
   DOCKER_URL_HOST=172.x.x.x  # WSL2 IP from step 2
   DOCKER_URL_PORT=2375
   ```

For detailed Podman Windows setup, see `docs/podman-windows-troubleshooting.md`.

### Windows Path Considerations

On Windows, you may need to adjust `APPS_BASE_PATH` depending on your shell:

- **PowerShell/CMD**: Use forward slashes or double backslashes
  ```
  APPS_BASE_PATH=./backend/apps
  APPS_BASE_PATH=.\\backend\\apps
  ```

- **WSL2**: Use absolute Linux-style paths if running backend inside WSL2
  ```
  APPS_BASE_PATH=/home/username/kova/backend/apps
  ```

## AWS Bedrock Configuration

### Local Development (AWS SSO)

For local development with AWS Bedrock, use the helper scripts to automatically configure AWS credentials:

**Linux/macOS:**
```sh
source ./scripts/refresh-aws-sso.sh
```

**Windows (PowerShell):**
```powershell
.\scripts\refresh-aws-sso.ps1
```

These scripts:
1. Log you into AWS SSO
2. Export temporary credentials (expires in 8-12 hours)
3. Set all required environment variables

The scripts automatically set:
- `CLAUDE_CODE_USE_BEDROCK=1`
- `AWS_AUTH_MODE=explicit`
- `AWS_REGION` (from AWS profile)
- `AGENT_MODEL` (from `$BEDROCK_MODEL` env var or default)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`

### Production Deployment (EKS Pod Identity)

For production deployments on EKS with Pod Identity:

1. **Configure EKS Pod Identity** to grant the pod access to Bedrock
2. **Set in `.env`:**
   ```
   CLAUDE_CODE_USE_BEDROCK=1
   AWS_AUTH_MODE=pod-identity
   AWS_REGION=us-east-1
   AGENT_MODEL=claude-sonnet-4-5-20250929-v1:0
   ```
3. **DO NOT set** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or `AWS_SESSION_TOKEN`

The AWS SDK inside containers will automatically discover credentials from the Pod Identity webhook.

## Security Best Practices

### Secret Management

1. **NEVER commit `.env` to version control**
   - `.env` is in `.gitignore` by default
   - Use `.env.example` as a template

2. **Generate strong secrets:**
   ```sh
   # JWT_SECRET and ENCRYPTION_KEY
   openssl rand -hex 32
   ```

3. **Rotate credentials regularly:**
   - AWS SSO sessions expire (re-run refresh script)
   - Rotate JWT secrets on a schedule
   - Update service account passwords quarterly

### Production Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production`
- [ ] Use strong, randomly-generated `JWT_SECRET` (≥32 chars)
- [ ] Use strong, randomly-generated `ENCRYPTION_KEY` (64 hex chars)
- [ ] Configure proper `CORS_ORIGIN` (not `*`)
- [ ] Use TLS-enabled DATABASE_URL
- [ ] Store secrets in a secret manager (AWS Secrets Manager, Vault, etc.)
- [ ] Set appropriate `JWT_ACCESS_EXPIRES_IN` (short, e.g., 15m)
- [ ] Set appropriate `JWT_REFRESH_EXPIRES_IN` (longer, e.g., 7d)
- [ ] Enable audit logging
- [ ] Review container resource limits

## Troubleshooting

### Backend Won't Start

**Symptom:** Backend crashes on startup with validation errors.

**Solution:** Check the error message carefully. The Zod schema provides specific error messages:

```
Invalid configuration:
{
  _errors: [],
  JWT_SECRET: { _errors: [ 'JWT_SECRET must be at least 32 characters' ] }
}
```

Fix the specific fields mentioned in the error.

### "Either CLAUDE_CODE_USE_BEDROCK..." Error

**Symptom:** Backend crashes with LLM provider validation error.

**Solution:** You must configure EITHER Anthropic OR Bedrock, not both or neither:

- For Anthropic: Set `CLAUDE_CODE_USE_BEDROCK=0` and `ANTHROPIC_API_KEY`
- For Bedrock: Set `CLAUDE_CODE_USE_BEDROCK=1` and all AWS variables

### "Either DOCKER_USE_SOCKET..." Error

**Symptom:** Backend crashes with Docker mode validation error.

**Solution:** You must configure EITHER socket OR TCP mode:

- For socket: Set `DOCKER_USE_SOCKET=1` and `DOCKER_SOCKET`
- For TCP: Set `DOCKER_USE_SOCKET=0`, `DOCKER_URL_HOST`, and `DOCKER_URL_PORT`

### Container Can't Connect to Database

**Symptom:** App containers fail to connect to Trino/data platform.

**Solution:** Check these variables:
- `DATA_PLATFORM_HOST` - Should be the full hostname
- `DATA_PLATFORM_USER` - Service account username
- `DATA_PLATFORM_PASSWORD` - Escape `$` characters as `\$` in Bun
- `DATA_PLATFORM_PORT` - Usually `443` for TLS
- `DATA_PLATFORM_SSL` - Should be `"true"` for production

### Vite Can't Connect to Backend

**Symptom:** Frontend shows network errors or can't reach API.

**Solution:** Check `VITE_API_URL` matches where the backend is running:
- Local dev: `http://localhost:3002`
- Custom port: `http://localhost:<BACKEND_PORT>`

### Preview Apps Don't Load

**Symptom:** Preview iframe shows 404 or connection refused.

**Solution:** Check Traefik configuration:
- `PREVIEW_DOMAIN` - Should match Traefik config (usually `localhost`)
- `PREVIEW_PORT` - Should match Traefik entrypoint (usually `8081`)
- Verify Traefik is running: `docker compose ps traefik`
- Verify container network: `CONTAINER_NETWORK` should match Traefik network

## Example Configurations

### Local Development (Anthropic API)

```sh
# AI / LLM
AGENT_MODEL=claude-sonnet-4-5-20250929
CLAUDE_CODE_USE_BEDROCK=0
ANTHROPIC_API_KEY=sk-ant-api03-xxx

# Database
DATABASE_URL=postgresql://kova:kova_dev_password@localhost:5433/kova

# Security
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
JWT_SECRET=your-32-char-secret-here-xxxxxxxxxx
ENCRYPTION_KEY=your-64-hex-char-key-here-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Internal Services
PROGET_API_KEY=your-proget-key
DATA_PLATFORM_HOST=spreetail.routing.trino.galaxy.starburst.io
DATA_PLATFORM_USER=service_account
DATA_PLATFORM_PASSWORD=password-here
DATA_PLATFORM_PORT=443
DATA_PLATFORM_SSL=true

# Server
NODE_ENV=development
BACKEND_HOST=0.0.0.0
BACKEND_PORT=3002
CORS_ORIGIN=http://localhost:5174

# Docker (socket mode)
DOCKER_USE_SOCKET=1
DOCKER_SOCKET=/var/run/docker.sock

# Container Settings
CONTAINER_IMAGE=kova-app-container:latest
CONTAINER_NETWORK=kova-network
CONTAINER_IDLE_TIMEOUT_MS=900000
CONTAINER_SCAN_INTERVAL_MS=16000
CONTAINER_AGENT_PORT=3100
CONTAINER_DEV_PORT=3000
APPS_BASE_PATH=./backend/apps

# Preview
PREVIEW_DOMAIN=localhost
PREVIEW_PORT=8081

# Logging
VERBOSE_AGENT_LOGGING=1

# Frontend
VITE_API_URL=http://localhost:3002
```

### Local Development (AWS Bedrock + SSO)

```sh
# AI / LLM (set by refresh-aws-sso script)
AGENT_MODEL=claude-sonnet-4-5-20250929-v1:0
CLAUDE_CODE_USE_BEDROCK=1
AWS_AUTH_MODE=explicit
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=ASIA...
AWS_SECRET_ACCESS_KEY=xxx...
AWS_SESSION_TOKEN=IQo...

# Database
DATABASE_URL=postgresql://kova:kova_dev_password@localhost:5433/kova

# Security
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
JWT_SECRET=your-32-char-secret-here-xxxxxxxxxx
ENCRYPTION_KEY=your-64-hex-char-key-here-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Internal Services
PROGET_API_KEY=your-proget-key
DATA_PLATFORM_HOST=spreetail.routing.trino.galaxy.starburst.io
DATA_PLATFORM_USER=service_account
DATA_PLATFORM_PASSWORD=password-here
DATA_PLATFORM_PORT=443
DATA_PLATFORM_SSL=true

# Server
NODE_ENV=development
BACKEND_HOST=0.0.0.0
BACKEND_PORT=3002
CORS_ORIGIN=http://localhost:5174

# Docker (socket mode)
DOCKER_USE_SOCKET=1
DOCKER_SOCKET=/var/run/docker.sock

# Container Settings
CONTAINER_IMAGE=kova-app-container:latest
CONTAINER_NETWORK=kova-network
CONTAINER_IDLE_TIMEOUT_MS=900000
CONTAINER_SCAN_INTERVAL_MS=16000
CONTAINER_AGENT_PORT=3100
CONTAINER_DEV_PORT=3000
APPS_BASE_PATH=./backend/apps

# Preview
PREVIEW_DOMAIN=localhost
PREVIEW_PORT=8081

# Logging
VERBOSE_AGENT_LOGGING=1

# Frontend
VITE_API_URL=http://localhost:3002
```

### Production (EKS + Pod Identity)

```sh
# AI / LLM
AGENT_MODEL=claude-sonnet-4-5-20250929-v1:0
CLAUDE_CODE_USE_BEDROCK=1
AWS_AUTH_MODE=pod-identity
AWS_REGION=us-east-1
# AWS credentials NOT set - discovered from Pod Identity

# Database
DATABASE_URL=postgresql://kova:password@rds-host.region.rds.amazonaws.com:5432/kova

# Security
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
JWT_SECRET=<from-secrets-manager>
ENCRYPTION_KEY=<from-secrets-manager>

# Internal Services
PROGET_API_KEY=<from-secrets-manager>
DATA_PLATFORM_HOST=spreetail.routing.trino.galaxy.starburst.io
DATA_PLATFORM_USER=prod_service_account
DATA_PLATFORM_PASSWORD=<from-secrets-manager>
DATA_PLATFORM_PORT=443
DATA_PLATFORM_SSL=true

# Server
NODE_ENV=production
BACKEND_HOST=0.0.0.0
BACKEND_PORT=3002
CORS_ORIGIN=https://kova.example.com

# Docker (TCP mode - if Docker-in-Docker)
DOCKER_USE_SOCKET=0
DOCKER_URL_HOST=127.0.0.1
DOCKER_URL_PORT=2375

# Container Settings
CONTAINER_IMAGE=kova-app-container:v1.0.0
CONTAINER_NETWORK=kova-network
CONTAINER_IDLE_TIMEOUT_MS=1800000
CONTAINER_SCAN_INTERVAL_MS=30000
CONTAINER_AGENT_PORT=3100
CONTAINER_DEV_PORT=3000
APPS_BASE_PATH=/var/lib/kova/apps

# Preview
PREVIEW_DOMAIN=preview.kova.example.com
PREVIEW_PORT=8081

# Logging
VERBOSE_AGENT_LOGGING=0

# Frontend (not used in production - built into static assets)
VITE_API_URL=https://api.kova.example.com
```
