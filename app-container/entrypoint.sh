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
# NOTE: Claude Code CLI refuses to run as root even with --dangerously-skip-permissions,
# so we MUST drop to a non-root user before starting the Node server.
#
# =============================================================================

set -e

# Fix ownership of /workspace bind mount
# The host directory may be owned by the host user (e.g., UID 1000),
# but we need it owned by kova (UID 1001) inside the container
chown kova:kova /workspace 2>/dev/null || true

# Ensure the named volume mount point exists and has correct ownership
# node_modules is mounted as a named volume: app-{id}-modules:/workspace/node_modules
# This fixes npm bin-links/symlink issues on Windows bind mounts
mkdir -p /workspace/node_modules
chown -R kova:kova /workspace/node_modules 2>/dev/null || true

# Ensure .claude directory exists for kovaQuery to copy skills into
# Skills are automatically copied at runtime by @kova/agent's kovaQuery function
mkdir -p /workspace/.claude
chown kova:kova /workspace/.claude 2>/dev/null || true

# Drop privileges and execute the main command as 'kova' user
# Using 'exec' ensures the main process becomes PID 1 for proper signal handling
exec gosu kova "$@"
