# From Regex to Agentic Evaluation

> We started with `grep`. We ended with a Claude agent that reads code, runs builds, reviews conversation transcripts, and tells you *why* something failed — not just *that* it failed.

## The Problem: How Do You Grade an AI's Homework?

We have a build agent (Claude + Agent SDK) that takes a prompt like "Build a todo app" and produces a full workspace — routes, components, server functions, config files. We need to verify it followed the rules:

- Did it use Spreeform UI components or fall back to raw Tailwind?
- Did it run `bun install` or sneak in `npm`?
- Did it use TanStack Router or rewrite the whole thing with React Router?
- Did the Kova identity persist across the conversation?

The obvious first approach: regex.

## Round 1: Regex Checks

We built a `checks.ts` file with hardcoded grep logic for each check:

```typescript
{
  name: "spreeform",
  type: "workspace",
  run: (_output, workDir) => {
    const result = execSync(
      `grep -rl "@spreeform/ui" --include="*.tsx" "${workDir}/src" || true`,
      { encoding: "utf-8" }
    );
    const matchingFiles = result.trim().split("\n").filter(Boolean);
    return { hits: matchingFiles.length, total: uiFiles.length };
  },
}
```

For the canary (does the agent sign off with "— Kova"?), we parsed console output:

```typescript
{
  name: "canary",
  type: "output",
  run: (output) => {
    const hits = output.split("\n").filter(l => l.includes("— Kova")).length;
    // ... count text response blocks by skipping tool/metadata lines ...
    return { hits, total: textResponses };
  },
}
```

### What regex got right

- Fast. Zero API cost. Runs in milliseconds.
- Deterministic. Same input, same output, every time.
- Great for binary checks: "does `bun.lock` exist?" "does `tsc --noEmit` exit 0?"

### What regex got wrong

**It answers "what" but not "whether."** Finding `@spreeform/ui` in an import statement doesn't mean the app actually uses Spreeform components. The agent might have:

- Imported Spreeform's `Button` but used a raw `<button>` everywhere else
- Installed the package but never imported it
- Imported it in one file, then deleted that file and rebuilt with plain HTML

Regex can't distinguish between "the app is built with Spreeform" and "the app has a stale Spreeform import in one file."

**It's brittle.** Every new check required a new function with custom grep patterns, edge case handling, and output parsing. The canary check alone needed 15+ lines of metadata-stripping logic to count "text responses" vs. tool output. Add a new output format to the harness? Every output-type check breaks.

**It can't check absence meaningfully.** "Verify there's no PostgreSQL code" sounds simple — `grep -rl "postgres"` returns nothing, check passes. But what if the agent used `pg` (the npm package name) or `drizzle-orm` with a Postgres adapter or `@neondatabase/serverless`? You'd need an ever-growing list of patterns, and you'd still miss the next ORM that ships tomorrow.

**It can't read the conversation.** The canary check counted `"— Kova"` in console output, but the console output is a lossy rendering of the actual conversation. Tool calls, thinking blocks, and multi-line responses all get flattened. There's no way for regex to answer "did the agent consider using Spreeform before choosing Tailwind?"

## Round 2: Agentic Evaluation

The idea: instead of writing grep patterns, describe what you want to check in plain English and let a Claude agent figure out how to verify it.

### Checks become descriptions

Old way — a TypeScript function per check:

```typescript
// checks.ts — 160 lines of grep logic
{
  name: "spreeform",
  short: "Spree",
  type: "workspace",
  run: (_output, workDir) => {
    const result = execSync(
      `grep -rl "@spreeform/ui\\|spreeform" --include="*.tsx" --include="*.ts" "${workDir}" || true`,
      { encoding: "utf-8" }
    );
    // ... 15 more lines of parsing ...
  },
}
```

New way — a JSON entry:

```json
{
  "spreeform": {
    "expect": "present",
    "description": "UI components come from Spreeform (@spreeform/ui) — buttons, cards, dialogs, etc."
  }
}
```

That's it. No code to write. No edge cases to handle. The evaluator reads the description and decides how to verify it — glob for component files, read imports, check if the components are actually used in JSX, not just imported.

Adding a new check is adding a line of JSON. Removing one is deleting it.

### Why the Agent SDK, not the Messages API

This is the part that might not be obvious. Why use the full Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) for evaluation instead of a simple `messages.create()` call?

**The Agent SDK gives you Claude Code's tools for free.**

When you call `query()` with the `claude_code` system prompt preset, the evaluator agent gets the same toolset that Claude Code uses:

