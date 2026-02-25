#!/bin/bash
# =============================================================================
# App Container Entrypoint Script
# =============================================================================
#
# WHY THIS EXISTS:
# ----------------
# This entrypoint script implements the "gosu pattern" - a Docker best practice
# for handling volume permissions with non-root containers.
#
# THE PROBLEM:
# Docker named volumes are created with root ownership by default. When we mount
# named volumes for node_modules and .claude/skills (to fix Windows symlink issues
# with npm), the container user 'kova' (UID 1001) cannot write to them because
# they're owned by root (UID 0).
#
# THE SOLUTION:
# 1. Container starts as root (to have permission to chown)
# 2. This script fixes ownership of the named volume mount points
# 3. Uses 'gosu' to drop privileges and run the main process as 'kova'
# 4. The main process runs as non-root with PID 1 (proper signal handling)
#
# This pattern is used by official Docker images like PostgreSQL, Redis, etc.
# See: https://denibertovic.com/posts/handling-permissions-with-docker-volumes/
#
# NOTE: Claude Agent SDK refuses to run as root even with --dangerously-skip-permissions,
# so we MUST drop to a non-root user before starting the Node server.
#
# =============================================================================

set -e

# Fix ownership of /workspace bind mount
# The host directory may be owned by the host user (e.g., UID 1000),
# but we need it owned by kova (UID 1001) inside the container
chown kova:kova /workspace 2>/dev/null || true

# Hide lost+found directory (created by ext4 on EBS volumes)
# Vite and other tools fail when scanning workspace and hitting permission errors on lost+found
# Note: This will be unnecessary when we migrate to EFS (NFS-based, no lost+found)
if [ -d /workspace/lost+found ]; then
  chmod 000 /workspace/lost+found 2>/dev/null || true
fi

# Ensure the named volume mount point exists and has correct ownership
# node_modules is mounted as a named volume: app-{id}-modules:/workspace/node_modules
# This fixes npm bin-links/symlink issues on Windows bind mounts
mkdir -p /workspace/node_modules
chown -R kova:kova /workspace/node_modules 2>/dev/null || true

# Ensure .claude directory exists
mkdir -p /workspace/.claude
chown kova:kova /workspace/.claude 2>/dev/null || true

# Clone plugin marketplace from private GitLab repo and load specific plugin
# Agent SDK only supports local plugins, so we must clone first
if [ -n "$GITLAB_TOKEN" ] && [ -n "$KOVA_PLUGIN_REPO" ] && [ -n "$KOVA_PLUGIN_NAME" ]; then
  if [ -z "$KOVA_PLUGIN_BRANCH" ]; then
    echo "[entrypoint] ERROR: KOVA_PLUGIN_BRANCH is required but not set"
    exit 1
  fi
  MARKETPLACE_DIR="/opt/plugins/marketplace"
  PLUGIN_DIR="$MARKETPLACE_DIR/$KOVA_PLUGIN_NAME"
  if [ ! -d "$PLUGIN_DIR/.claude-plugin" ]; then
    # Inject oauth2 token into the clone URL for GitLab auth
    AUTH_URL=$(echo "$KOVA_PLUGIN_REPO" | sed "s|https://|https://oauth2:${GITLAB_TOKEN}@|")
    echo "[entrypoint] Cloning plugin marketplace from $KOVA_PLUGIN_REPO (branch: $KOVA_PLUGIN_BRANCH)"
    GIT_TERMINAL_PROMPT=false gosu kova git clone --depth 1 --branch "$KOVA_PLUGIN_BRANCH" "$AUTH_URL" "$MARKETPLACE_DIR" 2>&1 || echo "[entrypoint] WARNING: Failed to clone plugin marketplace"
    if [ ! -d "$PLUGIN_DIR/.claude-plugin" ]; then
      echo "[entrypoint] ERROR: Plugin '$KOVA_PLUGIN_NAME' not found in marketplace"
    else
      # Install plugin dependencies (MCP servers need @modelcontextprotocol/sdk, etc.)
      if [ -f "$PLUGIN_DIR/package.json" ]; then
        echo "[entrypoint] Installing plugin dependencies..."
        cd "$PLUGIN_DIR" && gosu kova bun-real install --frozen-lockfile 2>&1 || gosu kova bun-real install 2>&1 || echo "[entrypoint] WARNING: Failed to install plugin dependencies"
        cd /app
      fi
    fi
  fi
fi

# Log versions at startup (runs as root before privilege drop)
echo "[entrypoint] ===== Versions ====="
echo "[entrypoint] Bun:              $(bun-real --version 2>/dev/null || echo unknown)"
echo "[entrypoint] Agent SDK:        $(node -e "console.log(require('/app/node_modules/@anthropic-ai/claude-agent-sdk/package.json').version)" 2>/dev/null || echo unknown)"
echo "[entrypoint] Plugin:           ${KOVA_PLUGIN_NAME:-none} (branch: ${KOVA_PLUGIN_BRANCH:-main})"
echo "[entrypoint] ====================="

# Drop privileges and execute the main command as 'kova' user
# Using 'exec' ensures the main process becomes PID 1 for proper signal handling
exec gosu kova "$@"
