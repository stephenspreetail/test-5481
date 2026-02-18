# Identity Delivery Research

> How do you make Claude think it's a pirate app builder named Kova?
> Turns out, it's harder than it sounds.

This doc covers what we learned about delivering plugin-scoped identity rules to Claude — the mechanisms available, where they land in the API, what works, what's broken, and what Anthropic does internally.

## The Problem

Claude Code plugins don't support a `rules/` directory. You can't drop a `rules/kova.md` in your plugin and expect it to load — the plugin system pretends it doesn't exist. ([#14200](https://github.com/anthropics/claude-code/issues/14200))

We need plugin-delivered identity rules (the "Kova" persona) that:
- Work in **both** Claude Code CLI and the Agent SDK
- Are **always-on** — no user action required
- **Survive context compaction** — persist when the context window fills up

Three mechanisms exist. Each targets a different part of the API request.

## Where Each Layer Lands in the API

This is the key insight. Each mechanism targets a different part of the API request, and each part has different priority and persistence:

```
API Request to Claude
│
├── system (system prompt)              ← Output Style lives here
│   Priority: HIGHEST                     Compacted: NEVER
│   Activation: User opts in              Reminder: YES (periodic)
│
├── tools[] (tool definitions)          ← Skill description lives here
│   Priority: MEDIUM                      Compacted: NEVER
│   Activation: Always-on                 Reminder: NO
│
└── messages[] (conversation history)   ← SessionStart context lives here
    Priority: HIGH (at injection)         Compacted: YES (but re-injected)
    Activation: Always-on                 Reminder: NO
```

Only `messages[]` gets compacted. `system` and `tools[]` are re-sent fresh every API call.

## The Three Mechanisms

### Output Styles (`output-styles/`)

Output styles modify Claude's **system prompt** — the highest-priority position in the API call.

**The good:**
- System prompt level = maximum compliance
- `keep-coding-instructions: true` preserves Claude Code's default behavior
- Claude gets periodic reminders to follow the style during conversation
- Actually works today (no bugs)

**The bad:**
- Requires the user to opt in via `/output-style Kova Builder`
- Not always-on — if the user never selects it, Kova never loads
- Mutually exclusive — only one output style at a time
- Replaces concise output instructions (Claude gets chattier)

**Verdict:** Great as an optional power-user upgrade, terrible as a default identity mechanism.

### SessionStart Hooks (`hooks/` → `hooks-handlers/`)

SessionStart hooks run a shell script when a session starts. The script outputs JSON with an `additionalContext` field that gets injected into Claude's context. It re-fires on compaction, resume, and `/clear`.

**The good:**
- Always-on — no user action needed
- Additive — doesn't replace any default instructions
- Re-injects on compaction (identity survives long sessions)
- Dynamic — can run logic, check environment, call APIs

