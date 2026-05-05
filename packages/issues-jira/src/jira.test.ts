import { describe, expect, test } from 'bun:test';
import { JiraIssueProvider } from './index';
import { NotSupportedError } from '@archon/issues';

function fakeFetch(handler: (url: string, init?: RequestInit) => unknown): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const body = handler(url, init);
    return new Response(JSON.stringify(body), { status: 200 });
  };
}

const sample = {
  issues: [
    {
      id: '10001',
      key: 'PROJ-1',
      self: '...',
      fields: {
        summary: 'Build login epic',
        description: { type: 'doc', content: [{ type: 'text', text: 'Goal: SSO' }] },
        issuetype: { name: 'Epic' },
        status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
        labels: ['security'],
        updated: '2026-05-04T00:00:00.000+0000',
        created: '2026-05-01T00:00:00.000+0000',
      },
    },
    {
      id: '10002',
      key: 'PROJ-2',
      self: '...',
      fields: {
        summary: 'Story under epic',
        description: 'plain text body',
        issuetype: { name: 'Story' },
        status: { name: 'Done', statusCategory: { key: 'done' } },
        labels: [],
        parent: { id: '10001', key: 'PROJ-1' },
        updated: '2026-05-05T00:00:00.000+0000',
        created: '2026-05-02T00:00:00.000+0000',
      },
    },
  ],
  startAt: 0,
  maxResults: 50,
  total: 2,
};

describe('JiraIssueProvider', () => {
  test('searchJql maps epics + stories and flattens ADF body', async () => {
    let capturedUrl = '';
    const p = new JiraIssueProvider({
      baseUrl: 'https://example.atlassian.net',
      email: 'a@b.com',
      apiToken: 'tok',
      fetchImpl: fakeFetch(url => {
        capturedUrl = url;
        return sample;
      }),
    });
    const res = await p.searchJql('issuetype in (Epic, Story)');
    expect(res.items.length).toBe(2);
    expect(res.items[0].kind).toBe('epic');
    expect(res.items[0].body).toBe('Goal: SSO');
    expect(res.items[1].kind).toBe('story');
    expect(res.items[1].state).toBe('closed');
    expect(res.items[1].parentId).toBe('PROJ-1');
    expect(capturedUrl).toContain('rest/api/3/search');
    expect(capturedUrl).toContain('jql=');
  });

  test('writes throw NotSupportedError', async () => {
    const p = new JiraIssueProvider({
      baseUrl: 'https://example.atlassian.net',
      email: 'a@b.com',
      apiToken: 'tok',
      fetchImpl: fakeFetch(() => sample),
    });
    await expect(p.create({ title: 'x' })).rejects.toBeInstanceOf(NotSupportedError);
    await expect(p.close('PROJ-1')).rejects.toBeInstanceOf(NotSupportedError);
  });
});
