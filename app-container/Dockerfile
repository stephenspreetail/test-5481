# App Container for Kova
# Runs Claude Agent SDK + Dev Server for user apps

FROM node:22-bookworm-slim

# Build argument for ProGet API key (optional, can also be set at runtime)
ARG PROGET_API_KEY

# Install git (required by Claude Code CLI) and other utilities
RUN apt-get update && apt-get install -y --no-install-recommends git bash gettext-base && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user for running the agent
# This is required because Claude Code CLI refuses --dangerously-skip-permissions when running as root
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

# Create workspace directory for user app files and set ownership
RUN mkdir -p /workspace && chown -R kova:kova /workspace

# Create .claude directory for config and set ownership
RUN mkdir -p /home/kova/.claude && chown -R kova:kova /home/kova

# Set ownership of app directory
RUN chown -R kova:kova /app

# Configure npm registry for ProGet (internal packages)
# Copy .npmrc template to kova user's home directory
COPY --chown=kova:kova .npmrc.template /home/kova/.npmrc

# Also copy to workspace so it's available for user app builds
COPY --chown=kova:kova .npmrc.template /workspace/.npmrc

# Set PROGET_API_KEY as environment variable (will be used by npm at runtime)
ENV PROGET_API_KEY=${PROGET_API_KEY}

# Expose ports:
# 3000 - Dev server (user's app)
# 3100 - Agent server (Claude Agent SDK)
EXPOSE 3000 3100

# Set workspace as default working directory for agent operations
ENV WORKSPACE_DIR=/workspace
ENV HOME=/home/kova

# Switch to non-root user
USER kova

# Start the server
CMD ["node", "dist/server.js"]
