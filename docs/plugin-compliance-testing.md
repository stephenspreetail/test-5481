# Plugin Compliance Testing

> You gave Claude a plugin with rules. Did it follow them?
> Run the build, evaluate the output, get a scorecard. Repeat.

## What This Is

A testing platform for Claude Code plugins. You define a **prompt** (what to build), a set of **checks** (what rules to verify), and an **expectation** per check (should it be present or absent). The platform builds the app N times in parallel, then sends a read-only evaluator agent to grade each workspace.

It started as a way to test whether Claude would adopt a plugin-delivered identity. It turned into a general-purpose compliance testing framework for any plugin behavior — tool usage, library adoption, coding patterns, constraint enforcement.

## How It Works

```
                     profiles.json
                    ┌──────────────┐
                    │ prompt       │
                    │ checks[]     │
                    │   expect     │
                    │   description│
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
     Phase 1: Build              Phase 2: Evaluate
  ┌────────────────────┐     ┌────────────────────────┐
  │ SDK Harness (Opus) │     │ Evaluator (Sonnet)     │
  │                    │     │                        │
  │ Loads plugin       │     │ Read-only access       │
  │ Builds the app     │     │ Reads .transcript.json │
  │ Saves transcript   │     │ Inspects source files  │
  │ Writes to app-N/   │     │ Runs tsc, ls, grep     │
  └────────┬───────────┘     │ Returns PASS/FAIL+why  │
           │    app-N/       └───────────┬────────────┘
           └─────────────────────────────┘
                           │
                    ┌──────┴───────┐
                    │  Scorecard   │
                    │  PASS/FAIL   │
                    │  per check   │
                    │  per run     │
                    └──────────────┘
```

**Phase 1** runs the Agent SDK harness with your plugin loaded. The harness captures the full conversation — every message, tool call, tool result, and thinking block — and saves it as `.transcript.json` in the workspace.

**Phase 2** spawns a separate Agent SDK instance (the evaluator) with read-only access. It reads the transcript and workspace files, runs builds, and returns structured results with per-check pass/fail, confidence levels, and natural-language reasoning.

For more on why we use an agent instead of regex for evaluation, see [Agentic Evaluation](./agentic-evaluation.md).

## Test Profiles

A profile is a JSON object with a prompt and a set of checks. Each check has an expectation (`"present"` or `"absent"`) and a natural-language description of what to look for.

```json
{
  "todo-app": {
    "prompt": "Build a todo app w/ home page and details",
    "checks": {
      "canary":       { "expect": "present", "description": "The Kova identity sign-off '— Kova' appears in agent text responses" },
      "bun":          { "expect": "present", "description": "All package manager commands use bun (not npm, yarn, or pnpm)" },
      "tanstack":     { "expect": "present", "description": "App uses TanStack Start/Router for routing and TanStack Query for data fetching" },
      "typescript":   { "expect": "present", "description": "TypeScript compiles without errors (tsc --noEmit passes)" },
      "spreeform":    { "expect": "present", "description": "UI components come from Spreeform (@spreeform/ui) — buttons, cards, dialogs, etc." }
    }
  }
}
```

**Present** checks pass when the evaluator finds the thing. **Absent** checks pass when it doesn't. This is how you enforce constraints like "a hello world app should NOT use a database" — set `expect: "absent"` and describe what shouldn't be there.

Profiles live in `agent-sdk-harness/profiles.json`. Current profiles:

| Profile | Prompt | Key checks | Fixtures |
|---------|--------|------------|----------|
| `hello-world` | Hello world with home + about page | Spreeform=absent (too simple for UI lib) | — |
| `todo-app` | Todo app with home + details | Spreeform=present, all tools used | — |
| `identity-only` | "Say hello and tell me about yourself" | kova-signoff only | — |
| `todo-app-identity` | Todo app with home + details | kova-signoff + all build checks | — |
| `xlsx-analysis` | Analyze a spreadsheet and create summary | xlsx-read, xlsx-create, formulas | `sample-data.xlsx` |
| `xlsx-workflow` | Document an Excel workflow | xlsx-read, workflow-doc | `sample-workflow.xlsx` |
| `image-forge` | Analyze UI mockup, plan, and build app | image-read, plan-doc, build checks, visual-fidelity | `figma-brand-scorecard-mock.png` |

