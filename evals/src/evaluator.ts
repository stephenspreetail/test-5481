/**
 * Evaluator agent — a read-only Claude Agent SDK instance that reviews
 * a workspace against a set of checks and returns structured scores.
 *
 * Usage (standalone):
 *   bun run evaluator.ts <workDir> <checksJson>
 *
 * Usage (programmatic):
 *   import { evaluate } from "./evaluator.js";
 *   const results = await evaluate(workDir, checks, { model, originalPrompt });
 *
 * The agent can:
 *   ✓ Read files (Read, Glob, Grep)
 *   ✓ Run build/test commands (Bash — read-only: tsc, bun build, ls, cat, find, grep)
 *   ✗ Cannot Write, Edit, or NotebookEdit (blocked by PreToolUse hook)
 *   ✗ Cannot delete files or modify the workspace
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvalCheck {
  name: string;
  expect: "present" | "absent";
  description: string; // what to look for — natural language
}

export interface EvalCheckResult {
  name: string;
  expect: "present" | "absent";
  found: boolean;
  pass: boolean;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

export interface EvalResult {
  checks: EvalCheckResult[];
  summary: string;
  cost: number;
  turns: number;
}

export interface EvalOptions {
  model?: string;
  originalPrompt?: string;
  verbose?: boolean;
}

// ---------------------------------------------------------------------------
// Default checks — always included in every evaluation
// ---------------------------------------------------------------------------

function getDevServerPort(workDir: string): number {
  // Derive a unique port from the app number to avoid conflicts in parallel evals
  const match = workDir.match(/app-(\d+)/);
  const appNum = match ? parseInt(match[1]) : Math.floor(Math.random() * 1000);
  return 4000 + (appNum % 1000);
}

function getDefaultChecks(workDir: string): EvalCheck[] {
  // Only include dev-server check if there's an app to serve
  const hasPackageJson = fs.existsSync(path.join(workDir, "package.json"));
  if (!hasPackageJson) return [];

  const port = getDevServerPort(workDir);
  const tmpPrefix = `/tmp/eval-${port}`;
  return [
    {
      name: "dev-server",
      expect: "present",
      description:
        `The app starts and serves pages without errors. ` +
        `Run 'bun run dev --port ${port}' in the background, wait for the server to be ready, ` +
        `then curl http://localhost:${port}/ and verify you get a 200 response with HTML content (not an error page). ` +
        `Check for server-side errors in the terminal output (like ReferenceError, TypeError, etc.). ` +
        `Kill the dev server process when done. ` +
        `IMPORTANT: Use a single Bash command that backgrounds the server, sleeps, curls, and kills — ` +
        `e.g. 'cd ${workDir} && bun run dev --port ${port} > ${tmpPrefix}-server.log 2>&1 & DEV_PID=$! && sleep 8 && ` +
        `curl -s -o ${tmpPrefix}-response.html -w "%{http_code}" http://localhost:${port}/ && kill $DEV_PID 2>/dev/null' ` +
        `then read ${tmpPrefix}-server.log and ${tmpPrefix}-response.html to check for errors.`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Blocked tools — write operations
// ---------------------------------------------------------------------------

const BLOCKED_TOOLS = new Set([
  "Write",
  "Edit",
  "NotebookEdit",
  "Task",
  "Skill",
  "TodoWrite",
  "EnterPlanMode",
  "ExitPlanMode",
]);

// ---------------------------------------------------------------------------
// Evaluate
// ---------------------------------------------------------------------------

export async function evaluate(
  workDir: string,
  checks: EvalCheck[],
  options: EvalOptions = {}
): Promise<EvalResult> {
  const { model, originalPrompt, verbose } = options;

  // Merge default checks (dev-server) with profile checks
  const defaultChecks = getDefaultChecks(workDir);
  const allChecks = [...defaultChecks, ...checks];

  const checksDescription = allChecks
    .map(
      (c, i) =>
        `${i + 1}. **${c.name}** (expect: ${c.expect}) — ${c.description}`
    )
    .join("\n");

  const prompt = `Evaluate this workspace and return results as JSON.

## Workspace
\`${workDir}\`

## Original Build Prompt
${originalPrompt ? `"${originalPrompt}"` : "(not provided)"}

## Conversation Transcript
The full agent conversation (every message, tool call, tool result, and thinking block) is saved at \`.transcript.json\` in the workspace root. **Read this file first** — it contains the complete build session including:
- All assistant text responses (for canary/identity checks)
- All tool calls with inputs (for package manager checks, skill usage, etc.)
- All tool results (for error detection)
- Thinking blocks (for understanding agent decision-making)

## Checks to Evaluate

${checksDescription}

## Instructions

1. **Start by reading \`.transcript.json\`** to understand what the agent did during the build session.
2. **Run the dev server smoke test** — the dev-server check tells you exactly how. Do this early so you know if the app actually works.
3. Then explore the workspace: read source files, check imports, run \`tsc --noEmit\`, \`ls\`, etc.
4. For each check, determine if the thing is **found** using both the transcript and workspace files.
5. A check **passes** when:
   - expect="present" AND found=true → PASS
   - expect="present" AND found=false → FAIL
   - expect="absent" AND found=false → PASS
   - expect="absent" AND found=true → FAIL
6. Return your results as a single JSON code block with this exact shape:

\`\`\`json
{
  "checks": [
    {
      "name": "check-name",
      "expect": "present",
      "found": true,
      "pass": true,
      "confidence": "high",
      "reasoning": "Found @spreeform/ui imports in 3 component files..."
    }
  ],
  "summary": "One-sentence overall assessment"
}
\`\`\`

Be thorough — read actual source files, don't guess. Use Glob to find files, Read to inspect them, Bash to run builds. Your confidence should be "high" only if you directly verified (read the file, ran the command). "medium" if you inferred from indirect evidence. "low" if you couldn't fully verify.

IMPORTANT: Return ONLY the JSON code block as your final message. No other text.`;

  let resultText = "";
  let cost = 0;
  let turns = 0;

  for await (const message of query({
    prompt,
    options: {
      cwd: workDir,
      maxTurns: 20,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      model: model || process.env.EVAL_MODEL || "claude-sonnet-4-5-20250929",
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append:
          "You are a code evaluator. You have READ-ONLY access to the workspace. " +
          "You cannot write, edit, or delete any files. " +
          "Your job is to inspect the workspace and return structured evaluation results. " +
          "Be thorough but efficient — use Glob to find files, Read to check contents, " +
          "and Bash only for build commands (tsc, bun build) or read-only commands (ls, find, grep).",
      },
      hooks: {
        PreToolUse: [
          {
            hooks: [
              async (input) => {
                const { tool_name, tool_input } = input as {
                  tool_name: string;
                  tool_input: Record<string, unknown>;
                };

                // Block write/edit tools
                if (BLOCKED_TOOLS.has(tool_name)) {
                  return {
                    hookSpecificOutput: {
                      hookEventName: "PreToolUse" as const,
                      permissionDecision: "deny" as const,
                      permissionDecisionReason: `Blocked: ${tool_name} is not allowed in evaluator mode (read-only).`,
                    },
                  };
                }

                // Block Bash commands that modify files (allow redirects to /tmp for dev server smoke test)
                if (tool_name === "Bash" && typeof tool_input.command === "string") {
                  const cmd = tool_input.command;
                  const hasRedirect = />[^&]/.test(cmd) || /\becho\b.*>/.test(cmd);
                  const redirectsToTmp = hasRedirect && />\s*\/tmp\//.test(cmd);
                  const destructive =
                    /\b(rm|mv|cp|mkdir|touch|chmod|chown|sed|awk)\b/.test(cmd) ||
                    (hasRedirect && !redirectsToTmp);
                  if (destructive) {
                    return {
                      hookSpecificOutput: {
                        hookEventName: "PreToolUse" as const,
                        permissionDecision: "deny" as const,
                        permissionDecisionReason: `Blocked: Bash command "${cmd.slice(0, 80)}" appears to modify files. Evaluator is read-only.`,
                      },
                    };
                  }
                }

                // Restrict paths to workspace + /tmp
                const paths = [
                  tool_input.file_path,
                  tool_input.path,
                  tool_input.notebook_path,
                ].filter((v): v is string => typeof v === "string");

                for (const p of paths) {
                  const resolved = path.resolve(workDir, p);
                  if (!resolved.startsWith(workDir) && !resolved.startsWith("/tmp")) {
                    return {
                      hookSpecificOutput: {
                        hookEventName: "PreToolUse" as const,
                        permissionDecision: "deny" as const,
                        permissionDecisionReason: `Blocked: path "${p}" is outside the workspace.`,
                      },
                    };
                  }
                }

                return {};
              },
            ],
          },
        ],
      },
      env: {
        ...process.env,
        ...(process.env.ANTHROPIC_FOUNDRY_RESOURCE
          ? {
              CLAUDE_CODE_USE_FOUNDRY: "1",
              ANTHROPIC_FOUNDRY_RESOURCE: process.env.ANTHROPIC_FOUNDRY_RESOURCE,
              ...(process.env.ANTHROPIC_FOUNDRY_API_KEY
                ? { ANTHROPIC_FOUNDRY_API_KEY: process.env.ANTHROPIC_FOUNDRY_API_KEY }
                : {}),
            }
          : {}),
      },
    },
  })) {
    if (verbose) {
      const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
      console.error(
        dim(
          `[eval] type=${message.type} subtype=${"subtype" in message ? (message as any).subtype : "-"}`
        )
      );
    }

    // Capture assistant text
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === "text" && "text" in block) {
          resultText += block.text;
        }
      }
    }

    // Capture cost/turns
    if (message.type === "result") {
      if (message.subtype === "success") {
        cost = message.total_cost_usd;
        turns = message.num_turns;
      }
    }
  }

  // Parse JSON from the result text
  const jsonMatch = resultText.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) {
    // Try parsing the whole thing as JSON
    try {
      const parsed = JSON.parse(resultText.trim());
      return { ...parsed, cost, turns };
    } catch {
      return {
        checks: allChecks.map((c) => ({
          name: c.name,
          expect: c.expect,
          found: false,
          pass: false,
          confidence: "low" as const,
          reasoning: "Evaluator did not return valid JSON",
        })),
        summary: "Evaluation failed — could not parse results",
        cost,
        turns,
      };
    }
  }

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    return { ...parsed, cost, turns };
  } catch {
    return {
      checks: allChecks.map((c) => ({
        name: c.name,
        expect: c.expect,
        found: false,
        pass: false,
        confidence: "low" as const,
        reasoning: "Evaluator returned malformed JSON",
      })),
      summary: "Evaluation failed — malformed JSON",
      cost,
      turns,
    };
  }
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

if (import.meta.main) {
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

  const cliArgs = process.argv.slice(2);
  const workDir = cliArgs[0];
  const checksJson = cliArgs[1];

  if (!workDir || !checksJson) {
    console.error('Usage: bun run evaluator.ts <workDir> \'[{"name":"canary","expect":"present","description":"..."}]\'');
    process.exit(1);
  }

  const checks: EvalCheck[] = JSON.parse(checksJson);
  const verbose = process.env.VERBOSE === "1";

  console.log(dim(`Evaluating: ${workDir}`));
  console.log(dim(`Checks: ${checks.map((c) => `${c.name}(${c.expect === "absent" ? "✗" : "✓"})`).join(", ")}\n`));

  const result = await evaluate(workDir, checks, {
    model: process.env.EVAL_MODEL || process.env.CLAUDE_MODEL,
    verbose,
  });

  console.log(bold("\nEvaluation Results:"));
  for (const cr of result.checks) {
    const icon = cr.pass ? green("PASS") : red("FAIL");
    const conf = dim(`[${cr.confidence}]`);
    console.log(`  ${icon} ${cr.name} — ${cr.reasoning} ${conf}`);
  }
  console.log(dim(`\n${result.summary}`));
  console.log(dim(`Cost: $${result.cost.toFixed(4)} | Turns: ${result.turns}`));
}
