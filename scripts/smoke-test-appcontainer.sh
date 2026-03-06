#!/usr/bin/env bash
# Smoke test for the kova-app-container image.
# Verifies that curl and Playwright (Chromium) are installed and functional.
#
# Usage:
#   ./scripts/smoke-test-appcontainer.sh                  # uses kova-app-container:latest
#   ./scripts/smoke-test-appcontainer.sh my-image:tag     # uses specified image

set -euo pipefail

IMAGE="${1:-kova-app-container:latest}"
PASS=0
FAIL=0

run_check() {
  local name="$1"
  shift
  if docker run --rm --entrypoint="" "$IMAGE" "$@" >/dev/null 2>&1; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name"
    FAIL=$((FAIL + 1))
  fi
}

run_check_output() {
  local name="$1"
  local expected="$2"
  shift 2
  local output
  output=$(docker run --rm --entrypoint="" "$IMAGE" "$@" 2>&1)
  if echo "$output" | grep -q "$expected"; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected '$expected' in output)"
    echo "    Output: $output"
    FAIL=$((FAIL + 1))
  fi
}

echo "Smoke testing image: $IMAGE"

echo ""
echo "--- Core tools ---"
run_check "curl available"      curl --version
run_check "bun available"       bun-real --version
run_check "playwright CLI"      playwright --version

echo ""
echo "--- Playwright Chromium ---"
run_check_output "PLAYWRIGHT_BROWSERS_PATH set" "/ms-playwright" \
  sh -c 'echo $PLAYWRIGHT_BROWSERS_PATH'
run_check_output "NODE_PATH set" "/app/node_modules" \
  sh -c 'echo $NODE_PATH'
run_check_output "Chromium binary exists" "chrome" \
  sh -c 'find /ms-playwright -name "chrome" -type f 2>/dev/null | head -1'

echo ""
echo "--- Playwright launch test ---"
if docker run --rm --entrypoint="" \
    -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    -e NODE_PATH=/app/node_modules \
    "$IMAGE" \
    gosu kova bun --eval "
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent('<h1>smoke test</h1>');
const title = await page.evaluate(() => document.querySelector('h1').textContent);
if (title !== 'smoke test') throw new Error('unexpected: ' + title);
await browser.close();
" >/dev/null 2>&1; then
  echo "  ✓ Playwright can launch Chromium and evaluate JS"
  PASS=$((PASS + 1))
else
  echo "  ✗ Playwright launch failed"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
