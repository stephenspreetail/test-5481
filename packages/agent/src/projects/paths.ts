/**
 * XDG-compliant path utilities for Kova Agent
 *
 * Default locations:
 *   Config: ~/.config/kova/
 *   Data:   ~/.local/share/kova/
 *   Projects: ~/.local/share/kova/projects/
 *
 * Override via environment variables:
 *   KOVA_CONFIG_DIR - Config directory
 *   KOVA_DATA_DIR - Data directory
 *   KOVA_PROJECTS_DIR - Projects directory
 */

import * as path from "node:path";
import * as os from "node:os";

/**
 * Get the home directory
 */
function getHomeDir(): string {
  return os.homedir();
}

/**
 * Check if running on Windows
 */
function isWindows(): boolean {
  return process.platform === "win32";
}

/**
 * Get the XDG config directory
 * Linux/Mac: ~/.config
 * Windows: %LOCALAPPDATA%
 */
function getXdgConfigHome(): string {
  if (process.env.XDG_CONFIG_HOME) {
    return process.env.XDG_CONFIG_HOME;
  }
  if (isWindows()) {
    return process.env.LOCALAPPDATA || path.join(getHomeDir(), "AppData", "Local");
  }
  return path.join(getHomeDir(), ".config");
}

/**
 * Get the XDG data directory
 * Linux/Mac: ~/.local/share
 * Windows: %LOCALAPPDATA%
 */
function getXdgDataHome(): string {
  if (process.env.XDG_DATA_HOME) {
    return process.env.XDG_DATA_HOME;
  }
  if (isWindows()) {
    return process.env.LOCALAPPDATA || path.join(getHomeDir(), "AppData", "Local");
  }
  return path.join(getHomeDir(), ".local", "share");
}

/**
 * Get the Kova config directory
 */
export function getConfigDir(): string {
  if (process.env.KOVA_CONFIG_DIR) {
    return process.env.KOVA_CONFIG_DIR;
  }
  return path.join(getXdgConfigHome(), "kova");
}

/**
 * Get the Kova data directory
 */
export function getDataDir(): string {
  if (process.env.KOVA_DATA_DIR) {
    return process.env.KOVA_DATA_DIR;
  }
  return path.join(getXdgDataHome(), "kova");
}

/**
 * Get the Kova projects directory
 */
export function getProjectsDir(): string {
  if (process.env.KOVA_PROJECTS_DIR) {
    return process.env.KOVA_PROJECTS_DIR;
  }
  return path.join(getDataDir(), "projects");
}

/**
 * Get the path to a specific project
 */
export function getProjectPath(projectName: string): string {
  return path.join(getProjectsDir(), projectName);
}

/**
 * Get the .kova directory path for a project
 */
export function getProjectKovaPath(projectName: string): string {
  return path.join(getProjectPath(projectName), ".kova");
}

/**
 * Get the project.json path for a project
 */
export function getProjectMetadataPath(projectName: string): string {
  return path.join(getProjectKovaPath(projectName), "project.json");
}

/**
 * Get the history.json path for a project
 */
export function getProjectHistoryPath(projectName: string): string {
  return path.join(getProjectKovaPath(projectName), "history.json");
}

/**
 * Get the global settings file path
 */
export function getSettingsPath(): string {
  return path.join(getConfigDir(), "settings.json");
}

/**
 * Validate a project name
 * - Must be 1-100 characters
 * - Can contain alphanumeric, dash, underscore
 * - Cannot start with a dash
 */
export function validateProjectName(name: string): { valid: boolean; error?: string } {
  if (!name || name.length === 0) {
    return { valid: false, error: "Project name cannot be empty" };
  }
  if (name.length > 100) {
    return { valid: false, error: "Project name must be 100 characters or less" };
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) {
    return {
      valid: false,
      error: "Project name must start with alphanumeric and contain only alphanumeric, dash, or underscore",
    };
  }
  return { valid: true };
}

/**
 * Sanitize a project name to be valid
 */
export function sanitizeProjectName(name: string): string {
  // Replace invalid characters with dashes
  let sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "-");
  // Remove leading dashes
  sanitized = sanitized.replace(/^-+/, "");
  // Collapse multiple dashes
  sanitized = sanitized.replace(/-+/g, "-");
  // Truncate to 100 characters
  sanitized = sanitized.slice(0, 100);
  // If empty after sanitization, use default
  if (!sanitized) {
    sanitized = "project";
  }
  return sanitized;
}
