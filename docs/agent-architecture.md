# Kova Agent Server Architecture

## Overview

Kova's agent server runs the Claude Agent SDK (Claude Code wrapper) in isolated containers, leveraging modular building blocks—skills, MCP servers, and subagents—to enhance its capabilities for app generation.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              KOVA PLATFORM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────────┐ │
│  │   Frontend   │────▶│   Backend    │────▶│      App Containers          │ │
│  │   (React)    │ WS  │  (Fastify)   │ SSE │   (one per user app)         │ │
│  └──────────────┘     └──────────────┘     └──────────────────────────────┘ │
│        :5174               :3002              :31xxx (agent) :33xxx (dev)   │
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
│  │  │   │   TOOLS     │  │   SKILLS    │  │   SYSTEM PROMPT     │   │ │    │
│  │  │   │             │  │             │  │                     │   │ │    │
│  │  │   │ • Read      │  │ • xlsx      │  │ preset: claude_code │   │ │    │
│  │  │   │ • Write     │  │ • xlsx-     │  │ append: Kova rules  │   │ │    │
│  │  │   │ • Edit      │  │   workflow- │  │                     │   │ │    │
│  │  │   │ • Bash      │  │   docs      │  │ Tech stack:         │   │ │    │
│  │  │   │ • Glob      │  │ • (future)  │  │ • React + TS        │   │ │    │
│  │  │   │ • Grep      │  │             │  │ • Vite              │   │ │    │
│  │  │   │ • Skill     │  │             │  │ • Tailwind          │   │ │    │
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
│  │    ├── .claude/skills/     ← Skills copied here on startup          │    │
│  │    ├── src/                ← Generated app source                   │    │
│  │    ├── package.json                                                  │    │
│  │    └── *.xlsx              ← Uploaded workflow files                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Modular Building Blocks

The agent's capabilities are extended through modular building blocks:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BUILDING BLOCKS ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                          ┌─────────────────────┐                             │
│                          │   CLAUDE AGENT SDK  │                             │
│                          │   (Claude Code)     │                             │
│                          └──────────┬──────────┘                             │
│                                     │                                        │
│           ┌─────────────────────────┼─────────────────────────┐             │
│           │                         │                         │             │
│           ▼                         ▼                         ▼             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │     SKILLS      │    │   MCP SERVERS   │    │    SUBAGENTS    │         │
│  │   (Built-in)    │    │   (Plugins)     │    │  (Delegation)   │         │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘         │
│           │                      │                      │                   │
│           ▼                      ▼                      ▼                   │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                     CURRENT CAPABILITIES                         │       │
│  ├─────────────────────────────────────────────────────────────────┤       │
│  │                                                                  │       │
│  │  SKILLS (Active)                                                 │       │
│  │  ├── xlsx                    Excel creation/editing/analysis    │       │
│  │  │   ├── pandas              Data manipulation                  │       │
│  │  │   ├── openpyxl            Formulas & formatting              │       │
│  │  │   └── LibreOffice         Formula recalculation              │       │
│  │  │                                                               │       │
│  │  └── xlsx-workflow-docs      Workflow documentation             │       │
│  │      └── Generates markdown from Excel workflows                │       │
│  │                                                                  │       │
│  │  MCP SERVERS (Not Yet Implemented)                               │       │
│  │  └── (Architecture supports MCP via SDK)                        │       │
│  │                                                                  │       │
│  │  SUBAGENTS (Not Yet Implemented)                                 │       │
│  │  └── (Task tool disabled in container)                          │       │
│  │                                                                  │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Skills System Detail

Skills provide domain-specific knowledge and tools:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SKILLS ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SKILL LOADING FLOW:                                                         │
│                                                                              │
│  1. Container starts                                                         │
│     │                                                                        │
│     ▼                                                                        │
│  2. copySkillsToProjectDir()                                                │
│     │   /app/skills/ ──copy──▶ /workspace/.claude/skills/                   │
│     ▼                                                                        │
│  3. Agent SDK loads skills via settingSources: ["project"]                  │
│     │                                                                        │
│     ▼                                                                        │
│  4. Skills available via "Skill" tool                                       │
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
│ │  ├── xlsx ✓                   Spreadsheet operations                │   │
│ │  ├── xlsx-workflow-docs ✓     Workflow documentation                │   │
│ │  ├── data-platform           Database schema, queries, migrations   │   │
│ │  ├── auth                    OAuth, JWT, session management         │   │
│ │  ├── design-system           UI components, theming, accessibility  │   │
│ │  ├── api-integration         REST/GraphQL patterns, OpenAPI         │   │
│ │  ├── testing                 Unit, integration, E2E test patterns   │   │
│ │  ├── deployment              Docker, K8s, CI/CD configurations      │   │
│ │  └── analytics               Tracking, dashboards, reporting        │   │
│ │                                                                      │   │
│ │  MCP SERVERS (External Integrations)                                 │   │
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
│  │  Frontend   │◀───│  Traefik proxy      │                               │
│  │  iframe     │    │  app-{id}.localhost │                               │
│  │  shows app  │    │  :8081 → :33xxx     │                               │
│  └─────────────┘    └─────────────────────┘                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Tool Access Matrix

| Tool | Container Agent | Backend Agent | Notes |
|------|-----------------|---------------|-------|
| Read | ✓ | ✓ | Read files |
| Write | ✓ | ✓ | Create files |
| Edit | ✓ | ✓ | Modify files |
| Bash | ✓ | ✓ | Run commands |
| Glob | ✓ | ✓ | Find files |
| Grep | ✓ | ✓ | Search content |
| Skill | ✓ | ✓ | Invoke skills |
| Task | ✗ | ✓ | Subagents (disabled in container) |
| WebSearch | ✗ | ✓ | Search web |
| WebFetch | ✗ | ✓ | Fetch URLs |

## Summary

Kova's agent architecture is built on **modular building blocks**:

1. **Skills** - Domain knowledge + scripts (xlsx, xlsx-workflow-docs)
2. **MCP Servers** - External service integrations (future)
3. **Subagents** - Parallel specialized work (future)
4. **Memory** - Persistent context (future)
5. **Webhooks** - Event-driven automation (future)

The current implementation focuses on the **Excel workflow → Web app** pipeline using the skill system. The architecture is designed to be extensible—new capabilities can be added as skills, MCP servers, or subagents without changing the core agent infrastructure.