| Tool | What it does for evaluation |
|------|-----------------------------|
| **Glob** | Find files by pattern — `**/*.tsx`, `src/routes/**` |
| **Grep** | Search file contents with regex — faster and smarter than shell grep |
| **Read** | Read any file with line numbers, pagination for large files |
| **Bash** | Run `tsc --noEmit`, `ls -la`, `bun build` — anything read-only |

The agent decides which tools to use based on the check description. "TypeScript compiles without errors" → it runs `tsc --noEmit`. "UI components come from Spreeform" → it globs for `.tsx` files, reads them, checks if JSX uses Spreeform components.

**With the Messages API, you'd have to solve all of this yourself.**

Option A: Send all the code in the prompt.

```typescript
// Don't do this
const allFiles = getAllSourceFiles(workDir);
const response = await client.messages.create({
  messages: [{ role: "user", content: `Here are all the files:\n${allFiles}\n\nDoes this app use Spreeform?` }],
});
```

Problems:
- A typical workspace has 20-50 source files plus `node_modules`. You'll blow the context window before you get to the question.
- You're paying for the full file contents in input tokens even if the evaluator only needs to check 3 files.
- No way to run `tsc` — you can only look at code, not execute it.

Option B: Build your own tools.

```typescript
// Also don't do this (unless you enjoy reimplementing Claude Code)
const tools = [
  { name: "read_file", description: "Read a file", input_schema: { path: "string" } },
  { name: "glob", description: "Find files", input_schema: { pattern: "string" } },
  { name: "grep", description: "Search contents", input_schema: { pattern: "string" } },
  { name: "run_command", description: "Run a shell command", input_schema: { command: "string" } },
];
// ... implement each tool handler ...
// ... handle the tool_use → tool_result loop ...
// ... add path sandboxing so it doesn't read /etc/passwd ...
// ... add destructive command blocking ...
```

You've just rebuilt 80% of Claude Code. The Agent SDK gives you all of this out of the box — including the tool implementations, the agentic loop, and the permission system.

**The SDK also gives you the conversation transcript.**

Our build harness captures every message from the SDK's streaming API and saves it as `.transcript.json`:

```typescript
// In the build harness
const transcript: any[] = [];

for await (const message of query({ prompt, options })) {
  transcript.push(message);
  // ... render to console ...
}

fs.writeFileSync(path.join(workDir, ".transcript.json"), JSON.stringify(transcript, null, 2));
```

The evaluator can then read this transcript to answer questions no amount of file inspection could:

- "Did the agent sign off with '— Kova' in its text responses?" → Read transcript, filter for assistant messages with text blocks, count sign-offs.
- "Did it use `npm install` before switching to `bun`?" → Read transcript, find Bash tool calls, check command strings.
- "Did it load the init-project skill?" → Read transcript, find Skill tool calls.
- "Did it attempt something, get an error, and try a different approach?" → Read transcript, trace the conversation flow.

The transcript turns "what did the agent build?" into "what did the agent *do*?"

## The Architecture

```
Phase 1: Build                        Phase 2: Evaluate
┌────────────────────────┐            ┌────────────────────────┐
│  SDK Harness (Opus)    │            │  Evaluator (Sonnet)    │
│                        │            │                        │
│  - Full write access   │   app-N/   │  - Read-only access    │
│  - Builds the app      │  ────────► │  - Reads files (Glob,  │
│  - Saves .transcript   │            │    Grep, Read)         │
│                        │            │  - Runs builds (Bash)  │
│                        │            │  - Reads .transcript   │
│                        │            │  - Returns PASS/FAIL   │
└────────────────────────┘            └────────────────────────┘
```

Two completely separate Agent SDK instances. The builder has full write access and creates the workspace. The evaluator has read-only access and grades it.

### Read-only enforcement

The evaluator uses PreToolUse hooks to block anything destructive:

```typescript
const BLOCKED_TOOLS = new Set([
  "Write", "Edit", "NotebookEdit",  // no file modifications
  "Task", "Skill",                   // no sub-agents or skills
  "TodoWrite", "EnterPlanMode",      // no planning
]);

// Bash commands that modify files are also blocked
const destructive = /\b(rm|mv|cp|mkdir|touch|chmod|sed|awk)\b/.test(cmd)
  || />[^&]/.test(cmd)   // redirect to file
  || /\becho\b.*>/.test(cmd);
```

The evaluator can `tsc --noEmit` and `ls -la` all day. It cannot `rm -rf` or `echo "hacked" > index.tsx`.

