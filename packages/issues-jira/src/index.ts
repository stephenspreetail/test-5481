/**
 * Jira Cloud read-only IssueProvider.
 *
 * The admin UI runs JQL queries to surface epics and stories — write paths
 * (create/update/close) are intentionally not implemented. Anything that
 * attempts to mutate throws NotSupportedError; the admin UI hides the
 * controls.
 *
 * Authentication uses Basic auth with `email:apiToken` (Jira Cloud's
 * standard PAT scheme).
 */
import {
  type Issue,
  type IssueId,
  type IssueProvider,
  type IssueUpdate,
  type ListIssuesOptions,
  type ListIssuesResult,
  type NewIssue,
  NotSupportedError,
} from '@archon/issues';

export interface JiraProviderOptions {
  /** e.g. https://your-org.atlassian.net */
  baseUrl: string;
  email: string;
  apiToken: string;
  /**
   * Default JQL when callers don't supply `query`. Useful for the admin UI
   * to scope to "epics + stories in active sprint", etc.
   */
  defaultJql?: string;
  fetchImpl?: typeof fetch;
}

interface JiraSearchResp {
  issues: JiraIssue[];
  startAt: number;
  maxResults: number;
  total: number;
}

interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description: unknown;
    issuetype: { name: string };
    status: { name: string; statusCategory?: { key: string } };
    labels: string[];
    parent?: { id: string; key: string };
    updated: string;
    created: string;
    /** Epic-link custom field — id varies per Jira instance. */
    customfield_10014?: string;
  };
}

function mapKind(name: string): Issue['kind'] {
  const n = name.toLowerCase();
  if (n === 'epic') return 'epic';
  if (n === 'story') return 'story';
  if (n === 'task' || n === 'sub-task' || n === 'subtask') return 'task';
  if (n === 'bug') return 'bug';
  return 'issue';
}

function mapState(category: string | undefined): Issue['state'] {
  // statusCategory.key is one of new/indeterminate/done.
  return category === 'done' ? 'closed' : 'open';
}

function flattenAdf(node: unknown): string {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  const n = node as { text?: string; content?: unknown[] };
  if (n.text) return n.text;
  if (Array.isArray(n.content)) return n.content.map(flattenAdf).join('');
  return '';
}

function toIssue(raw: JiraIssue, browseBase: string): Issue {
  const parentKey = raw.fields.parent?.key ?? raw.fields.customfield_10014;
  return {
    id: raw.key,
    key: raw.key,
    title: raw.fields.summary,
    body: flattenAdf(raw.fields.description),
    state: mapState(raw.fields.status?.statusCategory?.key),
    kind: mapKind(raw.fields.issuetype.name),
    parentId: parentKey,
    labels: raw.fields.labels ?? [],
    url: `${browseBase}/browse/${raw.key}`,
    createdAt: raw.fields.created,
    updatedAt: raw.fields.updated,
    extra: { jiraId: raw.id, status: raw.fields.status?.name },
  };
}

export class JiraIssueProvider implements IssueProvider {
  readonly providerType = 'jira';
  private readonly base: string;
  private readonly auth: string;
  private readonly defaultJql: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: JiraProviderOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, '');
    this.auth = 'Basic ' + Buffer.from(`${opts.email}:${opts.apiToken}`).toString('base64');
    this.defaultJql = opts.defaultJql ?? 'issuetype in (Epic, Story) ORDER BY updated DESC';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /**
   * Run an arbitrary JQL query. Used by the admin UI; not part of the
   * IssueProvider interface but exposed for convenience.
   */
  async searchJql(jql: string, startAt = 0, maxResults = 50): Promise<ListIssuesResult> {
    const params = new URLSearchParams({
      jql,
      startAt: String(startAt),
      maxResults: String(Math.min(maxResults, 100)),
      fields:
        'summary,description,issuetype,status,labels,parent,updated,created,customfield_10014',
    });
    const res = await this.fetchImpl(`${this.base}/rest/api/3/search?${params}`, {
      headers: { Authorization: this.auth, Accept: 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira search failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as JiraSearchResp;
    const items = data.issues.map(i => toIssue(i, this.base));
    const next = data.startAt + items.length;
    const nextCursor = next < data.total ? String(next) : undefined;
    return { items, nextCursor };
  }

  async list(options: ListIssuesOptions = {}): Promise<ListIssuesResult> {
    const parts: string[] = [];
    if (options.query) parts.push(options.query);
    else parts.push(this.defaultJql);
    if (options.kind) {
      const map: Record<string, string> = {
        epic: 'Epic',
        story: 'Story',
        task: 'Task',
        bug: 'Bug',
        issue: 'Task',
      };
      parts.push(`issuetype = "${map[options.kind] ?? 'Task'}"`);
    }
    if (options.state && options.state !== 'all') {
      parts.push(options.state === 'open' ? 'statusCategory != Done' : 'statusCategory = Done');
    }
    if (options.parentId) parts.push(`parent = "${options.parentId}"`);
    const jql = parts.filter(Boolean).join(' AND ');
    const startAt = options.cursor ? Number(options.cursor) : 0;
    return this.searchJql(jql, startAt, options.limit ?? 50);
  }

  async get(id: IssueId): Promise<Issue | null> {
    const res = await this.fetchImpl(`${this.base}/rest/api/3/issue/${encodeURIComponent(id)}`, {
      headers: { Authorization: this.auth, Accept: 'application/json' },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Jira get failed: ${res.status}`);
    return toIssue((await res.json()) as JiraIssue, this.base);
  }

  async create(_input: NewIssue): Promise<Issue> {
    throw new NotSupportedError('create', this.providerType);
  }

  async update(_id: IssueId, _patch: IssueUpdate): Promise<Issue> {
    throw new NotSupportedError('update', this.providerType);
  }

  async close(_id: IssueId): Promise<Issue> {
    throw new NotSupportedError('close', this.providerType);
  }

  async reopen(_id: IssueId): Promise<Issue> {
    throw new NotSupportedError('reopen', this.providerType);
  }
}
