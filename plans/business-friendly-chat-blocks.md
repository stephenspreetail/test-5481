---
planStatus:
  planId: plan-business-friendly-chat-blocks
  title: Business-Friendly Chat Content Blocks
  status: draft
  planType: improvement
  priority: medium
  owner: stephen.howard
  stakeholders: []
  tags:
    - ux
    - chat-ui
    - content-blocks
  created: "2026-02-23"
  updated: "2026-02-23T17:35:00.000Z"
  progress: 0
---
# Business-Friendly Chat Content Blocks

## Problem

The current chat UI displays technical details about the agent's work — tool names like `Skill`, `TodoWrite`, `Bash`, `Write`, `Read`, raw file paths like `routes/__root.tsx`, and shell commands like `bun install 2>&1`. This is confusing and noisy for business users who just want to build an app.

### Example of current technical display (from real "hello world app" session)

The user sees blocks like:
- "Using init-project skill" (what's a skill?)
- "Planning" / "Copy template files to workspace" (TodoWrite tool)
- `cp -r /workspace/.claude/templates/tanstack-start/* /work...` (bash commands)
- `bun install 2>&1` (package manager commands)
- "Reading" `routes/__root.tsx` (raw file paths)
- "Editing" `routes/index.tsx`
- `bun run typecheck 2>&1 || bun tsc --noEmit 2>&1` (build commands)
- `bun run build 2>&1`

## Role-Based Rendering

The display mode depends on the logged-in user's role:

- **`business`**** role** — Shows the new phase-based, business-friendly content blocks (this plan's mockup)
- **`developer`**** role** — Shows the existing technical tool-call display (current behavior, unchanged)

### Current State of Role System

The `users` table (`backend/src/db/schema.ts`) and `UserSettings` schema (`src/lib/schemas.ts`) do **not** currently have a role field. This feature requires:

1. **Add \****`role`***\* column to \****`users`**\*\* table** — `varchar("role", { enum: ["business", "developer"] }).notNull().default("business")`
2. **Expose role in auth response** — The JWT payload and `/api/auth/me` endpoint should include the user's role
3. **Frontend access** — Add `role` to the auth context/hook so components can check `user.role`
4. **Seed script** — Update `seed:dev-user` to set the dev user's role (default `developer` for dev, `business` for production)

### Rendering Strategy

The `ContentBlockRenderer` component (or equivalent) receives the raw streaming events and renders them differently based on role:

```tsx
function ContentBlockRenderer({ blocks, userRole }) {
  if (userRole === "business") {
    return <PhaseBasedDisplay blocks={blocks} />;   // New business-friendly UI
  }
  return <TechnicalDisplay blocks={blocks} />;       // Existing tool-call UI
}
```

Both renderers consume the same underlying event stream — the difference is purely in the UI layer.

## Proposed Solution — Business Role Display

Replace technical content blocks with business-user-friendly equivalents that describe *what's happening* in plain language, grouped into logical phases:

### Phase-Based Activity Display

Instead of showing individual tool calls, group related activities into **phases** that a business user understands:

1. **Setting up project** — Encompasses template copying, dependency installation
2. **Building your app** — Writing code, creating components, editing files
3. **Checking everything works** — Type checking, build verification

### Content Block Mapping

| Technical Event | Business-Friendly Display |
| --- | --- |
| Skill (init-project) | *Hidden* — absorbed into "Setting up project" phase |
| TodoWrite (planning) | *Hidden* — internal planning, not user-facing |
| Bash (cp template files) | "Setting up project files" |
| Bash (bun install) | "Installing dependencies" (with progress feel) |
| Read (file) | *Hidden* or collapsed — internal investigation |
| Write/Edit (file) | "Creating [component name]" / "Updating [page name]" — friendly names |
| Bash (typecheck) | "Checking for errors" |
| Bash (build) | "Building your app" |
| Text blocks | Shown as-is (already user-friendly) |

### UI Design Principles

1. **Progress-oriented**: Show a clear sense of forward motion
2. **Outcome-focused**: "Created the homepage" not "Write routes/index.tsx"
3. **Minimal noise**: Hide internal tool calls (Read, TodoWrite, Skill loading)
4. **Collapsible details**: Technical users can expand to see file-level details
5. **Phase indicators**: Visual step indicators showing overall progress
6. **Friendly file names**: "Homepage" not "routes/index.tsx", "App layout" not "routes/__root.tsx"

## Mockup

![Business-friendly chat blocks mockup](screenshot.png){mockup:nimbalyst-local/mockups/business-friendly-chat-blocks.mockup.html}{800x900}

## Files to Modify

### Role System (new)
- `backend/src/db/schema.ts` — Add `role` column to `users` table
- `backend/src/api/routes/auth.ts` — Include role in JWT payload and `/me` response
- `src/lib/schemas.ts` — Add `role` to user-related schemas
- `src/hooks/useAuth.ts` (or equivalent) — Expose `user.role` to frontend components
- `backend/seed/dev-user.ts` — Set default role for dev user

### Chat UI (modified)
- `src/components/` — Chat message and content block components
- Content block type mapping/rendering logic
- Event stream processing that creates displayable blocks

### New Components (business role only)
- `PhaseBasedDisplay` — Groups events into phases, renders business-friendly UI
- `PhaseGroup` — Collapsible phase container with status indicator
- `PhaseItem` — Individual sub-step within a phase
- `ProgressSteps` — Horizontal step indicator (Setup → Build → Verify)

## Implementation Notes

- The underlying event stream stays the same for both roles
- The `developer` role rendering is unchanged — current behavior preserved exactly
- The `business` role gets the new phase-based display
- Business users can still access technical details via "Show technical details" toggle
- Phase grouping logic needs to map tool events → business phases
- Default role for new users should be `business` (the target audience for Kova)
