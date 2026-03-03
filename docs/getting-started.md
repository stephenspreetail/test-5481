# Getting Started with Kova

## Prerequisites

- Bun >= 1.0.0
- Docker or Podman (OCI-compatible container runtime)
- PostgreSQL (via Docker Compose)
- AWS CLI (if using Bedrock)

## 1. Clone and Install

```bash
git clone <repo-url>
cd app-builder
bun install
```

## 2. Configure Environment

```bash
cp .env.example .env
```

### AI / LLM (Choose ONE)

**Option A: Anthropic API (Direct)**
```bash
CLAUDE_CODE_USE_BEDROCK=0
ANTHROPIC_API_KEY=sk-ant-your-key
AGENT_MODEL=claude-sonnet-4-5-20250929
```

**Option B: AWS Bedrock (Recommended for Spreetail)**
```bash
# Windows:
.\scripts\refresh-aws-sso.ps1

# Linux/macOS:
source ./scripts/refresh-aws-sso.sh
```
The script sets `CLAUDE_CODE_USE_BEDROCK=1`, AWS credentials, `AGENT_MODEL`, and `AWS_AUTH_MODE=explicit`.

SSO credentials expire in 8-12 hours. See [docs/aws-bedrock-setup.md](./aws-bedrock-setup.md) for details.

### Database

```bash
DATABASE_URL=postgresql://kova:kova_dev_password@localhost:5433/kova
```

### Security

```bash
# Generate secrets:
openssl rand -hex 32   # → JWT_SECRET (at least 32 chars)
openssl rand -hex 32   # → ENCRYPTION_KEY (exactly 64 hex chars)

JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

### Docker Connectivity

**Socket mode** (default for Linux/macOS):
```bash
DOCKER_USE_SOCKET=1
DOCKER_SOCKET=/var/run/docker.sock
```

**TCP mode** (required for Podman on Windows):
```bash
DOCKER_USE_SOCKET=0
DOCKER_URL_HOST=172.x.x.x   # WSL2 IP address
DOCKER_URL_PORT=2375
```

See [docs/podman-windows-troubleshooting.md](./podman-windows-troubleshooting.md) for Podman setup.

### Internal Services

```bash
PROGET_API_KEY=your-proget-key
DATA_PLATFORM_HOST=spreetail.routing.trino.galaxy.starburst.io
DATA_PLATFORM_USER=your_username
DATA_PLATFORM_PASSWORD=your_password
DATA_PLATFORM_PORT=443
DATA_PLATFORM_SSL=true
```

## 3. Start Infrastructure

```bash
docker compose build app-container
docker compose up postgres traefik -d
```

## 4. Initialize Database

```bash
bun run db:migrate
```

## 5. Start Development

```bash
bun run dev:full    # Backend (:3002) + Frontend (:5174)
```

Or run separately:
```bash
bun run dev:backend     # Backend API server on :3002
bun run dev:web         # Frontend dev server on :5174
```

## 6. Verify

- Frontend: http://localhost:5174
- Backend API: http://localhost:3002/health
- App previews: http://app-{id}.localhost:8081

## Next Steps

- See [docs/configuration.md](./configuration.md) for the complete configuration reference
- See [docs/aws-bedrock-setup.md](./aws-bedrock-setup.md) for detailed Bedrock setup
- See [docs/containers.md](./containers.md) for container architecture
- See [CLAUDE.md](../CLAUDE.md) for development commands and architecture details
