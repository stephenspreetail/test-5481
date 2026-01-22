# App Container for Kova
# Runs Claude Agent SDK + Dev Server for user apps

FROM node:22-bookworm-slim

# Install git (required by Claude Code CLI), Python, LibreOffice, and gosu for entrypoint
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    bash \
    gosu \
    python3 \
    python3-pip \
    python3-venv \
    libreoffice-calc-nogui \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages for xlsx skill (pandas, openpyxl)
RUN pip3 install --no-cache-dir --break-system-packages pandas openpyxl

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user for running the agent
# Claude Code CLI refuses to run as root, so we run as 'kova' user via gosu (see entrypoint.sh)
RUN groupadd -g 1001 kova && \
    useradd -u 1001 -g kova -s /bin/bash -m kova

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build TypeScript
RUN npm run build

# Copy skills directory (will be copied to workspace on startup)
COPY skills/ /app/skills/

# Create workspace directory for user app files and set ownership
RUN mkdir -p /workspace && chown -R kova:kova /workspace

# Create .claude directory in workspace for skills (volume will be mounted here at runtime)
RUN mkdir -p /workspace/.claude/skills && chown -R kova:kova /workspace/.claude

# Create .claude directory for config and set ownership
RUN mkdir -p /home/kova/.claude && chown -R kova:kova /home/kova

# Set ownership of app directory
RUN chown -R kova:kova /app

# Configure npm registry for ProGet (internal packages)
# Copy .npmrc template to kova user's home directory
COPY --chown=kova:kova .npmrc.template /home/kova/.npmrc

# Also copy to workspace so it's available for user app builds
COPY --chown=kova:kova .npmrc.template /workspace/.npmrc

# Expose ports:
# 3000 - Dev server (user's app)
# 3100 - Agent server (Claude Agent SDK)
EXPOSE 3000 3100

# Set workspace as default working directory for agent operations
ENV WORKSPACE_DIR=/workspace
ENV HOME=/home/kova

# =============================================================================
# ENTRYPOINT PATTERN FOR VOLUME PERMISSIONS
# =============================================================================
# We use the "gosu entrypoint pattern" to handle named volume permissions.
#
# Problem: Named volumes (for node_modules and .claude/skills) are created with
# root ownership, but Claude Code CLI refuses to run as root.
#
# Solution: Container starts as root, entrypoint.sh fixes volume ownership,
# then uses 'gosu' to drop privileges to 'kova' user before running the app.
#
# This is a Docker best practice used by official images like PostgreSQL/Redis.
# See entrypoint.sh for detailed documentation.
# =============================================================================

# Copy and enable entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# NOTE: We intentionally do NOT use "USER kova" here.
# The entrypoint starts as root to fix volume permissions, then drops to kova.

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/src/server.js"]
