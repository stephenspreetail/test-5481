# Evals

Compliance testing for the Kova plugin. Define what to build, what rules to check, and whether each rule should be present or absent. The platform builds apps via the Agent SDK, then evaluates each workspace with a read-only evaluator agent.

## Setup

```bash
cd evals
cp .env.example .env    # Configure your API keys
bun install
```

### Environment Options

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude Code CLI (your Anthropic subscription) |
| `ANTHROPIC_FOUNDRY_RESOURCE` | Agent SDK via Azure AI Foundry (resource name only, not URL) |
| `ANTHROPIC_FOUNDRY_API_KEY` | Azure AI Foundry API key |
| `CLAUDE_MODEL` | Builder model (default: `claude-opus-4-6`) |
| `EVAL_MODEL` | Evaluator model (default: `claude-sonnet-4-5`) |

## Usage

| Command | What it does |
|---------|-------------|
| `bun run batch --profile todo-app` | Build + evaluate using profile (runs, prompt, checks) |
| `bun run batch "prompt"` | Build + evaluate with default checks (3 runs) |
| `bun run sdk "prompt"` | Single SDK build with plugin loaded |
| `bun run cli` | Interactive CLI session with plugin loaded |
| `bun run clean` | Wipe all generated workspaces |

Each run creates a fresh `workspaces/{cli,sdk}/app-N` directory. Previous builds are preserved until you clean.

## Profiles

Profiles define a prompt + per-check expectations. Checks use `"present"` (should be found) or `"absent"` (should NOT be found):

```json
{
  "todo-app": {
    "prompt": "Build a todo app w/ home page and details",
    "runs": 3,
    "checks": {
      "bun":       { "expect": "present", "description": "All package commands use bun" },
      "tanstack":  { "expect": "present", "description": "App uses TanStack Start/Router" },
      "spreeform": { "expect": "present", "description": "UI components use @spreeform/ui" }
    }
  }
}
```

Available profiles: `todo-app`, `image-forge`. Add your own in `profiles.json`.

## Fixtures

Some profiles need input files (spreadsheets, images) that the agent works with during the build.

- Place fixture files in `fixtures/`
- Reference them in a profile's `fixtures` array — they're copied into the workspace before the build starts

## Structure

```
evals/
├── src/
│   ├── test-plugin.ts     # Build harness — loads plugin, saves transcript
│   ├── batch-test.ts      # Batch runner — build N times, evaluate, scorecard
│   └── evaluator.ts       # Read-only evaluator agent
├── profiles.json          # Test profiles (prompt + check expectations)
├── fixtures/              # Test fixture files (images, xlsx, etc.)
├── workspaces/            # Generated output (gitignored)
│   ├── cli/app-{N}        #   CLI builds
│   └── sdk/app-{N}        #   SDK builds (includes .transcript.json)
└── TODO.md                # Planned improvements
```

## Documentation

| Doc | What it covers |
|-----|---------------|
| [Plugin Compliance Testing](../docs/plugin-compliance-testing.md) | Full platform guide — profiles, batch testing, results |
| [Agentic Evaluation](../docs/agentic-evaluation.md) | Why we use a Claude agent instead of regex for evaluation |
| [Identity Delivery Research](../docs/identity-delivery-research.md) | Plugin identity mechanisms — hooks, skills, output styles, known bugs |
