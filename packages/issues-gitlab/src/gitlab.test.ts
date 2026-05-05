import { describe, expect, test } from 'bun:test';
import { GitLabIssueProvider } from './index';

interface Call {
  url: string;
  method: string;
  body?: unknown;
}

function makeFakeFetch(handler: (call: Call) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  const f: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const call: Call = { url, method: init?.method ?? 'GET', body };
    calls.push(call);
    const { status, body: respBody } = handler(call);
    return new Response(JSON.stringify(respBody), { status });
  };
  return { fetch: f, calls };
}

describe('GitLabIssueProvider', () => {
  test('list maps opened/closed to open/closed and constructs the right URL', async () => {
    const { fetch: f, calls } = makeFakeFetch(() => ({
      status: 200,
      body: [
        {
          id: 1001,
          iid: 7,
          title: 'A bug',
          description: null,
          state: 'opened',
          labels: ['ux'],
          web_url: 'https://gitlab.example.com/g/p/-/issues/7',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
          issue_type: 'incident',
        },
      ],
    }));
    const p = new GitLabIssueProvider({
      baseUrl: 'https://gitlab.example.com',
      token: 't',
      projectId: 'g/p',
      fetchImpl: f,
    });
    const res = await p.list({ state: 'open' });
    expect(res.items.length).toBe(1);
    expect(res.items[0].kind).toBe('bug');
    expect(res.items[0].state).toBe('open');
    expect(calls[0].url).toContain('/projects/g%2Fp/issues');
    expect(calls[0].url).toContain('state=opened');
  });

  test('create posts title/description and returns mapped issue', async () => {
    const { fetch: f, calls } = makeFakeFetch(call => ({
      status: 201,
      body: {
        id: 999,
        iid: 12,
        title: (call.body as { title: string }).title,
        description: (call.body as { description: string }).description,
        state: 'opened',
        labels: [],
        web_url: 'https://gitlab.example.com/g/p/-/issues/12',
        created_at: '2026-05-05T00:00:00Z',
        updated_at: '2026-05-05T00:00:00Z',
      },
    }));
    const p = new GitLabIssueProvider({
      baseUrl: 'https://gitlab.example.com',
      token: 't',
      projectId: 42,
      fetchImpl: f,
    });
    const issue = await p.create({ title: 'Hello', body: 'world' });
    expect(issue.id).toBe('12');
    expect(issue.title).toBe('Hello');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('/projects/42/issues');
  });

  test('close sends state_event=close', async () => {
    let captured: Record<string, unknown> | undefined;
    const { fetch: f } = makeFakeFetch(call => {
      captured = call.body as Record<string, unknown>;
      return {
        status: 200,
        body: {
          id: 1,
          iid: 1,
          title: 't',
          description: '',
          state: 'closed',
          labels: [],
          web_url: '',
          created_at: 'a',
          updated_at: 'b',
        },
      };
    });
    const p = new GitLabIssueProvider({
      baseUrl: 'https://gitlab.example.com',
      token: 't',
      projectId: 1,
      fetchImpl: f,
    });
    const out = await p.close('1');
    expect(out.state).toBe('closed');
    expect(captured?.state_event).toBe('close');
  });
});
