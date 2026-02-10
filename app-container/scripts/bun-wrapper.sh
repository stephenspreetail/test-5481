#!/bin/bash
# Bun wrapper that handles dev server control handoff
# When Claude runs `bun dev` or `bun run dev`, this wrapper:
# 1. Signals the managed dev server to release control
# 2. Runs the real bun command (blocks naturally)
# 3. When done, signals to reclaim control

# Use the real bun binary (moved during Docker build)
REAL_BUN=/usr/local/bin/bun-real

# Check if this is a dev server command
if [[ "$1" == "dev" ]] || [[ "$1" == "run" && "$2" == "dev" ]]; then
  echo "🔄 Dev server command detected - coordinating with managed server..."

  # Signal release control
  curl -s -X POST http://localhost:3100/dev-server/release-control > /dev/null 2>&1

  # Wait for port release
  sleep 1

  echo "✓ Running your dev command..."

  # Run the real command (this blocks)
  "$REAL_BUN" "$@"
  EXIT_CODE=$?

  echo ""
  echo "🔄 Dev server stopped - returning control to managed server..."

  # Signal reclaim control
  curl -s -X POST http://localhost:3100/dev-server/reclaim-control > /dev/null 2>&1

  exit $EXIT_CODE
else
  # Not a dev command, just pass through
  exec "$REAL_BUN" "$@"
fi