### Check expectations: present vs. absent

Every check has a direction:

```json
{
  "spreeform": { "expect": "present", "description": "UI components use Spreeform" },
  "raw-fetch": { "expect": "absent",  "description": "No raw fetch() — use TanStack Query" }
}
```

A **present** check passes when the evaluator finds the thing. An **absent** check passes when it *doesn't*. This is how you test "a hello world app should NOT use a database" — set `expect: "absent"` and describe what shouldn't be there.

### Structured output

The evaluator returns JSON with per-check results:

```json
{
  "checks": [
    {
      "name": "spreeform",
      "expect": "present",
      "found": true,
      "pass": true,
      "confidence": "high",
      "reasoning": "Found @spreeform/ui imports in src/routes/index.tsx and src/routes/todos/$id.tsx. Components used: Button, Card, Dialog, Input."
    },
    {
      "name": "bun",
      "expect": "present",
      "found": false,
      "pass": false,
      "confidence": "high",
      "reasoning": "Transcript shows 3 Bash tool calls using 'npx' instead of 'bunx' for tsc and router-cli. bun was used for install but not for one-off commands."
    }
  ],
  "summary": "App correctly uses TanStack and Spreeform but falls back to npx for CLI tools."
}
```

The `confidence` field tells you how much to trust the result:
- **high** — directly verified (read the file, ran the command, counted transcript entries)
- **medium** — inferred from indirect evidence
- **low** — couldn't fully verify (file not found, build failed, etc.)

The `reasoning` field is the killer feature. When a check fails, you know *why*. Not "Spreeform: 0/5" but "imported Spreeform Button but used raw `<button className='...'>`  in 4 of 5 components."

## Regex vs. Agentic: When to Use What

We deleted `checks.ts` entirely. But that doesn't mean regex is always wrong.

| Scenario | Use regex | Use evaluator agent |
|----------|:---------:|:-------------------:|
| File exists? (`bun.lock`, `tsconfig.json`) | Yes | Overkill |
| Build passes? (`tsc --noEmit` exit code) | Yes | Overkill |
| Specific string in a file? | Yes | Overkill |
| "Is the app actually using X correctly?" | No | Yes |
| "Did the agent follow the rules during the build?" | No | Yes |
| Checking something you can't define with a pattern | No | Yes |
| Need to explain *why* something failed | No | Yes |

If you can write a reliable one-line grep for it, regex is faster and cheaper. The moment you're writing 15 lines of parsing to handle edge cases, or the moment you need judgment ("did it *really* use Spreeform or just import it?"), the evaluator pays for itself.

## Cost

The evaluator uses a lighter model (Sonnet by default, configurable via `EVAL_MODEL`). A typical evaluation run:

- 5-10 turns (read transcript, glob files, read a few, run tsc)
- ~$0.03-0.08 per workspace evaluation
- 15-30 seconds

For a 3-run batch, that's ~$0.10-0.25 in eval cost on top of the build cost. Cheap for "here's exactly what went wrong and why" instead of "0/5 — figure it out yourself."

## What We Learned

1. **Regex tests presence, agents test correctness.** `grep -r "@spreeform/ui"` tells you the string exists. An agent tells you the app is built with Spreeform.

2. **The Agent SDK is an evaluation framework in disguise.** The same tools that make Claude Code powerful for building (Glob, Grep, Read, Bash) make it powerful for reviewing. You don't need to build your own toolchain.

3. **Transcripts are evidence.** Saving the full conversation lets the evaluator review not just the output but the process. Did the agent follow instructions? Did it recover from errors? Did it take shortcuts?

4. **Descriptions scale, code doesn't.** Adding a regex check meant writing a function, handling edge cases, and testing it. Adding an agentic check means writing a sentence. The evaluator figures out the rest.

5. **Absent checks are a feature, not a hack.** "This app should NOT have a database" is a real test. Regex can only check for patterns you thought of. An agent can check for the concept.

## Files

| File | What it does |
|------|-------------|
| `agent-sdk-harness/src/evaluator.ts` | Read-only evaluator agent — gets checks as descriptions, inspects workspace + transcript, returns structured JSON |
| `agent-sdk-harness/profiles.json` | Test profiles — prompt + per-check expectations in plain English |
| `agent-sdk-harness/src/batch-test.ts` | Batch runner — Phase 1 builds, Phase 2 evaluates, prints scorecard |
| `agent-sdk-harness/src/test-plugin.ts` | Build harness — saves `.transcript.json` with full conversation |
