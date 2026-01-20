/**
 * Shared logging utilities with color-coded output
 * - Timestamp: Yellow
 * - Source: Green
 * - Message: Default (white/gray)
 */

// ANSI color codes
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

/**
 * Format a log message with colors
 */
function formatLog(source: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `${YELLOW}[${timestamp}]${RESET} ${GREEN}[${source}]${RESET} ${message}`;
}

/**
 * Format an error log message with colors
 */
function formatError(source: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `${YELLOW}[${timestamp}]${RESET} ${GREEN}[${source}]${RESET} ${RED}${message}${RESET}`;
}

/**
 * Create a logger for a specific source
 */
export function createLogger(source: string) {
  return {
    log: (message: string) => {
      console.log(formatLog(source, message));
    },
    error: (message: string, error?: unknown) => {
      console.error(formatError(source, message), error ?? "");
    },
    warn: (message: string) => {
      console.warn(formatLog(source, `WARN: ${message}`));
    },
  };
}

// Pre-configured loggers for common sources
export const appContainerLog = createLogger("AppContainer");
export const devServerLog = createLogger("DevServer");
export const agentLog = createLogger("Agent");
