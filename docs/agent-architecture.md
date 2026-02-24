# Kova Agent Server Architecture

## Overview

Kova's agent server runs the Claude Agent SDK in isolated containers, with the **Kova Plugin** providing skills, MCP servers, and domain-specific knowledge for app generation.

Previously, Kova maintained a standalone `@kova/agent` package with a bundled CLI, skills, templates, and MCP servers. This was replaced with the **plugin approach** which provides feature parity while eliminating the maintenance burden of a custom CLI and allowing faster iteration on skills. Engineers use **Claude Code + Kova Plugin** for local development and **Claude Agent SDK + Kova Plugin** for the Kova web platform — the same plugin powers both experiences.

The Kova Plugin ([spreetail-claude-plugins](https://gitlab.com/spreetail/engineering/scaled-innovation/spreetail-claude-plugins)) provides:
- Skills (init-project, spreeform, data-platform, xlsx, image-forge, etc.)
- MCP servers (data-catalog for metadata search)
- Templates (TanStack Start starter)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              KOVA PLATFORM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────────┐ │
│  │   Frontend   │────▶│   Backend    │────▶│      App Containers          │ │
│  │   (React)    │ WS  │  (Fastify)   │ SSE │   (one per user app)         │ │
│  └──────────────┘     └──────────────┘     └──────────────────────────────┘ │
│        :5174               :3002                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Agent Container Architecture

Each user app runs in an isolated container with two servers:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         APP CONTAINER (per app)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      AGENT SERVER (:3100)                            │    │
│  │                                                                      │    │
│  │  ┌────────────────────────────────────────────────────────────────┐ │    │
│  │  │                   CLAUDE AGENT SDK                              │ │    │
│  │  │                  (Claude Code Wrapper)                          │ │    │
│  │  │                                                                 │ │    │
│  │  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │ │    │
│  │  │   │   TOOLS     │  │ KOVA PLUGIN │  │   SYSTEM PROMPT     │   │ │    │
│  │  │   │             │  │             │  │                     │   │ │    │
│  │  │   │ • Read      │  │ Skills:     │  │ preset: claude_code │   │ │    │
│  │  │   │ • Write     │  │ • init-proj │  │                     │   │ │    │
│  │  │   │ • Edit      │  │ • spreeform │  │ Plugin provides     │   │ │    │
│  │  │   │ • Bash      │  │ • data-plat │  │ domain knowledge    │   │ │    │
│  │  │   │ • Glob      │  │ • xlsx      │  │ via skills & MCP    │   │ │    │
│  │  │   │ • Grep      │  │ • etc.      │  │                     │   │ │    │
│  │  │   │ • Skill     │  │             │  │                     │   │ │    │
│  │  │   │             │  │ MCP:        │  │                     │   │ │    │
│  │  │   │             │  │ • data-     │  │                     │   │ │    │
│  │  │   │             │  │   catalog   │  │                     │   │ │    │
│  │  │   └─────────────┘  └─────────────┘  └─────────────────────┘   │ │    │
│  │  │                                                                 │ │    │
│  │  │   ┌─────────────────────────────────────────────────────────┐  │ │    │
│  │  │   │                   SESSION MANAGEMENT                     │  │ │    │
│  │  │   │  • Multi-turn conversation memory                        │  │ │    │
│  │  │   │  • Resume via sessionId                                  │  │ │    │
│  │  │   └─────────────────────────────────────────────────────────┘  │ │    │
│  │  └────────────────────────────────────────────────────────────────┘ │    │
│  │                                                                      │    │
│  │  Endpoints:                                                          │    │
│  │    POST /query          → Execute agent with SSE streaming           │    │
│  │    GET  /health         → Container health check                     │    │
│  │    POST /dev-server/*   → Control dev server lifecycle               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      DEV SERVER (:3000)                              │    │
│  │                                                                      │    │
│  │  Auto-detects framework: Vite | Next.js | Angular | CRA | Static    │    │
│  │  Auto-starts after agent creates app files                          │    │
│  │  Hot-reloads on file changes                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      WORKSPACE (/workspace)                          │    │
│  │                                                                      │    │
│  │  /workspace/                                                         │    │
│  │    ├── src/                ← Generated app source                   │    │
│  │    ├── package.json                                                  │    │
│  │    └── *.xlsx              ← Uploaded workflow files                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      PLUGIN (/opt/plugins/marketplace)               │    │
│  │                                                                      │    │
│  │  Cloned from GitLab at container startup (entrypoint.sh)            │    │
│  │  Dependencies installed via bun install                             │    │
│  │  Loaded by Agent SDK as a local plugin                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Plugin Architecture

The Kova Plugin is a Claude Plugin that extends the agent with Spreetail-specific capabilities. It's maintained in a separate repository and loaded at container startup.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PLUGIN ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                          ┌─────────────────────┐                             │
│                          │   CLAUDE AGENT SDK  │                             │
│                          │   (Claude Code)     │                             │
│                          └──────────┬──────────┘                             │
│                                     │                                        │
│                                     ▼                                        │
│                          ┌─────────────────────┐                             │
│                          │    KOVA PLUGIN      │                             │
│                          │  (.claude-plugin)    │                             │
│                          └──────────┬──────────┘                             │
│                                     │                                        │
│           ┌─────────────────────────┼─────────────────────────┐             │
│           │                         │                         │             │
│           ▼                         ▼                         ▼             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │     SKILLS      │    │   MCP SERVERS   │    │    TEMPLATES    │         │
│  │   (Plugin)      │    │   (Plugin)      │    │    (Plugin)     │         │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘         │
│           │                      │                      │                   │
│           ▼                      ▼                      ▼                   │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                     CURRENT CAPABILITIES                         │       │
│  ├─────────────────────────────────────────────────────────────────┤       │
│  │                                                                  │       │
│  │  SKILLS                                                          │       │
│  │  ├── init-project          TanStack Start project scaffolding   │       │
│  │  ├── spreeform             Spreeform UI component library       │       │
│  │  ├── data-platform         Data warehouse queries & patterns    │       │
│  │  ├── tanstack              TanStack Router/Query/Table patterns │       │
│  │  ├── xlsx                  Excel creation/editing/analysis      │       │
│  │  ├── xlsx-workflow-docs    Workflow documentation from Excel    │       │
│  │  ├── image-forge           UI mockup → app planning            │       │
│  │  └── clickhouse            ClickHouse query patterns            │       │
│  │                                                                  │       │
│  │  MCP SERVERS                                                     │       │
│  │  └── data-catalog          Metadata search, schema discovery    │       │
│  │      └── 8 tools: search_tables, get_schema, list_domains, etc. │       │
│  │                                                                  │       │
│  │  TEMPLATES                                                       │       │
│  │  └── tanstack-start        TanStack Start project template      │       │
│  │                                                                  │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Plugin Loading Flow

```
Container Start (entrypoint.sh):
1. Clone plugin marketplace from GitLab (git clone --depth 1)
2. Install plugin dependencies (bun install)
3. Start Node.js agent server

Agent Server Start (agent.ts):
4. Build SDK options with plugin path: { plugins: [{ type: "local", path: pluginDir }] }
5. Call query() from Claude Agent SDK
6. SDK loads plugin, registers skills, starts MCP servers
7. SDK init message reports loaded capabilities (logged by agent)
```

## Skills System Detail

Skills provide domain-specific knowledge and tools. They are maintained in the Kova Plugin repository and loaded by the Claude Agent SDK at runtime.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SKILLS ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         SKILL STRUCTURE                              │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                      │   │
│  │  skills/{skill-name}/                                                │   │
│  │    ├── SKILL.md           Required: Metadata + instructions         │   │
│  │    ├── scripts/           Optional: Executable scripts              │   │
│  │    │   └── *.py, *.sh                                               │   │
│  │    ├── references/        Optional: Documentation files             │   │
│  │    │   └── *.md                                                     │   │
│  │    └── assets/            Optional: Templates, boilerplate          │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  EXCEL WORKFLOW SKILL CHAIN:                                                │
│                                                                              │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │  User uploads   │     │ xlsx-workflow-  │     │   xlsx skill    │       │
│  │  Excel file     │────▶│ docs skill      │────▶│   (build app)   │       │
│  │  (.xlsx)        │     │                 │     │                 │       │
│  └─────────────────┘     │ Generates:      │     │ Creates:        │       │
│                          │ • Workflow.md   │     │ • React app     │       │
│                          │ • Data flow     │     │ • Same logic    │       │
│                          │ • Parameters    │     │ • UI components │       │
│                          └─────────────────┘     └─────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Future Building Blocks (Extensibility)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FUTURE BUILDING BLOCKS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                          ┌─────────────────────┐                             │
│                          │   CLAUDE AGENT SDK  │                             │
│                          └──────────┬──────────┘                             │
│                                     │                                        │
│     ┌───────────────┬───────────────┼───────────────┬───────────────┐       │
│     │               │               │               │               │       │
│     ▼               ▼               ▼               ▼               ▼       │
│ ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐        │
│ │ SKILLS │    │  MCP   │    │  SUB-  │    │ MEMORY │    │WEBHOOKS│        │
│ │        │    │SERVERS │    │ AGENTS │    │        │    │        │        │
│ └───┬────┘    └───┬────┘    └───┬────┘    └───┬────┘    └───┬────┘        │
│     │             │             │             │             │              │
│     ▼             ▼             ▼             ▼             ▼              │
│ ┌─────────────────────────────────────────────────────────────────────┐   │
│ │                                                                      │   │
│ │  SKILLS (Domain Knowledge + Scripts)                                 │   │
│ │  ├── init-project ✓           TanStack Start scaffolding            │   │
│ │  ├── spreeform ✓              Spreeform UI components               │   │
│ │  ├── data-platform ✓          Database schema, queries, migrations   │   │
│ │  ├── xlsx ✓                   Spreadsheet operations                │   │
│ │  ├── xlsx-workflow-docs ✓     Workflow documentation                │   │
│ │  ├── image-forge ✓            UI mockup → app planning             │   │
│ │  ├── auth                    OAuth, JWT, session management         │   │
│ │  ├── design-system           UI components, theming, accessibility  │   │
│ │  ├── api-integration         REST/GraphQL patterns, OpenAPI         │   │
│ │  ├── testing                 Unit, integration, E2E test patterns   │   │
│ │  ├── deployment              Docker, K8s, CI/CD configurations      │   │
│ │  └── analytics               Tracking, dashboards, reporting        │   │
│ │                                                                      │   │
│ │  MCP SERVERS (External Integrations)                                 │   │
│ │  ├── data-catalog ✓           Metadata search, schema discovery     │   │
│ │  ├── database-mcp            Direct DB access (Postgres, MySQL)     │   │
│ │  ├── github-mcp              Repository operations, PRs, issues     │   │
│ │  ├── figma-mcp               Design token extraction, components    │   │
│ │  ├── slack-mcp               Notifications, approvals               │   │
│ │  ├── jira-mcp                Issue tracking, sprint management      │   │
│ │  ├── aws-mcp                 Cloud resource management              │   │
│ │  └── stripe-mcp              Payment integration                    │   │
│ │                                                                      │   │
│ │  SUBAGENTS (Parallel/Specialized Work)                               │   │
│ │  ├── code-review-agent       Review generated code for issues       │   │
│ │  ├── security-agent          Scan for vulnerabilities               │   │
│ │  ├── test-writer-agent       Generate test cases                    │   │
│ │  ├── docs-agent              Generate documentation                 │   │
│ │  └── optimization-agent      Performance improvements               │   │
│ │                                                                      │   │
│ │  MEMORY (Persistent Context)                                         │   │
│ │  ├── project-memory          Remember decisions, patterns used      │   │
│ │  ├── user-preferences        Coding style, tech preferences         │   │
│ │  └── codebase-index          Semantic search over generated code    │   │
│ │                                                                      │   │
│ │  WEBHOOKS (Event-Driven)                                             │   │
│ │  ├── on-file-change          Trigger validation, linting            │   │
│ │  ├── on-build-fail           Auto-fix common errors                 │   │
│ │  ├── on-deploy               Run smoke tests                        │   │
│ │  └── on-error                Notify, create issue                   │   │
│ │                                                                      │   │
│ └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow: Excel Workflow to App

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXCEL WORKFLOW → APP DATA FLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. UPLOAD                                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                     │
│  │   User      │    │   Hub       │    │  Backend    │                     │
│  │  uploads    │───▶│   Page      │───▶│  API        │                     │
│  │  .xlsx      │    │             │    │             │                     │
│  └─────────────┘    └─────────────┘    └──────┬──────┘                     │
│                                               │                             │
│  2. SETUP                                     ▼                             │
│                                        ┌─────────────┐                     │
│                                        │ Create app  │                     │
│                                        │ Start       │                     │
│                                        │ container   │                     │
│                                        │ Write file  │                     │
│                                        └──────┬──────┘                     │
│                                               │                             │
│  3. DOCUMENT                                  ▼                             │
│  ┌──────────────────────────────────────────────────────────────────┐     │
│  │                        AGENT CONTAINER                            │     │
│  │                                                                   │     │
│  │  Prompt: "document the workflow in 'file.xlsx'                   │     │
│  │           and write to 'file_workflow.md'"                       │     │
│  │                              │                                    │     │
│  │                              ▼                                    │     │
│  │  ┌─────────────────────────────────────────────────────────┐    │     │
│  │  │              xlsx-workflow-docs SKILL                    │    │     │
│  │  │                                                          │    │     │
│  │  │  1. Read Excel file (pandas)                            │    │     │
│  │  │  2. Identify workflow pattern:                          │    │     │
│  │  │     Parameters → Raw Data → Processing → Output         │    │     │
│  │  │  3. Generate markdown with:                             │    │     │
│  │  │     • Data flow diagram (ASCII)                         │    │     │
│  │  │     • Parameter descriptions                            │    │     │
│  │  │     • Processing logic                                  │    │     │
│  │  │     • Output specifications                             │    │     │
│  │  │  4. Write {workbook}_workflow.md                        │    │     │
│  │  └─────────────────────────────────────────────────────────┘    │     │
│  │                              │                                    │     │
│  └──────────────────────────────┼────────────────────────────────────┘     │
│                                 │                                           │
│  4. PLAN READY                  ▼                                           │
│  ┌─────────────┐    ┌─────────────────────┐                               │
│  │  Frontend   │◀───│ Streaming complete  │                               │
│  │  shows      │    │ planReady = true    │                               │
│  │  "Build     │    └─────────────────────┘                               │
│  │   App"      │                                                           │
│  └──────┬──────┘                                                           │
│         │                                                                   │
│  5. BUILD                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────────────────────────────────────────────────┐     │
│  │                        AGENT CONTAINER                            │     │
│  │                                                                   │     │
│  │  Prompt: [contents of {workbook}_workflow.md]                    │     │
│  │                              │                                    │     │
│  │                              ▼                                    │     │
│  │  ┌─────────────────────────────────────────────────────────┐    │     │
│  │  │              AGENT (with xlsx skill available)           │    │     │
│  │  │                                                          │    │     │
│  │  │  1. Parse workflow requirements                         │    │     │
│  │  │  2. Generate React + TypeScript app:                    │    │     │
│  │  │     • Parameter input forms                             │    │     │
│  │  │     • Data processing logic                             │    │     │
│  │  │     • Output display/export                             │    │     │
│  │  │  3. Write files to /workspace                           │    │     │
│  │  │  4. (xlsx skill available for Excel I/O if needed)      │    │     │
│  │  └─────────────────────────────────────────────────────────┘    │     │
│  │                              │                                    │     │
│  │                              ▼                                    │     │
│  │  ┌─────────────────────────────────────────────────────────┐    │     │
│  │  │              DEV SERVER (auto-starts)                    │    │     │
│  │  │                                                          │    │     │
│  │  │  • Detects Vite project                                 │    │     │
│  │  │  • Runs npm install                                     │    │     │
│  │  │  • Starts dev server on :3000                           │    │     │
│  │  └─────────────────────────────────────────────────────────┘    │     │
│  │                                                                   │     │
│  └───────────────────────────────────────────────────────────────────┘     │
│                                 │                                           │
│  6. PREVIEW                     ▼                                           │
│  ┌─────────────┐    ┌─────────────────────┐                               │
│  │  Frontend   │◀───│  Istio routing      │                               │
│  │  iframe     │    │  app-{id}.domain    │                               │
│  │  shows app  │    └─────────────────────┘                               │
│  └─────────────┘                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Two Development Experiences, One Plugin

The plugin approach enables feature parity between local development and the Kova web platform:

| Experience | Agent Runtime | Plugin Loading | Use Case |
|-----------|---------------|----------------|----------|
| **Claude Code + Plugin** | Claude Code CLI | Installed locally via plugin README | Engineers doing local dev work |
| **Kova Web Platform** | Claude Agent SDK | Cloned from GitLab at container startup | End users building apps via chat UI |

Both use the same Kova Plugin, so skills can be iterated on rapidly using Claude Code locally and then deployed to the web platform without changes.

## Tool Access Matrix

| Tool | Container Agent | Notes |
|------|-----------------|-------|
| Read | ✓ | Read files |
| Write | ✓ | Create files |
| Edit | ✓ | Modify files |
| Bash | ✓ | Run commands |
| Glob | ✓ | Find files |
| Grep | ✓ | Search content |
| Skill | ✓ | Invoke skills (from plugin) |
| Task | ✓ | Subagents |
| WebSearch | ✗ | Disabled in container |
| WebFetch | ✗ | Disabled in container |

## Summary

Kova's agent architecture is built on the **Claude Plugin system**:

1. **Skills** - Domain knowledge + scripts (init-project, spreeform, data-platform, xlsx, etc.)
2. **MCP Servers** - External service integrations (data-catalog for metadata search)
3. **Templates** - Project scaffolding (TanStack Start starter)

The plugin is maintained separately in [spreetail-claude-plugins](https://gitlab.com/spreetail/engineering/scaled-innovation/spreetail-claude-plugins), enabling rapid iteration without infrastructure changes. The same plugin powers both the local Claude Code experience and the Kova web platform.

### Key Files

| Location | Purpose |
|----------|---------|
| `app-container/src/agent.ts` | SDK query + SDKMessage → AgentStreamEvent transformation |
| `app-container/src/system-prompt.ts` | Default system prompt config (Claude Code preset) |
| `app-container/entrypoint.sh` | Plugin clone + dependency install at container startup |
| `Dockerfile.appcontainer` | Container image with Claude Code CLI, git, Python, etc. |
