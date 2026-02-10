/**
 * Shared utilities for local dev scripts.
 * Uses Bun.spawnSync for cross-platform subprocess execution.
 */

// ANSI color codes
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";

/** Execute a command, stream output to console, throw on non-zero exit. */
export function run(cmd: string, args: string[]): void {
  const result = Bun.spawnSync([cmd, ...args], {
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  if (result.exitCode !== 0) {
    throw new Error(`Command failed (exit ${result.exitCode}): ${cmd} ${args.join(" ")}`);
  }
}

/** Execute a command, capture and return stdout (trimmed), throw on non-zero exit. */
export function capture(cmd: string, args: string[]): string {
  const result = Bun.spawnSync([cmd, ...args], {
    stdout: "pipe",
    stderr: "inherit",
    env: process.env,
  });
  if (result.exitCode !== 0) {
    throw new Error(`Command failed (exit ${result.exitCode}): ${cmd} ${args.join(" ")}`);
  }
  return result.stdout.toString().trim();
}

/** Execute a command, return true if exit code is 0, false otherwise (no throw). */
export function check(cmd: string, args: string[]): boolean {
  const result = Bun.spawnSync([cmd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  return result.exitCode === 0;
}

/** Check if a CLI tool is available on PATH. */
export function hasCommand(name: string): boolean {
  const cmd = process.platform === "win32" ? "where" : "which";
  return check(cmd, [name]);
}

/** Apply YAML string via stdin to kubectl. */
export function kubectlApplyStdin(yaml: string, context?: string): void {
  const args = context ? ["--context", context, "apply", "-f", "-"] : ["apply", "-f", "-"];
  const result = Bun.spawnSync(["kubectl", ...args], {
    stdin: Buffer.from(yaml),
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  if (result.exitCode !== 0) {
    throw new Error(`kubectl apply failed (exit ${result.exitCode})`);
  }
}

/** Colored console output helpers. */
export const log = {
  info(msg: string): void {
    console.log(`${BLUE}${msg}${RESET}`);
  },
  success(msg: string): void {
    console.log(`${GREEN}${msg}${RESET}`);
  },
  warn(msg: string): void {
    console.log(`${YELLOW}${msg}${RESET}`);
  },
  error(msg: string): void {
    console.error(`${RED}${msg}${RESET}`);
  },
  step(msg: string): void {
    console.log(`${CYAN}${BOLD}${msg}${RESET}`);
  },
  banner(msg: string): void {
    console.log(`${BOLD}${msg}${RESET}`);
  },
};
