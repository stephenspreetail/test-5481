import { query } from "@anthropic-ai/claude-agent-sdk";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginPath = path.resolve(__dirname, "../../kova-plugin");
const workspacesRoot = path.resolve(__dirname, "../workspaces/sdk");
const fixturesRoot = path.resolve(__dirname, "../fixtures");

// Resolve work directory — accept override from WORK_DIR env (used by batch runner)
function resolveWorkDir(): string {
  if (process.env.WORK_DIR) {
    const dir = path.resolve(process.env.WORK_DIR);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  // Find next app-N directory
  fs.mkdirSync(workspacesRoot, { recursive: true });
  const existing = fs.readdirSync(workspacesRoot).filter((d) => /^app-\d+$/.test(d));
  const next =
    existing.reduce((max, d) => Math.max(max, parseInt(d.split("-")[1])), 0) +
    1;
  const dir = path.join(workspacesRoot, `app-${next}`);
  fs.mkdirSync(dir);
  return dir;
}

const workDir = resolveWorkDir();

// Copy fixture files into the workspace if FIXTURES env var is set (comma-separated filenames)
// Fixtures live in evals/fixtures/ and are copied to the workspace root.
if (process.env.FIXTURES) {
  const fixtures = process.env.FIXTURES.split(",").map((f) => f.trim()).filter(Boolean);
  for (const fixture of fixtures) {
    const src = path.join(fixturesRoot, fixture);
    const dst = path.join(workDir, fixture);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    } else {
      console.error(`Warning: fixture "${fixture}" not found at ${src}`);
    }
  }
}

const verbose = process.env.VERBOSE === "1";
const prompt = process.argv.slice(2).join(" ");
if (!prompt) {
  console.error("Usage: bun run sdk <prompt>");
  console.error('  e.g. bun run sdk "Build a hello world app"');
  console.error("  Set VERBOSE=1 for raw message logging");
  process.exit(1);
}

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

// Allowed paths: workspace + plugin (read-only for templates) + /tmp
const allowedPrefixes = [workDir, pluginPath, "/tmp"];

function isAllowedPath(p: string): boolean {
  const resolved = path.resolve(workDir, p);
  return allowedPrefixes.some((prefix) => resolved.startsWith(prefix));
}

