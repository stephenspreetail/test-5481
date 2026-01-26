/**
 * Project types for Kova Agent
 */

/**
 * Project metadata stored in .kova/project.json
 */
export interface ProjectMetadata {
  /** Unique project ID */
  id: string;
  /** Human-readable project name */
  name: string;
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  /** Last access timestamp (ISO 8601) */
  lastAccessedAt: string;
  /** Optional template used to create the project */
  template?: string;
  /** Optional project description */
  description?: string;
  /** Optional tags for organization */
  tags?: string[];
}

/**
 * Full project with metadata and path
 */
export interface Project {
  /** Project metadata */
  metadata: ProjectMetadata;
  /** Absolute path to project directory */
  path: string;
  /** Path to .kova directory */
  kovaPath: string;
}

/**
 * Session metadata for project history
 */
export interface SessionMetadata {
  /** Session ID from Claude Agent SDK */
  sessionId: string;
  /** Session start timestamp */
  startedAt: string;
  /** Session end timestamp */
  endedAt?: string;
  /** Number of messages in session */
  messageCount: number;
  /** Brief summary of what was accomplished */
  summary?: string;
}

/**
 * Project history stored in .kova/history.json
 */
export interface ProjectHistory {
  /** List of sessions for this project */
  sessions: SessionMetadata[];
}

/**
 * Options for creating a project
 */
export interface CreateProjectOptions {
  /** Project name */
  name: string;
  /** Template to use (default: none) */
  template?: string;
  /** Project description */
  description?: string;
  /** Initial tags */
  tags?: string[];
  /** Custom path (overrides default XDG location) */
  customPath?: string;
}

/**
 * Options for listing projects
 */
export interface ListProjectsOptions {
  /** Sort by field */
  sortBy?: "name" | "createdAt" | "lastAccessedAt";
  /** Sort direction */
  sortDirection?: "asc" | "desc";
  /** Filter by tags */
  tags?: string[];
  /** Search in name/description */
  search?: string;
}
