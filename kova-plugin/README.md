# Kova Claude Code Plugin

Kova AI App Builder plugin for Claude Code. Creates TanStack Start full-stack applications with Spreetail's data platform integration.

**Status:** Active
**Team:** Scaled Innovation | **Slack:** #scaled-innovation

## Quick Start

```bash
# 1. Clone and install dependencies
cd kova-plugin && bun install

# 2. Register the plugin with Claude Code
claude plugin add ./path/to/kova-plugin

# 3. Create your first app
claude
> /kova:init-project my-dashboard
```

> [!TIP]
> See [QUICKSTART.md](QUICKSTART.md) for the full setup guide, including headless/production deployment with `@kova/agent`.

## What's Included

### Skills

| Skill | Trigger | Description |
|-------|---------|-------------|
| `kova:init-project` | "new app", "start fresh" | Scaffold a new TanStack Start project |
| `kova:spreeform` | UI work, buttons, forms | Spreeform UI component reference |
| `kova:tanstack` | Routing, data fetching, tables | TanStack Start/Router/Query/Table patterns |
| `kova:clickhouse` | ClickHouse, analytics DB | ClickHouse database integration |
| `kova:data-platform` | Business data, warehouse | Query Spreetail's data warehouse (Trino) |
| `kova:xlsx` | Spreadsheets, Excel | Excel file operations |
| `kova:xlsx-workflow-docs` | Workflow from Excel | Workflow documentation from Excel files |
| `kova:image-forge` | Screenshots, mockups | Image analysis and app planning |

Skills are Claude Code's native extension mechanism. Claude discovers them automatically based on context, or you can invoke them directly (e.g., `/kova:init-project my-app`).

### MCP Server

| Server | Description |
|--------|-------------|
| `data-catalog` | Search and discover tables in Spreetail's data platform |

### Rules

`rules/kova.md` — Kova identity and quick reference. Auto-loaded every Claude Code session.

### Hooks

| Hook | Trigger | Action |
|------|---------|--------|
| Prettier | `Write` or `Edit` tool | Auto-formats files after writing |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start (Router, Query, Table) |
| UI | React 19 + Spreeform (Spreetail's component library) |
| Styling | Tailwind CSS v4 |
| Runtime | Bun |
| Data | Trino (data platform), ClickHouse |
| Language | TypeScript (strict mode) |

## Architecture

This plugin is the **single source of truth** for all Kova content (skills, templates, rules). It powers two delivery paths:

| Path | Audience | How content is delivered |
|------|----------|------------------------|
| **Claude Code + Plugin** | Developer workstations | Claude Code reads directly from the plugin directory |
| **`@kova/agent` in app-container** | Headless/production/CI | `kovaQuery()` copies content from plugin at build time |

```
spreetail-claude-plugins/             ← THIS REPO (source of truth)
├── skills/                           → Claude Code discovers natively
├── templates/        (tanstack-start)→ Scaffolding for new projects
├── mcp-servers/      (data-catalog)  → Self-contained stdio MCP server
├── rules/            (kova.md)       → Auto-loaded every session
└── hooks/            (formatting)    → Post-tool hooks

kova/packages/agent/                  ← CODE ONLY (no content duplication)
├── src/core/         kovaQuery() — copies content from plugin at runtime
├── src/data-platform/ In-process MCP server, metadata search, Trino client
└── src/types/        Type definitions
```

> [!IMPORTANT]
> Always edit skills and templates in **this repo**. The `@kova/agent` package copies from here at build time — never edit content there directly.

### Updating Content

1. Edit skills/templates here in `kova-plugin/`
2. **Plugin path** — changes take effect immediately
3. **Container path** — requires a rebuild: `bun run build:agent && bun run container:rebuild`

## Related Repositories

| Repo | Description |
|------|-------------|
| [`kova`](https://gitlab.com/spreetail/engineering/scaled-innovation/kova) | Main Kova repo (web app, backend, `@kova/agent`) |
| [`spreetail-claude-plugins`](https://gitlab.com/spreetail/engineering/scaled-innovation/spreetail-claude-plugins) | This repo (plugin marketplace) |
