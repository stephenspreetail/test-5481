#!/usr/bin/env bun
/**
 * Batch runner — runs the SDK harness N times, then evaluates each workspace
 * using an agentic evaluator (read-only Claude Agent SDK instance).
 *
 * Usage:
 *   bun run batch "<prompt>" [--runs N]
 *   bun run batch --profile todo-app [--runs N]
 *
 * Options:
 *   SEQUENTIAL=1      Run build instances one at a time (default: parallel)
 *   EVAL_MODEL=...    Model for evaluator (default: claude-sonnet-4-5-20250929)
 *   CLAUDE_MODEL=...  Model for builder (passed through to each run)
 *   NO_EVAL=1         Skip the evaluator, only run builds
 *   VERBOSE=1         Show evaluator debug output
 *
 * Profiles are defined in evals/profiles.json.
 */

import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import chalk from "chalk";
import Table from "cli-table3";
import { evaluate, type EvalCheck, type EvalResult } from "./evaluator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const evalsRoot = path.resolve(__dirname, "..");
const profilesPath = path.resolve(__dirname, "../profiles.json");

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

const rawArgs = process.argv.slice(2);

// Parse named flags
function parseFlag(flag: string): string | undefined {
  const idx = rawArgs.indexOf(flag);
  if (idx === -1) return undefined;
  return rawArgs[idx + 1];
}

function consumeFlags(): string[] {
  // Return args with named flags removed
  const remaining: string[] = [];
  let i = 0;
  while (i < rawArgs.length) {
    if (rawArgs[i] === "--profile" || rawArgs[i] === "--runs") {
      i += 2; // skip flag + value
    } else {
      remaining.push(rawArgs[i]);
      i++;
    }
  }
  return remaining;
}

interface ProfileCheck {
  expect: "present" | "absent";
  description: string;
}

let count = 0;
let prompt = "";
let profileChecks: Record<string, ProfileCheck> = {};
let profileName = "";
let profileFixtures: string[] = [];

const cliRuns = parseInt(parseFlag("--runs") ?? "0");
const positionalArgs = consumeFlags();

profileName = parseFlag("--profile") ?? "";
if (profileName) {
  const profiles = JSON.parse(fs.readFileSync(profilesPath, "utf-8"));
  const profile = profiles[profileName];
  if (!profile) {
    console.error(`Unknown profile: "${profileName}"`);
    console.error(`Available: ${Object.keys(profiles).join(", ")}`);
    process.exit(1);
  }
  prompt = profile.prompt;
  profileChecks = profile.checks;
  profileFixtures = profile.fixtures ?? [];
  count = cliRuns > 0 ? cliRuns : (profile.runs ?? 3);
} else {
  prompt = positionalArgs.join(" ");
  count = cliRuns > 0 ? cliRuns : 3;
  // Default checks for ad-hoc runs
  profileChecks = {
    bun:        { expect: "present", description: "All package manager commands use bun (not npm, yarn, or pnpm)" },
    tanstack:   { expect: "present", description: "App uses TanStack Start/Router for routing" },
    typescript: { expect: "present", description: "TypeScript compiles without errors (tsc --noEmit passes)" },
    spreeform:  { expect: "present", description: "UI components come from Spreeform (@spreeform/ui)" },
  };
}

if (!count || count < 1 || !prompt) {
  printUsage();
  process.exit(1);
}

function printUsage() {
  console.error('Usage: bun run batch "<prompt>" [--runs N]');
  console.error("       bun run batch --profile <name> [--runs N]");
  console.error('  e.g. bun run batch "Build a hello world app"');
  console.error("       bun run batch --profile todo-app");
  console.error("       bun run batch --profile todo-app --runs 5");
  console.error("\nOptions:");
  console.error("  SEQUENTIAL=1      Run builds one at a time");
  console.error("  EVAL_MODEL=...    Model for evaluator (default: sonnet)");
  console.error("  NO_EVAL=1         Skip evaluator, only run builds");
  console.error("  VERBOSE=1         Show evaluator debug output");
  try {
    const profiles = JSON.parse(fs.readFileSync(profilesPath, "utf-8"));
    const profileList = Object.entries(profiles)
      .map(([name, p]: [string, any]) => `${name} (${p.runs ?? 3} runs)`)
      .join(", ");
    console.error(`\nProfiles: ${profileList}`);
  } catch {}
}

