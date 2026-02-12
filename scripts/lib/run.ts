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

/** Normalize line endings to \r\n for Windows console output. */
function normalizeEol(text: string): string {
  return text.replace(/\r?\n/g, "\r\n");
}

/**
 * Execute a command, emit output to console, throw on non-zero exit.
 *
 * On Windows we pipe stdout/stderr and re-emit with \r\n line endings.
 * Go-based CLIs (k3d, istioctl) enable Virtual Terminal Processing on
 * inherited console handles and never restore the original mode, which
 * turns every subsequent bare \n into a line-feed-only (no carriage
 * return). Piping isolates our console handle from those changes.
 */
export function run(cmd: string, args: string[]): void {
  const isWin = process.platform === "win32";
  const stdio = isWin ? "pipe" : "inherit";
  const result = Bun.spawnSync([cmd, ...args], {
    stdout: stdio,
    stderr: stdio,
    env: process.env,
  });
  if (isWin) {
    if (result.stdout.length > 0) {
      process.stdout.write(normalizeEol(result.stdout.toString()));
    }
    if (result.stderr.length > 0) {
      process.stderr.write(normalizeEol(result.stderr.toString()));
    }
  }
  if (result.exitCode !== 0) {
    throw new Error(`Command failed (exit ${result.exitCode}): ${cmd} ${args.join(" ")}`);
  }
}

/** Execute a command, capture and return stdout (trimmed), throw on non-zero exit. */
export function capture(cmd: string, args: string[]): string {
  const isWin = process.platform === "win32";
  const result = Bun.spawnSync([cmd, ...args], {
    stdout: "pipe",
    stderr: isWin ? "pipe" : "inherit",
    env: process.env,
  });
  if (isWin && result.stderr.length > 0) {
    process.stderr.write(normalizeEol(result.stderr.toString()));
  }
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
  const isWin = process.platform === "win32";
  const stdio = isWin ? "pipe" : "inherit";
  const args = context ? ["--context", context, "apply", "-f", "-"] : ["apply", "-f", "-"];
  const result = Bun.spawnSync(["kubectl", ...args], {
    stdin: Buffer.from(yaml),
    stdout: stdio,
    stderr: stdio,
    env: process.env,
  });
  if (isWin) {
    if (result.stdout.length > 0) {
      process.stdout.write(normalizeEol(result.stdout.toString()));
    }
    if (result.stderr.length > 0) {
      process.stderr.write(normalizeEol(result.stderr.toString()));
    }
  }
  if (result.exitCode !== 0) {
    throw new Error(`kubectl apply failed (exit ${result.exitCode})`);
  }
}

/**
 * Write a line to stdout with \r\n.
 *
 * On Windows, Go-based CLIs (k3d, istioctl) enable Virtual Terminal
 * Processing on the console handle. After they exit the flag stays set,
 * which makes bare \n a line-feed-only (no carriage return). Using \r\n
 * ensures the cursor always returns to column 0.
 */
export function writeln(msg = ""): void {
  process.stdout.write(`${msg}\r\n`);
}

/** Colored console output helpers. */
export const log = {
  info(msg: string): void {
    writeln(`${BLUE}${msg}${RESET}`);
  },
  success(msg: string): void {
    writeln(`${GREEN}${msg}${RESET}`);
  },
  warn(msg: string): void {
    writeln(`${YELLOW}${msg}${RESET}`);
  },
  error(msg: string): void {
    process.stderr.write(`${RED}${msg}${RESET}\r\n`);
  },
  step(msg: string): void {
    writeln(`${CYAN}${BOLD}${msg}${RESET}`);
  },
  banner(msg: string): void {
    writeln(`${BOLD}${msg}${RESET}`);
  },
};
