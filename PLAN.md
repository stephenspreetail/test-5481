# Agentic Epic Builder — Implementation Plan

Inspired by the agentic detect → act → log → repeat loop from the article on deep learning experimentation, this system accepts a list of epics (in YAML) and drives independent Claude Agent SDK subprocesses through a plan-build-test cycle until each epic reaches a measurable completeness threshold.

---

## Architecture Overview

```
epics.yaml
     │
     ▼
┌─────────────────────────────────────────────────────┐
│                  ORCHESTRATOR                        │
│         (Pure Python — NOT a Claude agent)           │
│                                                     │
│  For each epic:                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  ITERATION LOOP (up to max_iterations)       │   │
│  │                                             │   │
│  │  1. PLANNER ──────────────────────────────► │   │
│  │     (Claude SDK, plan mode)   Plan JSON     │   │
│  │           ◄──────────────────────────────   │   │
│  │                                             │   │
│  │  2. BUILDER ──────────────────────────────► │   │
│  │     (Claude SDK, acceptEdits) BuildResult   │   │
│  │           ◄──────────────────────────────   │   │
│  │                                             │   │
│  │  3. TESTER ───────────────────────────────► │   │
│  │     (Claude SDK, bypassPerms) TestResult    │   │
│  │           ◄──────────────────────────────   │   │
│  │                                             │   │
│  │  4. EVALUATE completeness (orchestrator)    │   │
│  │     ✓ complete → break, next epic           │   │
│  │     ✗ not done → feed TestResult back to    │   │
│  │                   Planner, iterate          │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Log every phase to logs/<epic-id>_iter_N_phase.json│
└─────────────────────────────────────────────────────┘
```

---

## File Structure

```
agentic_epic_builder/
├── main.py                    # Click CLI entry point
├── orchestrator.py            # Core orchestration loop (pure Python)
├── agents/
│   ├── __init__.py
│   ├── planner.py             # Planner agent wrapper (plan mode)
│   ├── builder.py             # Builder agent wrapper (acceptEdits)
│   └── tester.py              # Tester agent wrapper (runs real pytest)
├── models/
│   ├── __init__.py
│   ├── epic.py                # Epic, Subtask, Plan, BuildResult, TestResult (Pydantic)
│   └── state.py               # IterationRecord, EpicState, OrchestratorState
├── prompts/
│   ├── planner_system.md      # Planner system prompt (plan-only, no file writes)
│   ├── builder_system.md      # Builder system prompt (implement all subtasks)
│   └── tester_system.md      # Tester system prompt (run pytest, return TestResult)
├── utils/
│   └── sdk_runner.py          # Single SDK integration point: run_agent_query() + retry
├── epics.yaml                 # Sample epics input (user-editable)
└── requirements.txt
```

---

## Agent Roles & SDK Integration

All agents use the **Claude Agent SDK Python `query()` function** (not raw subprocess CLI). The `query()` function handles subprocess management, JSON buffering, structured output validation, and typed exceptions internally.

| Agent | SDK Mode | Tools | Returns |
|---|---|---|---|
| Planner | `permission_mode="plan"` | Read, Glob, Grep, WebSearch | `Plan` (Pydantic) |
| Builder | `permission_mode="acceptEdits"` | Read, Write, Edit, Bash, Glob, Grep | `BuildResult` (Pydantic) |
| Tester | `permission_mode="bypassPermissions"` | Read, Bash, Glob, Grep | `TestResult` (Pydantic) |

Every agent uses `output_format={"type": "json_schema", "schema": Model.model_json_schema()}` for guaranteed schema-validated structured output.

---

## Key Data Models (`models/epic.py`)

```python
class Epic(BaseModel):
    id: str; title: str; description: str; language: str
    framework: str | None; acceptance_criteria: list[str]
    tags: list[str]; priority: Literal["high", "medium", "low"]

class Subtask(BaseModel):
    id: str; title: str; description: str; file_path: str
    dependencies: list[str]; test_file_path: str | None

class Plan(BaseModel):
    epic_id: str; iteration: int; summary: str
    subtasks: list[Subtask]; testing_strategy: str; risks: list[str]

class BuildResult(BaseModel):
    epic_id: str; iteration: int; artifacts: list[Artifact]
    build_errors: list[str]; success: bool

class TestResult(BaseModel):
    epic_id: str; iteration: int
    tests_passed: int; tests_failed: int; tests_total: int
    coverage_percent: float; critical_issues: list[str]
    warnings: list[str]; feedback_for_planner: str; success: bool
```

---

## Orchestration Loop Pseudocode

```
for each epic:
    previous_test_result = None
    for iteration in 1..max_iterations:
        # DETECT
        plan = planner(epic, iteration, previous_test_result)
        log(epic, iteration, "plan", plan)

        # ACT
        build_result = builder(epic, plan)
        log(epic, iteration, "build", build_result)

        test_result = tester(epic, plan, build_result)
        log(epic, iteration, "test", test_result)
        previous_test_result = test_result

        # EVALUATE
        if is_complete(test_result):
            mark_completed(); break
        # REPEAT (planner gets feedback via previous_test_result)
    else:
        mark_max_iterations_reached()
```