const parallel = process.env.SEQUENTIAL !== "1";
const skipEval = process.env.NO_EVAL === "1";
const verbose = process.env.VERBOSE === "1";

// Build EvalCheck array for the evaluator
const evalChecks: EvalCheck[] = Object.entries(profileChecks).map(([name, cfg]) => ({
  name,
  expect: cfg.expect,
  description: cfg.description,
}));

// ---------------------------------------------------------------------------
// Build runner
// ---------------------------------------------------------------------------

interface BuildResult {
  run: number;
  turns: number;
  cost: number;
  duration: number;
  exitCode: number;
  workDir: string;
}

function runBuild(n: number, workDir: string): Promise<BuildResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    let output = "";

    const child = spawn("bun", ["run", "src/test-plugin.ts", prompt], {
      cwd: evalsRoot,
      env: {
        ...process.env,
        WORK_DIR: workDir,
        ...(profileFixtures.length > 0 ? { FIXTURES: profileFixtures.join(",") } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      output += chunk;
      for (const line of chunk.split("\n")) {
        if (line.trim()) {
          process.stdout.write(chalk.dim(`[build ${n}] `) + line + "\n");
        }
      }
    });

    child.stderr.on("data", (data: Buffer) => {
      const chunk = data.toString();
      output += chunk;
      for (const line of chunk.split("\n")) {
        if (line.trim()) {
          process.stderr.write(chalk.dim(`[build ${n}] `) + chalk.red(line) + "\n");
        }
      }
    });

    child.on("close", (code) => {
      const duration = (Date.now() - start) / 1000;

      // Read structured result from .result.json (written by test-plugin.ts)
      let turns = 0;
      let cost = 0;
      try {
        const result = JSON.parse(fs.readFileSync(path.join(workDir, ".result.json"), "utf-8"));
        turns = result.turns ?? 0;
        cost = result.cost ?? 0;
      } catch {
        // Fall back to regex if .result.json missing (e.g. process crashed)
        const doneMatch = output.match(/Done.*?(\d+)\s+turns.*?\$(\d+\.\d+)/);
        turns = doneMatch ? parseInt(doneMatch[1]) : 0;
        cost = doneMatch ? parseFloat(doneMatch[2]) : 0;
      }

      resolve({ run: n, turns, cost, duration, exitCode: code ?? 1, workDir });
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(chalk.bold(`\nBatch Test: ${count} run${count > 1 ? "s" : ""}`));
  if (profileName) console.log(chalk.dim(`Profile: ${profileName}`));
  console.log(chalk.dim(`Prompt: "${prompt}"`));
  console.log(chalk.dim(`Mode: ${parallel ? "parallel" : "sequential"}`));
  console.log(chalk.dim(`Evaluator: ${skipEval ? "disabled" : `enabled (${process.env.EVAL_MODEL || "claude-sonnet-4-5-20250929"})`}`));
  console.log(chalk.dim(`Checks: ${evalChecks.map((c) => `${c.name}(${c.expect === "absent" ? "✗" : "✓"})`).join(", ")}\n`));

  // Pre-allocate work directories
  const workspacesRoot = path.resolve(evalsRoot, "workspaces/sdk");
  fs.mkdirSync(workspacesRoot, { recursive: true });
  const existing = fs.readdirSync(workspacesRoot).filter((d) => /^app-\d+$/.test(d));
  const base =
    existing.reduce((max, d) => Math.max(max, parseInt(d.split("-")[1])), 0) + 1;

  const workDirs: string[] = [];
  for (let i = 0; i < count; i++) {
    const dir = path.join(workspacesRoot, `app-${base + i}`);
    fs.mkdirSync(dir);
    workDirs.push(dir);
  }

  // -------------------------------------------------------------------------
  // Phase 1: Build
  // -------------------------------------------------------------------------
  console.log(chalk.bold(`\n--- Phase 1: Build (${count} instance${count > 1 ? "s" : ""}) ---\n`));

  const builds: BuildResult[] = [];
  if (parallel) {
    const promises = workDirs.map((dir, i) => runBuild(i + 1, dir));
    builds.push(...(await Promise.all(promises)));
  } else {
    for (let i = 0; i < count; i++) {
      console.log(chalk.cyan(`\n${"=".repeat(50)}`));
      console.log(chalk.cyan(`  Build ${i + 1} of ${count}`));
      console.log(chalk.cyan(`${"=".repeat(50)}\n`));
      builds.push(await runBuild(i + 1, workDirs[i]));
    }
  }

  // Quick build summary
  const buildCost = builds.reduce((s, b) => s + b.cost, 0);
  const buildTime = builds.reduce((s, b) => s + b.duration, 0);
  const buildFails = builds.filter((b) => b.exitCode !== 0).length;
  console.log(`\n${chalk.dim(`Builds complete: ${builds.length - buildFails}/${builds.length} ok | $${buildCost.toFixed(4)} | ${buildTime.toFixed(0)}s`)}`);

  if (skipEval) {
    console.log(chalk.dim("\nEvaluator skipped (NO_EVAL=1). Run without NO_EVAL to evaluate workspaces.\n"));
    return;
  }

  // -------------------------------------------------------------------------
  // Phase 2: Evaluate
  // -------------------------------------------------------------------------
  console.log(chalk.bold(`\n--- Phase 2: Evaluate (${builds.length} workspace${builds.length > 1 ? "s" : ""}) ---\n`));

  const evalResults: { run: number; eval: EvalResult }[] = [];

  // Evaluate in parallel — evaluator reads .transcript.json saved by the harness
  const evalPromises = builds.map(async (build) => {
    console.log(chalk.magenta(`[eval ${build.run}] Evaluating ${path.basename(build.workDir)}...`));

    const result = await evaluate(build.workDir, evalChecks, {
      model: process.env.EVAL_MODEL || process.env.CLAUDE_MODEL,
      originalPrompt: prompt,
      verbose,
    });

    console.log(chalk.magenta(`[eval ${build.run}] Done ($${result.cost.toFixed(4)}, ${result.turns} turns)`));
    return { run: build.run, eval: result };
  });

  evalResults.push(...(await Promise.all(evalPromises)));
  evalResults.sort((a, b) => a.run - b.run);

  const evalCost = evalResults.reduce((s, r) => s + r.eval.cost, 0);

  // -------------------------------------------------------------------------
  // Scorecard — single table with per-run results + failure reasoning
  // -------------------------------------------------------------------------

  // Build per-check, per-run lookup with reasoning
  const perRun: Record<string, Record<number, { pass: boolean; confidence: string; reasoning: string }>> = {};
  const checkMeta: Record<string, { expect: string }> = {};
  for (const { run, eval: ev } of evalResults) {
    for (const cr of ev.checks) {
      if (!perRun[cr.name]) perRun[cr.name] = {};
      if (!checkMeta[cr.name]) checkMeta[cr.name] = { expect: cr.expect };
      perRun[cr.name][run] = { pass: cr.pass, confidence: cr.confidence, reasoning: cr.reasoning };
    }
  }

  const checkNames = Object.keys(perRun);
  const runNumbers = evalResults.map((r) => r.run).sort((a, b) => a - b);

  // Aggregate pass counts
  const aggregated: Record<string, { passed: number; total: number }> = {};
  for (const name of checkNames) {
    aggregated[name] = { passed: 0, total: 0 };
    for (const run of runNumbers) {
      if (perRun[name][run]) {
        aggregated[name].total++;
        if (perRun[name][run].pass) aggregated[name].passed++;
      }
    }
  }

  const totalPassed = Object.values(aggregated).filter((a) => a.passed === a.total && a.total > 0).length;
  const runColCount = runNumbers.length;
  const totalCols = 2 + runColCount + 1; // Check, Expect, Run 1..N, Result

  // Build summary line
  const buildSummary = builds
    .map((b) => `${path.basename(b.workDir)}: ${b.turns}t $${b.cost.toFixed(2)} ${b.duration.toFixed(0)}s`)
    .join(chalk.dim(" | "));

  console.log(`\n${chalk.bold("=".repeat(70))}`);
  console.log(chalk.bold(`  Scorecard: ${totalPassed}/${checkNames.length} checks passed across ${count} runs`));
  if (profileName) console.log(chalk.dim(`  Profile: ${profileName}`));
  console.log(chalk.dim(`  Builds: ${buildSummary}`));
  console.log(chalk.bold("=".repeat(70)));

  const scorecardTable = new Table({
    style: { head: ["dim"], border: ["dim"], compact: true },
    wordWrap: true,
  });

  // Header
  scorecardTable.push([
    { content: chalk.dim("Check"), hAlign: "left" as const },
    { content: chalk.dim("Expect"), hAlign: "left" as const },
    ...runNumbers.map((r) => ({ content: chalk.dim(`Run ${r}`), hAlign: "center" as const })),
    { content: chalk.dim("Result"), hAlign: "left" as const },
  ]);

  for (const name of checkNames) {
    const meta = checkMeta[name];
    const agg = aggregated[name];
    const allPassed = agg.passed === agg.total && agg.total > 0;

    const expectLabel = meta.expect === "absent" ? chalk.yellow("absent") : "present";

    const runCells = runNumbers.map((r) => {
      const cell = perRun[name]?.[r];
      if (!cell) return { content: chalk.dim("—"), hAlign: "center" as const };
      const label = cell.pass ? chalk.green("PASS") : chalk.red("FAIL");
      const conf = cell.confidence !== "high" ? chalk.dim("*") : "";
      return { content: label + conf, hAlign: "center" as const };
    });

    const resultLabel = allPassed ? chalk.green("PASS") : chalk.red("FAIL");
    const rate = chalk.dim(`(${agg.passed}/${agg.total})`);

    scorecardTable.push([name, expectLabel, ...runCells, `${resultLabel} ${rate}`]);

    // Show failure reasoning below the row
    if (!allPassed) {
      const failReasons = runNumbers
        .filter((r) => perRun[name]?.[r] && !perRun[name][r].pass)
        .map((r) => chalk.dim(`  Run ${r}: ${perRun[name][r].reasoning}`))
        .join("\n");
      scorecardTable.push([{ colSpan: totalCols, content: failReasons }]);
    }
  }

  console.log(scorecardTable.toString());

  // Per-run summaries (one line each)
  const summaries = evalResults.filter((r) => r.eval.summary);
  if (summaries.length > 0) {
    console.log("");
    for (const { run, eval: ev } of summaries) {
      console.log(chalk.dim(`  Run ${run}: ${ev.summary}`));
    }
  }

  const totalCost = buildCost + evalCost;
  console.log(chalk.dim(`\nBuild cost: $${buildCost.toFixed(4)} | Eval cost: $${evalCost.toFixed(4)} | Total: $${totalCost.toFixed(4)}`));
  console.log(chalk.dim(`Workspaces: ${workDirs.map((d) => path.basename(d)).join(", ")}\n`));
}

main().catch((err) => {
  console.error(chalk.red("Error:"), err);
  process.exit(1);
});