async function main() {
  if (verbose) {
    console.log(`${dim("Plugin:")} ${pluginPath}`);
    console.log(`${dim("Working dir:")} ${workDir}`);
    console.log(`${dim("Prompt:")} ${prompt}\n`);
  } else {
    console.log(dim(`${path.basename(workDir)} — "${prompt.slice(0, 60)}${prompt.length > 60 ? "..." : ""}"`));
  }

  const handled = new Set(["system", "assistant", "user", "result"]);

  // Track pending tool calls so we can map results back to tool names
  const pendingTools: { name: string; detail: string }[] = [];

  // Capture full conversation transcript for the evaluator
  const transcript: any[] = [];

  for await (const message of query({
    prompt,
    options: {
      plugins: [{ type: "local", path: pluginPath }],
      cwd: workDir,
      maxTurns: 50,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      model: process.env.CLAUDE_MODEL,
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append:
          "Your working directory is an empty workspace. " +
          "Plugin context (identity, skills, output styles) is already injected into this session — " +
          "do not read plugin files from disk.",
      },
      // PreToolUse hooks fire BEFORE permissionMode, so they work with bypassPermissions.
      // canUseTool does NOT — it's skipped entirely when bypassPermissions is set.
      hooks: {
        PreToolUse: [
          {
            hooks: [
              async (input) => {
                const { tool_name, tool_input } = input as {
                  tool_name: string;
                  tool_input: Record<string, unknown>;
                };

                // Extract all path-like fields from the tool input
                const paths = [
                  tool_input.file_path,
                  tool_input.path,
                  tool_input.notebook_path,
                ].filter((v): v is string => typeof v === "string");

                // Check if any path is outside allowed prefixes
                for (const p of paths) {
                  if (!isAllowedPath(p)) {
                    return {
                      hookSpecificOutput: {
                        hookEventName: "PreToolUse" as const,
                        permissionDecision: "deny" as const,
                        permissionDecisionReason: `Blocked: ${tool_name} path "${p}" is outside the workspace and plugin.`,
                      },
                    };
                  }
                }

                // For Bash, check if the command references absolute paths outside allowed prefixes
                if (tool_name === "Bash" && typeof tool_input.command === "string") {
                  const absolutePathRegex = /(?:^|\s)(\/[^\s]+)/g;
                  let match;
                  while ((match = absolutePathRegex.exec(tool_input.command)) !== null) {
                    if (!allowedPrefixes.some((prefix) => match![1].startsWith(prefix))) {
                      return {
                        hookSpecificOutput: {
                          hookEventName: "PreToolUse" as const,
                          permissionDecision: "deny" as const,
                          permissionDecisionReason: `Blocked: Bash command references path "${match[1]}" outside the workspace and plugin.`,
                        },
                      };
                    }
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
        // Route Agent SDK through Azure AI Foundry when configured
        ...(process.env.ANTHROPIC_FOUNDRY_RESOURCE
          ? {
              CLAUDE_CODE_USE_FOUNDRY: "1",
              ANTHROPIC_FOUNDRY_RESOURCE: process.env.ANTHROPIC_FOUNDRY_RESOURCE,
              // Only pass API key if explicitly set — omitting it lets the SDK
              // fall back to az login / DefaultAzureCredential
              ...(process.env.ANTHROPIC_FOUNDRY_API_KEY
                ? { ANTHROPIC_FOUNDRY_API_KEY: process.env.ANTHROPIC_FOUNDRY_API_KEY }
                : {}),
            }
          : {}),
      },
    },
  })) {
    // Capture every message for the transcript
    transcript.push(message);

    // Verbose: dump every message raw
    if (verbose) {
      console.log(dim(`\n[msg] type=${message.type} subtype=${"subtype" in message ? (message as any).subtype : "-"}`));
      console.log(dim(JSON.stringify(message, null, 2).slice(0, 2000)));
      continue;
    }

    // Session init
    if (message.type === "system" && message.subtype === "init") {
      const init = message as any;
      if (verbose) {
        console.log(dim(`--- Session started ---`));
        if (init.model) console.log(dim(`Model: ${init.model}`));
        if (init.plugins?.length) {
          console.log(dim(`Plugins: ${init.plugins.map((p: any) => p.name || p.path).join(", ")}`));
        }
        if (init.skills?.length) {
          console.log(dim(`Skills: ${init.skills.filter(Boolean).join(", ")}`));
        }
        if (init.slash_commands?.length) {
          console.log(dim(`Commands: ${init.slash_commands.filter(Boolean).join(", ")}`));
        }
        if (init.output_style) {
          console.log(dim(`Output style: ${init.output_style}`));
        }
        console.log(dim("Waiting for response...\n"));
      } else {
        const model = init.model || "unknown";
        const pluginNames = init.plugins?.map((p: any) => p.name || "plugin").join(", ") || "none";
        const skillCount = init.skills?.length || 0;
        console.log(dim(`Session started — ${model}, plugins: ${pluginNames}, ${skillCount} skills`));
      }
    }

    // Assistant message — text, thinking, and tool calls
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === "thinking" && "thinking" in block) {
          console.log(dim(`\n💭 ${(block as any).thinking}\n`));
        } else if (block.type === "text" && "text" in block) {
          process.stdout.write(block.text);
        } else if (block.type === "tool_use" && "name" in block) {
          const tool = block as any;
          // Build a short detail string for result mapping
          let detail = "";
          if (tool.input) {
            if (tool.input.skill) detail = tool.input.skill;
            else if (tool.input.command) detail = tool.input.command.slice(0, 80);
            else if (tool.input.file_path) detail = tool.input.file_path;
            else if (tool.input.pattern) detail = tool.input.pattern;
            else if (tool.input.prompt) detail = String(tool.input.prompt).slice(0, 80);
          }
          pendingTools.push({ name: tool.name, detail });

          console.log(cyan(`\n[tool: ${tool.name}]`));
          if (tool.input) {
            if (tool.input.skill) console.log(dim(`  skill: ${tool.input.skill}`));
            if (tool.input.file_path) console.log(dim(`  file: ${tool.input.file_path}`));
            if (tool.input.command) console.log(dim(`  cmd: ${tool.input.command}`));
            if (tool.input.pattern) console.log(dim(`  pattern: ${tool.input.pattern}`));
            if (tool.input.prompt) console.log(dim(`  prompt: ${String(tool.input.prompt).slice(0, 120)}`));
          }
        }
      }
    }

    // Tool results — map back to the tool that produced them
    if (message.type === "user" && message.message?.content) {
      for (const block of (message.message.content as any[])) {
        if (block.type === "tool_result") {
          const pending = pendingTools.shift();
          const label = pending
            ? `${pending.name}${pending.detail ? ` (${pending.detail})` : ""}`
            : "unknown";

          if (block.is_error) {
            const errMsg = typeof block.content === "string"
              ? block.content.slice(0, 150)
              : Array.isArray(block.content)
                ? block.content.map((c: any) => c.text || "").join("").slice(0, 150)
                : "";
            console.log(red(`  ✗ ${label}`));
            if (errMsg) console.log(red(`    ${errMsg}`));
          } else {
            console.log(green(`  ✓ ${label}`));
          }
        }
      }
    }

    // Final result — write structured .result.json for batch runner
    if (message.type === "result") {
      const result: any = {
        status: message.subtype,
        turns: 0,
        cost: 0,
      };

      if (message.subtype === "success") {
        result.turns = message.num_turns;
        result.cost = message.total_cost_usd;
        console.log("\n" + dim("---"));
        console.log(green(`Done`) + dim(` (${message.num_turns} turns, $${message.total_cost_usd.toFixed(4)})`));
      } else {
        console.log("\n" + dim("---"));
        console.error(red(`Stopped: ${message.subtype}`));
        if ((message as any).errors?.length) {
          result.errors = (message as any).errors;
          for (const err of (message as any).errors) {
            console.error(red(`  ${err}`));
          }
        }
      }

      const resultPath = path.join(workDir, ".result.json");
      fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
    }

    // Catch-all: log message types we're not explicitly handling
    if (!handled.has(message.type)) {
      const msg = message as any;
      console.log(dim(`[${message.type}${msg.subtype ? `:${msg.subtype}` : ""}]`));
    }
  }

  // Save full conversation transcript for the evaluator
  const transcriptPath = path.join(workDir, ".transcript.json");
  fs.writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));
  console.log(dim(`Transcript saved: ${transcriptPath}`));
}

main().catch((err) => {
  console.error(red("Error:"), err);
  process.exit(1);
});