### Fixtures

Some profiles need input files (spreadsheets, images) that the agent works with. These are called **fixtures** and live in `agent-sdk-harness/fixtures/`.

When a profile declares a `fixtures` array, those files are copied from `agent-sdk-harness/fixtures/` into the workspace before the build starts. The agent sees them in its workspace root — no sandbox changes needed.

```json
{
  "xlsx-analysis": {
    "prompt": "Analyze the spreadsheet sample-data.xlsx...",
    "fixtures": ["sample-data.xlsx"],
    "checks": { ... }
  }
}
```

To use a fixture profile, drop the matching file into `agent-sdk-harness/fixtures/` first.

### Adding a Profile

Just add a new key to `profiles.json`. The prompt can be anything — the checks describe what the evaluator should verify about the result.

```json
{
  "notes-with-auth": {
    "prompt": "Build a notes app with user authentication",
    "checks": {
      "auth":         { "expect": "present", "description": "Authentication exists — login page, session management, protected routes" },
      "server-fns":   { "expect": "present", "description": "Server functions use createServerFn from @tanstack/start" },
      "raw-fetch":    { "expect": "absent",  "description": "No raw fetch() calls — all data fetching should use TanStack Query" },
      "hardcoded-pw": { "expect": "absent",  "description": "No hardcoded passwords or secrets in source files" }
    }
  }
}
```

No code changes. The evaluator reads the description and figures out how to verify it.

## Running Tests

### Batch (recommended)

```bash
# Use a profile — runs, prompt, and checks are pre-configured
bun run batch --profile todo-app

# Override run count
bun run batch --profile todo-app --runs 5

# Ad-hoc prompt with default checks (3 runs)
bun run batch "Build a todo app w/ home page and details"

# Ad-hoc with custom run count
bun run batch "Build a hello world app" --runs 1

# Skip evaluator (builds only — faster, no eval cost)
NO_EVAL=1 bun run batch --profile todo-app

# Sequential builds (avoids rate limits)
SEQUENTIAL=1 bun run batch --profile hello-world

# Override models
CLAUDE_MODEL=claude-sonnet-4-5-20250929 bun run batch --profile todo-app
EVAL_MODEL=claude-haiku-4-5-20251001 bun run batch --profile todo-app
```

### Single run

```bash
# SDK harness — single build, no evaluation
bun run sdk "Build a hello world app"

# CLI — interactive session with plugin loaded
bun run cli
```

### Standalone evaluator

Already have a workspace you want to evaluate? Run the evaluator directly:

```bash
bun run agent-sdk-harness/src/evaluator.ts workspaces/sdk/app-1 \
  '[{"name":"spreeform","expect":"present","description":"Uses @spreeform/ui components"}]'
```

## Reading the Results

The batch runner outputs per-run evaluations and an aggregate scorecard:

```
Run 1 (app-5) — 33 turns, $0.7499, 195s
  PASS  bun
         All 10 package commands in .transcript.json use bun
  PASS  tanstack
         Found @tanstack/react-router imports in 4/6 source files
  FAIL  spreeform
         No @spreeform/ui imports found — app uses raw Tailwind classes
  PASS  typescript
         tsc --noEmit completed with 0 errors

======================================================================
  Scorecard: 3/4 checks passed across 3 runs
======================================================================
  PASS  bun — should be present (3/3 runs)
  PASS  tanstack — should be present (3/3 runs)
  PASS  typescript — should be present (2/3 runs)
  FAIL  spreeform — should be present (0/3 runs)
```

Each check shows:

| Field | What it tells you |
|-------|-------------------|
| **PASS/FAIL** | Did the result match the expectation direction? |
| **Confidence** | `high` = directly verified, `medium` = inferred, `low` = couldn't verify |
| **Reasoning** | Natural-language explanation — not just "0/5" but *why* it failed |

The scorecard aggregates across all runs. A check passes the scorecard only if it passed in **every** run.

## The Transcript

The build harness saves `.transcript.json` to each workspace — the complete agent conversation in structured JSON. This is what makes agentic evaluation possible.

