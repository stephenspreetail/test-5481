/**
 * @archon/issues
 *
 * Forge-agnostic interface for issue tracking. Archon was originally built
 * around GitHub Issues; this package decouples the workflow engine from any
 * one provider so we can plug in:
 *
 *   - SQLite (local store; the reference implementation in @archon/issues-sqlite)
 *   - GitLab Issues (@archon/issues-gitlab)
 *   - Jira read-only (epics + stories via JQL; @archon/issues-jira)
 *
 * Design notes
 *
 *   - IDs are opaque strings. Numeric forges (GitHub/GitLab) stringify them.
 *   - `parentId` lets us model story → epic links uniformly. Jira uses its
 *     real epic-link / parent field; SQLite stores it directly; GitLab uses
 *     epic refs where available, otherwise label-based linkage.
 *   - The interface is intentionally narrow. Anything provider-specific
 *     (transitions, sprint boards, custom fields) lives behind extension
 *     methods on the concrete adapter.
 */

export type IssueId = string;

export type IssueState = 'open' | 'closed';

/** A coarse classification used by the admin UI and by Archon's planning workflows. */
export type IssueKind = 'epic' | 'story' | 'issue' | 'task' | 'bug';

export interface Issue {
  id: IssueId;
  /** Provider-native key, when distinct from id (e.g. Jira "PROJ-123"). */
  key?: string;
  title: string;
  body: string;
  state: IssueState;
  kind: IssueKind;
  /** Parent epic / story id, if any. */
  parentId?: IssueId;
  labels: string[];
  /** Free-form provider-specific extras (sprint, story points, etc.). */
  extra?: Record<string, unknown>;
  url?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewIssue {
  title: string;
  body?: string;
  kind?: IssueKind;
  parentId?: IssueId;
  labels?: string[];
  extra?: Record<string, unknown>;
}

export interface IssueUpdate {
  title?: string;
  body?: string;
  state?: IssueState;
  labels?: string[];
  extra?: Record<string, unknown>;
}

export interface ListIssuesOptions {
  state?: IssueState | 'all';
  kind?: IssueKind;
  parentId?: IssueId;
  /** Free-form text search; provider may interpret as title/body match. */
  query?: string;
  limit?: number;
  cursor?: string;
}

export interface ListIssuesResult {
  items: Issue[];
  nextCursor?: string;
}

/**
 * The smallest surface every backend must provide. Read-only providers (Jira,
 * for instance, in the admin app) can throw NotSupportedError on writes.
 */
export interface IssueProvider {
  /** Provider-type identifier, e.g. 'sqlite' | 'gitlab' | 'jira'. */
  readonly providerType: string;

  list(options?: ListIssuesOptions): Promise<ListIssuesResult>;
  get(id: IssueId): Promise<Issue | null>;
  create(input: NewIssue): Promise<Issue>;
  update(id: IssueId, patch: IssueUpdate): Promise<Issue>;
  close(id: IssueId): Promise<Issue>;
  reopen(id: IssueId): Promise<Issue>;
}

/**
 * Read-only providers throw this from mutation methods. The admin UI catches
 * it and disables the corresponding controls.
 */
export class NotSupportedError extends Error {
  constructor(operation: string, providerType: string) {
    super(`${operation} is not supported by provider '${providerType}'`);
    this.name = 'NotSupportedError';
  }
}

/** Thrown when a provider can't find the requested issue. */
export class IssueNotFoundError extends Error {
  constructor(id: IssueId, providerType: string) {
    super(`Issue '${id}' not found in provider '${providerType}'`);
    this.name = 'IssueNotFoundError';
  }
}
