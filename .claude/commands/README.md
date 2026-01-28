# Kova Slash Commands

These are **engineer-invoked maintenance commands** for keeping Kova's skills and templates up to date.

## Available Commands

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/refresh-spreeform-skill` | Update Spreeform skill docs from latest package | After Spreeform releases or when component APIs change |
| `/refresh-tanstack-start-template` | Rebuild template and update init-project skill | After TanStack/Spreeform releases or monthly |

## How to Run

In Claude Code CLI or any Claude Agent SDK session:

```
/refresh-spreeform-skill
```

## Command Details

### /refresh-spreeform-skill

Installs the latest `@spreetail/spreeform` package and analyzes its TypeScript exports and CSS tokens. Updates our documentation to match the current API.

**Updates:**
- `packages/agent/src/skills/spreeform/SKILL.md`
- `packages/agent/src/skills/spreeform/references/COMPONENTS.md`
- `packages/agent/src/skills/spreeform/references/TOKENS.md`
- `packages/agent/src/skills/spreeform/MAINTENANCE.md`

### /refresh-tanstack-start-template

Rebuilds the TanStack Start project template from scratch using the latest CLI, applies Spreeform configuration, and updates the init-project skill if CLI behavior changed.

**Updates:**
- `packages/agent/src/templates/tanstack-start/`
- `packages/agent/src/skills/init-project/SKILL.md` (if CLI changed)

## Why Slash Commands?

These are slash commands (not skills) because:

1. **Manual invocation** - Engineers decide when to run them, not Claude
2. **Maintenance tasks** - They update Kova's internals, not user projects
3. **Infrequent use** - Run monthly or after releases, not during normal app building

Skills (in `packages/agent/src/skills/`) are auto-invoked by Claude when relevant to user tasks. Commands are explicitly triggered by `/command-name`.
