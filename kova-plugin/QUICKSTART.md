# Kova Quick Start

> By the end of this guide, you will have the Kova plugin installed in Claude Code and a running TanStack Start application scaffolded by AI.

Kova delivers AI app-building capabilities through **two paths**:

| Path | When to Use | How It Works |
|------|-------------|--------------|
| **[Claude Code + Plugin](#path-1-claude-code--kova-plugin)** | Developer workstation, interactive coding | Plugin installs rules, skills, and MCP servers into Claude Code |
| **[kova-agent in app-container](#path-2-kova-agent-in-app-container)** | Kova platform, backend streaming, CI/CD | `kovaQuery()` embeds the same instructions via system prompt `append` |

Both paths share the same foundation: skills, MCP servers, and system prompt content — different delivery mechanism.

> [!NOTE]
> This plugin repo is the **single source of truth** for all content. The `@kova/agent` package (in the `kova` repo) contains only code — at build time it copies content from here.

---

## Path 1: Claude Code + Kova Plugin

### Prerequisites

- [ ] [Claude Code CLI](https://code.claude.com/docs/en/quickstart) installed
- [ ] Bun runtime (`bun >= 1.0.0`)
- [ ] This repository cloned

### 1. Install MCP server dependencies

```bash
cd kova-plugin
bun install
```

### 2. Register the plugin with Claude Code

```bash
claude plugin add ./path/to/kova-plugin
```

This registers the Kova plugin, which provides:
- **Skills** — `/kova:init-project`, `/kova:spreeform`, `/kova:tanstack`, `/kova:clickhouse`, etc.
- **1 MCP server** — `data-catalog` (Spreetail data platform search)
- **Hooks** — Auto-formats files with Prettier after writes

### 3. Verify installation

```bash
claude /help
```

> [!TIP]
> You should see the `kova:*` skills listed under available skills. If not, check that the plugin path is correct.

### 4. Create your first app

```bash
claude
> /kova:init-project my-dashboard
```

The `init-project` skill will:
1. Scaffold a TanStack Start project from the bundled template
2. Install `.claude/rules/kova.md` (Kova identity + quick reference)
3. Run `bun install` and verify the app compiles

> [!TIP]
> You can also ask naturally — Claude discovers skills automatically:
> ```
> > Build me a revenue dashboard that shows marketplace performance data
> ```

### 5. Use skills on-demand

Once installed, Claude Code discovers skills automatically based on what you're doing:

```
> Build a data table showing top products    # triggers kova:spreeform + kova:tanstack
> Query the data platform for order data     # triggers kova:data-platform + MCP server
```

Or invoke explicitly:

```
> /kova:data-platform what tables have revenue data?
> /kova:spreeform show me available form components
```

---

## Path 2: kova-agent in App Container

### Overview

The app-container runs `kovaQuery()` from `@kova/agent` as a headless process. It receives prompts via HTTP, streams responses as SSE, and the generated app hot-reloads in the preview iframe.

```
User → Frontend (WebSocket) → Backend → App Container (kovaQuery) → Claude Agent SDK
                                    ← SSE stream ←
```

### How It Works

```typescript
// app-container/src/agent.ts
import { kovaQuery, type SDKMessage } from "@kova/agent";

for await (const message of kovaQuery(prompt, {
  cwd: absoluteCwd,
  sessionId: options.sessionId,
  allowedTools: options.allowedTools,
  systemPrompt: options.systemPrompt,
  model,
})) {
  // Transform SDK messages to AgentStreamEvent and yield as SSE
}
```

`kovaQuery()` handles all setup automatically:

1. Copies skills from the plugin to `.claude/skills/` in the project directory
2. Copies instructions from the plugin to `.kova/instructions/` (when present)
3. Copies templates from the plugin to `.claude/templates/`
4. Initializes the data-catalog MCP server (in-process via `createSdkMcpServer`)
5. Sets the system prompt using `preset: "claude_code"` + `append` with Kova instructions

> [!NOTE]
> The `@kova/agent` build step (`copy-assets.ts`) copies skills, instructions, and templates from this plugin into `@kova/agent/dist/`. At runtime, `kovaQuery()` reads from `dist/` and copies them into the project.

### System Prompt Configuration

The container extends the default Kova prompt with container-specific instructions:

```typescript
// app-container/src/server.ts
import { extendKovaAgentPrompt } from "@kova/agent";

const DEFAULT_SYSTEM_PROMPT_CONFIG = extendKovaAgentPrompt(
  `The dev server is managed automatically - do NOT run "bun dev"...`
);
```

### Building and Running

```bash
# In the kova repo — build agent first (copies content from plugin), then container
bun run build:agent
bun run container:rebuild
```

<details>
<summary>Manual Docker build</summary>

```bash
docker build -f Dockerfile.appcontainer -t kova-app-container:latest .
k3d image import kova-app-container:latest -c kova-dev
```

</details>

### Running Locally (Full Stack)

```bash
bun run dev:full        # Backend :3002 + Frontend :5174
```

Login at `http://localhost:5174/login` with `dev@kova.local` / `devpassword123`.

---

## Architecture

### How Each Path Delivers Knowledge

| Capability | `kovaQuery()` (headless) | Claude Code plugin |
|---|---|---|
| Kova identity | `systemPrompt.append` | `rules/kova.md` auto-loaded |
| Scaffold apps | Copies skills to `.claude/skills/` at startup | `skills/init-project/SKILL.md` auto-discovered |
| Spreeform components | Copies skills to `.claude/skills/` at startup | `skills/spreeform/SKILL.md` auto-discovered |
| Data search tool | `createSdkMcpServer()` in-process | `.mcp.json` spawns subprocess |
| Starter project files | Copies templates to `.claude/templates/` | `init-project` references `templates/` directory |
| Code formatting | N/A (headless) | `hooks/hooks.json` runs Prettier |
| Tool permissions | `bypassPermissions: true` | User approves interactively |

### Repository Map

```
~/Repos/scaled-innovation/
├── spreetail-claude-plugins/  ← This repo (plugin marketplace + content)
└── kova/                      ← Main Kova repo (web app + backend + agent)
    ├── packages/
    │   ├── agent/             ← @kova/agent (code only, copies content at build)
    │   └── kova-plugin/       ← Mirror copy (monorepo workspace compatibility)
    ├── app-container/         ← Uses @kova/agent for headless AI
    ├── backend/               ← Fastify server
    └── src/                   ← React frontend
```

---

## What's Next

- **Build an app** — `/kova:init-project` and start prompting
- **Explore the data platform** — `/kova:data-platform list available data domains`
- **Browse components** — `/kova:spreeform show me available components`
- **Read the architecture** — See [README.md](README.md) for the full plugin structure

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Skills not showing in `claude /help` | Re-run `claude plugin add ./path/to/kova-plugin` |
| MCP server fails to start | Run `cd kova-plugin && bun install` to install dependencies |
| Data platform queries fail | Ensure `DATA_PLATFORM_HOST`, `DATA_PLATFORM_USER`, and `DATA_PLATFORM_PASSWORD` env vars are set |
| Prettier hook errors | Ensure `prettier` is installed in your project (`bun add -d prettier`) |