The transcript contains:
- **Assistant text** — every response the agent gave (for canary/identity checks)
- **Tool calls** — what tools were called with what inputs (for bun vs npm, skill usage)
- **Tool results** — success/failure with output (for error detection)
- **Thinking blocks** — the agent's internal reasoning (for understanding decisions)
- **System messages** — session init, plugin loading, model info

The evaluator reads this first, then inspects workspace files. It can answer questions the files alone can't: "Did the agent try npm before switching to bun?" "Did it load the init-project skill?" "Did it consider using Spreeform but decide against it?"

## Benchmarking

Today the platform is a **benchmarking tool** — run a fixed plugin configuration N times, measure compliance rates, and get a scorecard. "How well does this plugin configuration perform against these checks?"

```bash
# Benchmark the current plugin config against the todo-app profile
bun run batch --profile todo-app --runs 5
```

Each batch produces a scorecard with per-check pass rates across all runs. Run it again after changing the plugin, skill, or prompt to see how the numbers move.

### Recording Results

Track benchmarks over time to compare configurations manually:

**Identity delivery: Skill vs Hook (todo-app-identity profile, Opus 4.6)**

| Date | Config | Runs | kova-signoff | Bun | TanStack | Spreeform | init-project | TS | Build Cost | Total Cost |
|------|--------|:----:|:------------:|:---:|:--------:|:---------:|:------------:|:--:|-----------|-----------|
| 2026-02-18 | Skill only | 3 | 0/3 (88-93% msgs) | 3/3 | 3/3 | 3/3 | 3/3 | 1/3 | $2.55 | $4.96 |
| 2026-02-18 | Hook only | 3 | 0/3 (0% msgs) | 2/3* | 2/3* | 2/3* | 2/3* | 0/3 | $1.84 | $3.32 |

\* Run 2 evaluator failed to return valid JSON; 2/3 reflects the two parseable runs.

**Key finding:** The SessionStart hook's `additionalContext` field does not reach the model — zero sign-off compliance across all runs. This aligns with [issue #16538](https://github.com/anthropics/claude-code/issues/16538). The skill approach achieved ~90% per-message compliance (typically missing 1-2 of 15-17 messages, usually the very first message and occasional short status updates like "Build passes clean."). **Skill is the recommended identity delivery mechanism.**

### Future: A/B Testing

The platform was designed with A/B testing in mind — automating the config-swap-and-compare workflow. The vision:

1. Define named **variants** (e.g. `skill-only`, `hook+skill`, `all-layers`), each mapping to a plugin configuration
2. Run the same profile against multiple variants in one command
3. Get a side-by-side comparison scorecard automatically

This would replace the current manual process of changing configs between batch runs and eyeballing the difference. Not yet built.

For background on the identity delivery configurations we're testing (hooks vs. skills vs. output styles), see [Identity Delivery Research](./identity-delivery-research.md).

## Cost

| Phase | Model | Cost per run | Notes |
|-------|-------|-------------|-------|
| Build | Opus (default) | ~$0.75-0.85 | Depends on app complexity |
| Evaluate | Sonnet (default) | ~$0.03-0.08 | 5-10 turns, reads files + transcript |

A 3-run batch with evaluation: ~$2.50-3.00 total.

Override models with `CLAUDE_MODEL` and `EVAL_MODEL` to adjust cost/quality tradeoffs.

## Files

| File | Purpose |
|------|---------|
| `agent-sdk-harness/src/test-plugin.ts` | Build harness — loads plugin, copies fixtures, saves `.transcript.json` |
| `agent-sdk-harness/src/evaluator.ts` | Evaluator agent — read-only, returns structured results |
| `agent-sdk-harness/src/batch-test.ts` | Batch runner — build N times, evaluate, print scorecard |
| `agent-sdk-harness/profiles.json` | Test profiles — prompt + check expectations + optional fixtures |
| `agent-sdk-harness/fixtures/` | Test fixture files (xlsx, images) copied into workspaces before builds |
| `test-plugin/` | The plugin under test |
| `workspaces/sdk/app-N/` | Build output + `.transcript.json` per run |
