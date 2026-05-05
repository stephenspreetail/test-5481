/**
 * SQLite-backed reference implementation of IssueProvider.
 *
 * Single-file store, suitable for local development and the admin UI.
 * Schema is created on first connect; no migration framework — additive
 * changes only.
 */
import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import {
  type Issue,
  type IssueId,
  type IssueProvider,
  type IssueUpdate,
  type ListIssuesOptions,
  type ListIssuesResult,
  type NewIssue,
  IssueNotFoundError,
} from '@archon/issues';

interface IssueRow {
  id: string;
  key: string | null;
  title: string;
  body: string;
  state: string;
  kind: string;
  parent_id: string | null;
  labels_json: string;
  extra_json: string | null;
  url: string | null;
  created_at: string;
  updated_at: string;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS issues (
    id          TEXT PRIMARY KEY,
    key         TEXT,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL DEFAULT '',
    state       TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
    kind        TEXT NOT NULL DEFAULT 'issue' CHECK (kind IN ('epic','story','issue','task','bug')),
    parent_id   TEXT,  -- free-form: local issue id OR external key like "PROJ-123"
    labels_json TEXT NOT NULL DEFAULT '[]',
    extra_json  TEXT,
    url         TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_issues_parent ON issues(parent_id);
  CREATE INDEX IF NOT EXISTS idx_issues_state  ON issues(state);
  CREATE INDEX IF NOT EXISTS idx_issues_kind   ON issues(kind);
`;

function rowToIssue(row: IssueRow): Issue {
  return {
    id: row.id,
    key: row.key ?? undefined,
    title: row.title,
    body: row.body,
    state: row.state as Issue['state'],
    kind: row.kind as Issue['kind'],
    parentId: row.parent_id ?? undefined,
    labels: JSON.parse(row.labels_json) as string[],
    extra: row.extra_json ? (JSON.parse(row.extra_json) as Record<string, unknown>) : undefined,
    url: row.url ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SqliteIssueProviderOptions {
  /** Path to the SQLite file. Use ':memory:' for tests. */
  path: string;
}

export class SqliteIssueProvider implements IssueProvider {
  readonly providerType = 'sqlite';
  private db: Database;

  constructor(options: SqliteIssueProviderOptions) {
    if (options.path !== ':memory:') {
      const dir = dirname(options.path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(options.path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
  }

  /** Close the underlying SQLite connection. Not part of IssueProvider. */
  dispose(): void {
    this.db.close();
  }

  async list(options: ListIssuesOptions = {}): Promise<ListIssuesResult> {
    const where: string[] = [];
    const params: Record<string, string> = {};
    const state = options.state ?? 'all';
    if (state !== 'all') {
      where.push('state = $state');
      params.$state = state;
    }
    if (options.kind) {
      where.push('kind = $kind');
      params.$kind = options.kind;
    }
    if (options.parentId !== undefined) {
      where.push('parent_id = $parent');
      params.$parent = options.parentId;
    }
    if (options.query) {
      where.push('(title LIKE $q OR body LIKE $q)');
      params.$q = `%${options.query}%`;
    }
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    const cursor = options.cursor;
    if (cursor) {
      where.push('updated_at < $cursor');
      params.$cursor = cursor;
    }
    const sql = `
      SELECT * FROM issues
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY updated_at DESC
      LIMIT ${limit + 1}
    `;
    const rows = this.db.query(sql).all(params) as IssueRow[];
    const items = rows.slice(0, limit).map(rowToIssue);
    const nextCursor = rows.length > limit ? items[items.length - 1].updatedAt : undefined;
    return { items, nextCursor };
  }

  async get(id: IssueId): Promise<Issue | null> {
    const row = this.db.query('SELECT * FROM issues WHERE id = $id').get({ $id: id }) as
      | IssueRow
      | undefined;
    return row ? rowToIssue(row) : null;
  }

  async create(input: NewIssue): Promise<Issue> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    this.db
      .query(
        `INSERT INTO issues (id, title, body, state, kind, parent_id, labels_json, extra_json, created_at, updated_at)
         VALUES ($id, $title, $body, 'open', $kind, $parent, $labels, $extra, $now, $now)`
      )
      .run({
        $id: id,
        $title: input.title,
        $body: input.body ?? '',
        $kind: input.kind ?? 'issue',
        $parent: input.parentId ?? null,
        $labels: JSON.stringify(input.labels ?? []),
        $extra: input.extra ? JSON.stringify(input.extra) : null,
        $now: now,
      });
    const created = await this.get(id);
    if (!created) throw new Error('SQLite insert succeeded but row not found');
    return created;
  }

  async update(id: IssueId, patch: IssueUpdate): Promise<Issue> {
    const existing = await this.get(id);
    if (!existing) throw new IssueNotFoundError(id, this.providerType);
    const next = {
      title: patch.title ?? existing.title,
      body: patch.body ?? existing.body,
      state: patch.state ?? existing.state,
      labels: patch.labels ?? existing.labels,
      extra: patch.extra ?? existing.extra,
    };
    const now = new Date().toISOString();
    this.db
      .query(
        `UPDATE issues SET title=$title, body=$body, state=$state,
           labels_json=$labels, extra_json=$extra, updated_at=$now
         WHERE id=$id`
      )
      .run({
        $id: id,
        $title: next.title,
        $body: next.body,
        $state: next.state,
        $labels: JSON.stringify(next.labels),
        $extra: next.extra ? JSON.stringify(next.extra) : null,
        $now: now,
      });
    const updated = await this.get(id);
    if (!updated) throw new IssueNotFoundError(id, this.providerType);
    return updated;
  }

  async close(id: IssueId): Promise<Issue> {
    return this.update(id, { state: 'closed' });
  }

  async reopen(id: IssueId): Promise<Issue> {
    return this.update(id, { state: 'open' });
  }
}
