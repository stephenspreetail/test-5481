# =============================================================================
# Production Dockerfile for Kova
# =============================================================================
# Self-contained multi-stage build: deps → build → slim runtime.
#
# SDK_BASE  — build-time image with node-gyp deps (python3, make, g++)
# BASE      — runtime image with system deps (kubectl, AWS CLI, RDS CA bundle)
#
# Defaults point to locally-built base images (see Dockerfile.base-sdk,
# Dockerfile.base). CI overrides these with ECR-hosted equivalents.
# If you don't have local base images, build them first:
#   docker build -f Dockerfile.base-sdk -t kova-base-sdk:latest .
#   docker build -f Dockerfile.base     -t kova-base:latest .
#
# Local:  docker build -t kova:latest .
# CI:     docker build \
#           --build-arg SDK_BASE=<ecr>/kova-base-sdk:latest \
#           --build-arg BASE=<ecr>/kova-base:latest \
#           -t kova .
# =============================================================================

ARG SDK_BASE=kova-base-sdk:latest
ARG BASE=kova-base:latest

# =============================================================================
# Stage 1: Install dependencies
# =============================================================================
FROM ${SDK_BASE} AS deps

WORKDIR /app

COPY package.json bun.lock ./
COPY backend/package.json backend/
COPY packages/agent/package.json packages/agent/
COPY app-container/package.json app-container/

RUN bun install --frozen-lockfile

# =============================================================================
# Stage 2: Build everything (agent, backend, frontend)
# =============================================================================
FROM deps AS build

WORKDIR /app

COPY . .

RUN bun run build:agent
RUN bun run build:backend
RUN bun run build:web

# Prune to production dependencies
RUN rm -rf node_modules && bun install --production --frozen-lockfile

# =============================================================================
# Stage 3: Production runtime
# =============================================================================
FROM ${BASE}

WORKDIR /app

# ---------- Application files ------------------------------------------------

COPY --from=build /app/package.json ./

# Built backend + agent + frontend
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/
COPY --from=build /app/packages/agent/dist ./packages/agent/dist
COPY --from=build /app/packages/agent/package.json ./packages/agent/
COPY --from=build /app/dist/web ./dist/web

# Production node_modules (includes workspace links)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/packages/agent/node_modules ./packages/agent/node_modules

# Migration tooling for Helm pre-upgrade hook (drizzle-kit push)
COPY --from=build /app/backend/src/db/schema.ts ./backend/src/db/
COPY --from=build /app/backend/drizzle.config.ts ./backend/
COPY --from=build /app/backend/scripts/migrate-iam.ts ./backend/scripts/

# ---------- Entrypoint -------------------------------------------------------

COPY scripts/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3002

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["bun", "backend/dist/index.js"]
