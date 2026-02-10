// ANSI color codes
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";

type LogLevel = "info" | "pass" | "fail" | "warn" | "step";

const LEVEL_STYLES: Record<LogLevel, { color: string; label: string }> = {
  info: { color: CYAN, label: "INFO" },
  pass: { color: GREEN, label: "PASS" },
  fail: { color: RED, label: "FAIL" },
  warn: { color: YELLOW, label: "WARN" },
  step: { color: BLUE, label: "STEP" },
};

export function log(level: LogLevel, msg: string): void {
  const { color, label } = LEVEL_STYLES[level];
  const timestamp = new Date().toISOString().slice(11, 23);
  console.log(`${color}${BOLD}[${label}]${RESET} ${timestamp} ${msg}`);
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    log("fail", message);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertEq(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    log("fail", `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    throw new Error(
      `Assertion failed (${label}): expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

export function assertContains(haystack: string, needle: string, label: string): void {
  if (!haystack.includes(needle)) {
    log(
      "fail",
      `${label}: expected string to contain ${JSON.stringify(needle)}, got ${JSON.stringify(haystack.slice(0, 200))}`,
    );
    throw new Error(
      `Assertion failed (${label}): string does not contain ${JSON.stringify(needle)}`,
    );
  }
}

export function assertMatch(value: string, regex: RegExp, label: string): void {
  if (!regex.test(value)) {
    log(
      "fail",
      `${label}: expected ${JSON.stringify(value.slice(0, 200))} to match ${regex}`,
    );
    throw new Error(`Assertion failed (${label}): value does not match ${regex}`);
  }
}
