# TanStack Start Initialization

## Overview

Kova uses **Option 1: CLI + Cleanup** for initializing TanStack Start projects. This approach uses the official TanStack CLI and removes demo files post-initialization.

## Why This Approach?

We chose CLI + Cleanup over alternatives (gitpick examples, manual setup) because:
- **Official & Maintained**: Uses TanStack's primary tool, gets updates automatically
- **Reliable**: Predictable initialization every time
- **Simple**: Agent already knows file deletion - no new dependencies needed
- **Future-proof**: When TanStack Start v2 arrives, CLI will be updated
- **Clean Results**: Minimal starting point without demo clutter

## Initialization Workflow

```bash
# 1. Initialize with TanStack Start CLI (fully automated, no prompts)
bun create @tanstack/start@latest .

# 2. Clean up demo files
rm -rf src/routes/demo/ src/data/

# 3. Update __root.tsx: remove demo nav links, change "TANSTACK" to app name

# 4. Start building
```

**Important**: The CLI (v0.46.1+) is **fully automated** - NO interactive prompts, NO need for piping input.

## Files to Delete/Keep

**Delete:** `src/routes/demo/` and `src/data/`

**Keep:** `src/routes/__root.tsx` (update branding & nav), `src/routes/index.tsx`, `src/components/`, `src/router.tsx`, config files

**__root.tsx cleanup:** Remove demo nav links (Dashboard, Posts, Users, etc.) and change "TANSTACK" branding to actual app name

## Common Mistakes to Avoid

### ❌ Wrong Package Name
```typescript
import { createServerFn } from '@tanstack/start'  // WRONG
```
**Correct**: `@tanstack/react-start`

### ❌ Wrong Method Name
```typescript
createServerFn({ method: 'POST' })
  .validator((data: string) => data)  // WRONG - doesn't exist
```
**Correct**: `.inputValidator()` (not `.validator()`)

### ❌ Piping Input to CLI
```bash
echo -e "y\\ny\\n" | bun create @tanstack/start@latest .  // WRONG - not needed
```
**Correct**: Direct execution (CLI is fully automated now)

## Quick Reference

**Initialization:**
```bash
bun create @tanstack/start@latest .
rm -rf src/routes/demo/ src/data/
bun run dev
```

**Key Packages:**
- Core: `@tanstack/react-start` (NOT `@tanstack/start`)
- Router: `@tanstack/react-router`

**Critical Vite Config:**
- `tanstackStart()` must come **before** `viteReact()` in plugins array

## Benefits for Kova

- **User Experience**: Clean apps without example clutter
- **Performance**: Fewer files = faster initial load
- **Clarity**: Users see only their own code
- **Professionalism**: Production-ready structure from the start

---

**Note**: The system prompt includes full API patterns and examples. This document explains the initialization approach and decision rationale.
