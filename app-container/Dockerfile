# App Container for Kova
# Runs Claude Agent SDK + Dev Server for user apps

FROM node:22-alpine

# Install git (required by Claude Code CLI) and other utilities
RUN apk add --no-cache git bash

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user for running the agent
# This is required because Claude Code CLI refuses --dangerously-skip-permissions when running as root
RUN addgroup -g 1001 kova && \
    adduser -u 1001 -G kova -s /bin/sh -D kova

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