**The bad:**
- Known bug: [#16538](https://github.com/anthropics/claude-code/issues/16538) — plugin-delivered `additionalContext` is **silently dropped**. Claude only sees `"SessionStart:Callback hook success: Success"` instead of your actual context. The same hook works fine when placed in `~/.claude/settings.json`.
- Another bug: [#10373](https://github.com/anthropics/claude-code/issues/10373) — new session injection can fail entirely.

**The plot twist:** This is exactly how Anthropic builds their own plugins. Both the [explanatory-output-style](https://github.com/anthropics/claude-code/tree/main/plugins/explanatory-output-style) and [learning-output-style](https://github.com/anthropics/claude-code/tree/main/plugins/learning-output-style) plugins use SessionStart hooks — not the `output-styles/` directory. Zero of Anthropic's official plugins use output styles.

**Verdict:** The right pattern, but currently broken for plugin delivery. We follow it anyway so it activates the moment Anthropic ships the fix.

### Skills with `user-invocable: false`

A non-invocable skill's `description` field is embedded in the `tools` array of every API request. The tools array is structural metadata — re-sent fresh every turn and **never compacted**.

**The good:**
- Auto-activates with zero user action
- Works in both CLI and Agent SDK
- No known bugs
- Survives compaction (lives in tools array, not conversation history)

**The bad:**
- Tool descriptions carry less weight than the system prompt. The model treats them as "when to use this tool" guidance, not behavioral directives.
- Capped at 1024 chars per skill description.

**Verdict:** The most effective mechanism we tested. See [results below](#test-results).

## The Ideal: Follow Anthropic, Layer Everything

Anthropic's own plugins use a layered approach — multiple mechanisms targeting different parts of the API request for redundancy:

1. **SessionStart Hook** (primary) — Injects identity into `messages[]` via `additionalContext`. Re-fires on compaction, resume, and `/clear`. This is exactly how Anthropic builds [explanatory-output-style](https://github.com/anthropics/claude-code/tree/main/plugins/explanatory-output-style) and [learning-output-style](https://github.com/anthropics/claude-code/tree/main/plugins/learning-output-style). Zero of Anthropic's official plugins use the `output-styles/` directory.
2. **Non-invocable Skill** (safety net) — Identity in `tools[]`, survives compaction, always-on with no user action.
3. **Output Style** (optional upgrade) — Identity in `system` prompt, highest priority position, but requires user opt-in.

The layering ensures identity persists across compaction boundaries and remains present even if one mechanism fails. Each layer targets a different part of the API request (`system`, `tools[]`, `messages[]`), so the model receives the identity from multiple angles.

## Our Strategy Today: Skill-Based Identity

We can't layer everything yet. After testing all three mechanisms, we use a single approach:

### Non-Invocable Skill (Primary and Only)

**File:** `skills/kova-identity/SKILL.md` with `user-invocable: false`

The `description` field contains the Kova identity. Lives in the tools array, survives compaction. This is the only mechanism that demonstrably works for plugin-delivered identity today.

### What We Tried and Dropped

- **SessionStart Hook** — Tested with `hooks/hooks.json` → `hooks-handlers/session-start.sh`. The hook runs successfully but `additionalContext` is silently dropped due to [#16538](https://github.com/anthropics/claude-code/issues/16538). Result: 0% sign-off compliance across 3 runs. The hook files are kept in the plugin (disabled) so we can re-enable when the bug is fixed.
- **Output Style** — Requires user opt-in (`/output-style`), making it unsuitable as a default identity mechanism. Also mutually exclusive with other styles. Removed from the plugin.

### When to revisit

When [#16538](https://github.com/anthropics/claude-code/issues/16538) is fixed, activate the SessionStart hook in `hooks/hooks.json` to get the full layered approach. The handler (`hooks-handlers/session-start.sh`) is already wired up and ready.

## How the Hook System Works

If you've never wired up a Claude Code hook before, here's the mental model.

### Two files, two jobs

```
hooks/hooks.json                 ← The wiring: "when X happens, run Y"
hooks-handlers/session-start.sh  ← The logic: "here's what to inject"
```

**`hooks.json`** is pure configuration. Three questions:
1. **When?** — The event name (`SessionStart`, `PreToolUse`, `PostToolUse`, etc.)
2. **What type?** — `command` (shell script), `prompt` (LLM single-turn), or `agent` (multi-turn subagent)
3. **Where?** — Path to the handler script

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/hooks-handlers/session-start.sh"
          }
        ]
      }
    ]
  }
}
```

`${CLAUDE_PLUGIN_ROOT}` resolves to wherever the plugin lives on disk. The nested arrays allow multiple matchers with multiple hooks per matcher. For SessionStart we just have one of each.

**`session-start.sh`** is the handler. The protocol:

1. Claude Code runs the script
2. The script writes JSON to **stdout**
3. Claude Code reads that JSON and acts on it
4. Exit code `0` = success, non-zero = failure

```bash
#!/usr/bin/env bash
cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "You are Kova, an AI app builder..."
  }
}
EOF
exit 0
```

The magic field is `additionalContext` — whatever string you put there gets injected into Claude's conversation context. Think of it as invisible instructions typed before the user's first message.

### When SessionStart fires

Not just on new sessions — it re-fires in four situations:

| Trigger | `source` field | Why it matters |
|---------|---------------|----------------|
| New session | `"startup"` | First load |
| Resume (`--continue`) | `"resume"` | Coming back to existing work |
| `/clear` | `"clear"` | User reset the conversation |
| Context compaction | `"compact"` | Context window filled up, old messages pruned |

That last one is critical — when compaction prunes old messages, it would normally erase the identity. But because SessionStart re-fires on compaction, the identity gets re-injected. This is why hooks beat a one-time system prompt for long sessions.

### What the hook receives

The script gets JSON on **stdin** with session metadata:

```json
{
  "session_id": "abc123",
  "cwd": "/path/to/workspace",
  "model": "claude-opus-4-6",
  "source": "startup",
  "hook_event_name": "SessionStart"
}
```

Our script ignores stdin (always injects the same identity), but you could conditionally inject different context based on the working directory, model, or session state.

### The 14 hook events

The ones most relevant to plugin development:

| Event | When | Can block? | Can inject context? |
|-------|------|:---:|:---:|
| `SessionStart` | Session begins/resumes/compacts | No | Yes |
| `PreToolUse` | Before a tool runs | Yes | Yes |
| `PostToolUse` | After a tool succeeds | No | Yes |
| `UserPromptSubmit` | Before processing user input | Yes | Yes |
| `Stop` | Agent finishes responding | Yes | No |

`PreToolUse` is what our SDK harness uses for workspace sandboxing — it returns `"permissionDecision": "deny"` to block tool calls outside the allowed paths.

## The Canary

How do you measure if identity delivery actually works? You need a signal that's:
- **Multi-turn** — appears in every response, not just the first
- **Grep-able** — countable with a script
- **Non-disruptive** — doesn't break code blocks or tool calls

Our canary is a **sign-off line**: every text response must end with `— Kova`.

```
compliance = (responses with "— Kova") / (total text responses) × 100
```

The instruction is embedded in all three layers with identical wording:

> CANARY: End every text response with the sign-off "— Kova" on its own line. This is non-negotiable — every single response must end with it.

### Test Results

Tested with the `todo-app-identity` profile (build a todo app + verify kova-signoff on every message):

| Config | Runs | Per-Message Compliance | Scorecard (all msgs) | Model |
|--------|:----:|:----------------------:|:--------------------:|-------|
| Skill only | 3 | ~88-93% (15/17, 14/15, 14/16) | 0/3 PASS | opus-4-6 |
| Hook only | 3 | 0% (0/16, 0/15, 0/16) | 0/3 PASS | opus-4-6 |

**Skill-only** achieves ~90% per-message compliance. The 1-2 missed messages per run are typically the very first response ("I'll start by invoking the relevant skills...") and occasional short status updates ("Build passes clean."). This is consistent with the model treating tool descriptions as guidance — it follows them most of the time but not with the rigor of a system prompt directive.

**Hook-only** achieves 0% compliance. The `additionalContext` from SessionStart hooks is confirmed silently dropped for plugin-delivered hooks. The identity simply never reaches the model.

Neither configuration achieves 100% compliance (the scorecard requires all messages to pass), but the skill approach gets meaningfully close. The remaining gap may be addressable by strengthening the canary language or combining with output styles for users who opt in.

## Compliance Research

No model achieves 100% instruction compliance. Key findings:

- **OpenAI's Instruction Hierarchy paper** — Priority ordering: System Messages (Priority 0) > User Messages (Priority 10) > Tool Outputs (Priority 30)
- **AI Muse 18-model benchmark** — 0 of 18 models achieved perfect compliance
- **Anthropic** says Claude 4.x is "more responsive to system prompt" but publishes no numbers

This means identity delivery is fundamentally a compliance problem, not a binary on/off. The best we can do is maximize the signal strength by layering mechanisms at different API positions.

## References

- [Output styles — Claude Code Docs](https://code.claude.com/docs/en/output-styles)
- [Hooks reference — Claude Code Docs](https://code.claude.com/docs/en/hooks)
- [Anthropic's explanatory-output-style plugin](https://github.com/anthropics/claude-code/tree/main/plugins/explanatory-output-style)
- [Anthropic's learning-output-style plugin](https://github.com/anthropics/claude-code/tree/main/plugins/learning-output-style)
- [#16538 — Plugin SessionStart hooks don't surface additionalContext](https://github.com/anthropics/claude-code/issues/16538)
- [#10373 — SessionStart hooks not working for new conversations](https://github.com/anthropics/claude-code/issues/10373)
- [#14200 — Plugin rules/ directory not supported](https://github.com/anthropics/claude-code/issues/14200)
- [Plugins README — anthropics/claude-code](https://github.com/anthropics/claude-code/blob/main/plugins/README.md)