---

## Completeness Evaluation (4 gates, all must pass)

| Gate | Check |
|---|---|
| 1 — Zero failures | `test_result.tests_failed == 0` |
| 2 — Coverage threshold | `test_result.coverage_percent >= coverage_threshold` (default 80%) |
| 3 — No critical issues | `len(test_result.critical_issues) == 0` |
| 4 — Agent declaration | `test_result.success == True` |

The orchestrator's own gates (1–3) are the authoritative check. Gate 4 adds the Tester agent's own assessment of acceptance criteria that can't be checked deterministically.

---

## SDK Runner (`utils/sdk_runner.py`)

Single integration point for all agent calls:

```python
async def run_agent_query(prompt, system_prompt, output_schema,
                          workspace_dir, allowed_tools, permission_mode,
                          model, max_turns, max_budget_usd) -> (parsed, ResultMessage):
    options = ClaudeAgentOptions(
        system_prompt=system_prompt,
        allowed_tools=allowed_tools,
        permission_mode=permission_mode,
        output_format={"type": "json_schema", "schema": output_schema.model_json_schema()},
        cwd=str(workspace_dir), model=model, max_turns=max_turns,
    )
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, ResultMessage):
            return output_schema.model_validate(message.structured_output), message
```

Retry wrapper: exponential backoff (2s, 4s, 8s) on `ProcessError` and `AgentOutputError`. Never retries `CLINotFoundError` (unrecoverable).

---

## Error Handling

| Layer | Trigger | Response |
|---|---|---|
| SDK retry (layer 1) | `ProcessError`, `AgentOutputError` | Exponential backoff, up to 3 attempts |
| Phase failure (layer 2) | All retries exhausted | Record failure, mark epic failed, skip remaining iterations |
| Soft build errors (layer 3) | `BuildResult.build_errors` non-empty | Continue to Tester (let tests catch real failures) |
| Iteration not complete (layer 4) | `TestResult.success == False` | Feed `feedback_for_planner` to next Planner call, iterate |
| Max iterations (layer 5) | Loop exhausted | Mark `max_iterations_reached`, move to next epic |

---

## Key Architectural Decisions

1. **SDK `query()` over raw CLI subprocess** — The Python SDK handles subprocess lifecycle, JSON buffering, structured output retries, and typed exceptions. Raw CLI subprocess would require reimplementing all of this.

2. **Planner in `plan` mode** — Hard safety boundary: Planner reads workspace but cannot write. Prevents accidental file mutations during planning phase.

3. **Independent agents (no session sharing)** — Each `query()` call is a fresh session. Agents communicate exclusively via JSON payloads embedded in prompts. This enables full isolation, restartability, and debuggability.

4. **Orchestrator is pure Python** — No Claude agent at the orchestrator level. Completeness evaluation, state management, and routing are deterministic Python logic that cannot be influenced by model hallucination.

5. **`CLAUDECODE=1` must be unset** — Critical: running Claude Agent SDK from within Claude Code requires unsetting `CLAUDECODE=1` to avoid "nested session" errors. The SDK handles this internally via `env={}` passthrough on the subprocess.

---

## Implementation Order

1. `requirements.txt` + `models/epic.py` + `models/state.py` — Data contracts first
2. `utils/sdk_runner.py` — Core SDK integration layer
3. `prompts/*.md` — System prompts for each agent
4. `agents/planner.py` → `agents/builder.py` → `agents/tester.py` — Agent wrappers
5. `orchestrator.py` — Orchestration loop using agent wrappers
6. `main.py` — CLI entry point
7. `epics.yaml` — Sample epics demonstrating the input format

---

## `epics.yaml` Input Format

```yaml
settings:
  max_iterations_per_epic: 3
  coverage_threshold: 80
  workspace_dir: ./workspace
  log_dir: ./logs
  model: claude-opus-4-6

epics:
  - id: epic-001
    title: "User Authentication System"
    description: |
      Build a complete JWT-based authentication system with
      registration, login, logout, and token refresh endpoints.
    language: python
    framework: fastapi
    acceptance_criteria:
      - All endpoints return correct HTTP status codes
      - Passwords are hashed with bcrypt
      - JWT tokens expire after 24 hours
      - Test coverage >= 80%
    priority: high
```

---

## CLI Usage

```bash
# Run all epics
python main.py --epics-file epics.yaml

# Run specific epic(s)
python main.py -e epics.yaml --epic-ids epic-001,epic-002

# Parallel execution
python main.py -e epics.yaml --parallel

# Custom thresholds
python main.py -e epics.yaml --max-iterations 5 --coverage-threshold 90
```
