# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ISS (Seller Intelligence System) is a full-stack AI-powered analytics application for Amazon marketplace seller data. It uses a multi-agent LLM pipeline to analyze user questions, query ClickHouse, and stream back insights with data visualizations.

## Commands

```bash
bun dev        # Start dev server on port 3000
bun build      # Production build
bun test       # Run Vitest test suite (vitest run)
bun preview    # Preview production build
```

Package manager is **Bun** (not npm/yarn).

## Tech Stack

- **Framework**: TanStack Start (SSR) + React 19 + TypeScript
- **Routing**: TanStack Router (file-based, `src/routes/`)
- **Styling**: Tailwind CSS v4 + Spreeform (Spreetail's design system built on shadcn/ui)
- **Build**: Vite 7 + Nitro server runtime
- **AI**: Vercel AI SDK v6 with `@ai-sdk/anthropic` (Claude Sonnet 4)
- **Database**: ClickHouse Cloud via `@clickhouse/client`
- **Charts**: Recharts v3
- **Validation**: Zod v4

## Architecture

### Three-Agent Pipeline (`src/lib/ai/`)

All requests flow through `orchestrator.ts` which runs three agents sequentially:

1. **Question Analyzer** (`agents/question-analyzer.ts`) — Parses user intent into an `AnalysisPlan` (intent, relevant_tables, suggested_approach, business_context)
2. **ClickHouse Agent** (`agents/clickhouse-agent.ts`) — Executes SQL queries using LLM tool-use. Has `run_query`, `list_databases`, and `list_tables` tools
3. **Analysis Agent** (`agents/analysis-agent.ts`) — Streams a markdown response with findings and an artifact block containing visualization data

The API endpoint is `POST /api/chat` (`src/routes/api/chat.ts`), which is a TanStack Start server handler.

### Two Chat Modes

- **Metadata mode** (default): Schema from `.clickhouse/metadata.yml` is injected into prompts for faster queries
- **Discovery mode**: Agent dynamically explores the database schema via `list_databases`/`list_tables` tools

### Artifact System

Agent 3 emits a special markdown code block (` ```artifact\n{...}\n``` `) containing JSON with query results and a `vizHint`. The frontend parses this to render data in a tabbed panel (Table / Chart / SQL). Visualization types: `table`, `bar-chart`, `line-chart`, `metric-card`.

### Client-Side State

- Conversations persisted to localStorage (key: `iss-conversations`)
- `src/hooks/use-conversations.ts` manages CRUD operations
- `src/hooks/use-artifact.ts` manages the artifact display panel

### ClickHouse Safety (`src/lib/clickhouse/tools.ts`)

- Write operations (INSERT, UPDATE, DELETE, DROP, etc.) are rejected
- Queries without LIMIT get `LIMIT 1000` appended automatically
- 30-second query timeout via AbortSignal
- Server-side only (Nitro runtime)

## Key Conventions

- **Path alias**: `@/*` maps to `./src/*`
- **File naming**: kebab-case (`chat-panel.tsx`, `use-conversations.ts`)
- **Component naming**: PascalCase (`ChatPanel`, `ChatHeader`)
- **Console logging**: Bracketed module prefixes (`[orchestrator]`, `[clickhouse/tools]`)
- **Route file**: `src/routeTree.gen.ts` is auto-generated — do not edit manually
- **Server-only code**: `src/lib/clickhouse/` and `src/lib/ai/agents/` run exclusively on Nitro

## Environment Setup

Copy `.env.example` to `.env` and fill in `CLICKHOUSE_HOST`, `CLICKHOUSE_PASSWORD`, and `ANTHROPIC_API_KEY`. ClickHouse defaults to port 8443 with TLS enabled.

## Database Notes

Schema is documented in `.clickhouse/metadata.yml`. All tables use ReplacingMergeTree with `_version`/`_deleted` columns. Prices are stored in **cents** (divide by 100 for display). Ratings are stored as **integer x10** (divide by 10 for display).
