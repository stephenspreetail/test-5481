/**
 * GitLab Issues IssueProvider implementation.
 *
 * Talks to the GitLab REST v4 API. Project is identified either by numeric
 * id or url-encoded path (e.g. 'group%2Fsub%2Fproject').
 *
 * Mapping notes
 *
 *   - GitLab numeric `iid` is exposed as both `id` and `key` so callers can
 *     route by either. (We keep `id` numeric-as-string for compatibility
 *     with the IssueProvider signature.)
 *   - GitLab issue type maps to IssueKind: 'incident' -> 'bug',
 *     'task' -> 'task', otherwise 'issue'. Epics live above projects in
 *     GitLab (group-level) and aren't surfaced here; pair with
 *     @archon/issues-jira if you need epic linkage.
 *   - Labels are passed through. Closing sets state_event=close.
 */
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

export interface GitLabIssueProviderOptions {
  /** e.g. https://gitlab.com or https://gitlab.example.com */
  baseUrl: string;
  /** Personal access token or project access token with `api` scope. */
  token: string;
  /** Numeric project id or url-encoded `group/path`. */
  projectId: string | number;
  /** Optional fetch override for testing. */
  fetchImpl?: typeof fetch;
}

interface GitLabIssue {
  id: number;
  iid: number;
  title: string;
  description: string | null;
  state: 'opened' | 'closed';
  labels: string[];
  web_url: string;
  created_at: string;
  updated_at: string;
  issue_type?: string;
  epic?: { id: number; iid: number } | null;
}

function mapKind(t: string | undefined): Issue['kind'] {
  switch (t) {
    case 'incident':
      return 'bug';
    case 'task':
      return 'task';
    default:
      return 'issue';
  }
}

function toIssue(raw: GitLabIssue): Issue {
  const iid = String(raw.iid);
  return {
    id: iid,
    key: iid,
    title: raw.title,
    body: raw.description ?? '',
    state: raw.state === 'opened' ? 'open' : 'closed',
    kind: mapKind(raw.issue_type),
    parentId: raw.epic ? `epic:${raw.epic.iid}` : undefined,
    labels: raw.labels,
    url: raw.web_url,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    extra: { glId: raw.id },
  };
}

export class GitLabIssueProvider implements IssueProvider {
  readonly providerType = 'gitlab';
  private readonly base: string;
  private readonly project: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: GitLabIssueProviderOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, '');
    this.project = encodeURIComponent(String(opts.projectId));
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async req(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ status: number; data: unknown }> {
    const res = await this.fetchImpl(`${this.base}/api/v4${path}`, {
      method,
      headers: {
        'PRIVATE-TOKEN': this.token,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const data: unknown = text ? JSON.parse(text) : null;
    return { status: res.status, data };
  }

  async list(options: ListIssuesOptions = {}): Promise<ListIssuesResult> {
    const params = new URLSearchParams();
    const state = options.state ?? 'all';
    if (state === 'open') params.set('state', 'opened');
    else if (state === 'closed') params.set('state', 'closed');
    if (options.query) params.set('search', options.query);
    if (options.limit) params.set('per_page', String(Math.min(options.limit, 100)));
    if (options.cursor) params.set('page', options.cursor);

    const { status, data } = await this.req('GET', `/projects/${this.project}/issues?${params}`);
    if (status >= 400) throw new Error(`GitLab list failed: ${status}`);
    const items = (data as GitLabIssue[]).map(toIssue);
    // GitLab uses page numbers; advance if we got a full page.
    const page = Number(options.cursor ?? '1');
    const nextCursor =
      items.length === Number(params.get('per_page') ?? 20) ? String(page + 1) : undefined;
    return { items, nextCursor };
  }

  async get(id: IssueId): Promise<Issue | null> {
    const { status, data } = await this.req('GET', `/projects/${this.project}/issues/${id}`);
    if (status === 404) return null;
    if (status >= 400) throw new Error(`GitLab get failed: ${status}`);
    return toIssue(data as GitLabIssue);
  }

  async create(input: NewIssue): Promise<Issue> {
    const body: Record<string, unknown> = {
      title: input.title,
      description: input.body ?? '',
      labels: (input.labels ?? []).join(','),
    };
    if (input.kind === 'task') body.issue_type = 'task';
    if (input.kind === 'bug') body.issue_type = 'incident';
    const { status, data } = await this.req('POST', `/projects/${this.project}/issues`, body);
    if (status >= 400) throw new Error(`GitLab create failed: ${status}`);
    return toIssue(data as GitLabIssue);
  }

  async update(id: IssueId, patch: IssueUpdate): Promise<Issue> {
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.body !== undefined) body.description = patch.body;
    if (patch.labels !== undefined) body.labels = patch.labels.join(',');
    if (patch.state === 'closed') body.state_event = 'close';
    if (patch.state === 'open') body.state_event = 'reopen';
    const { status, data } = await this.req('PUT', `/projects/${this.project}/issues/${id}`, body);
    if (status === 404) throw new IssueNotFoundError(id, this.providerType);
    if (status >= 400) throw new Error(`GitLab update failed: ${status}`);
    return toIssue(data as GitLabIssue);
  }

  async close(id: IssueId): Promise<Issue> {
    return this.update(id, { state: 'closed' });
  }

  async reopen(id: IssueId): Promise<Issue> {
    return this.update(id, { state: 'open' });
  }
}
