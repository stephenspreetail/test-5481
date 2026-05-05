import { describe, expect, test } from 'bun:test';
import { SqliteIssueProvider } from './index';

function newProvider(): SqliteIssueProvider {
  return new SqliteIssueProvider({ path: ':memory:' });
}

describe('SqliteIssueProvider', () => {
  test('create -> get round-trip preserves fields', async () => {
    const p = newProvider();
    const created = await p.create({
      title: 'Add login flow',
      body: 'OAuth via GitLab',
      kind: 'story',
      labels: ['auth', 'mvp'],
      extra: { storyPoints: 5 },
    });
    expect(created.state).toBe('open');
    expect(created.labels).toEqual(['auth', 'mvp']);
    const fetched = await p.get(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe('Add login flow');
    expect(fetched!.extra).toEqual({ storyPoints: 5 });
    p.dispose();
  });

  test('list filters by state, kind, parent', async () => {
    const p = newProvider();
    const epic = await p.create({ title: 'Epic A', kind: 'epic' });
    await p.create({ title: 'Story under A', kind: 'story', parentId: epic.id });
    const orphan = await p.create({ title: 'Standalone', kind: 'issue' });
    await p.close(orphan.id);

    const open = await p.list({ state: 'open' });
    expect(open.items.length).toBe(2);

    const stories = await p.list({ kind: 'story' });
    expect(stories.items.length).toBe(1);
    expect(stories.items[0].parentId).toBe(epic.id);

    const children = await p.list({ parentId: epic.id });
    expect(children.items.length).toBe(1);
    p.dispose();
  });

  test('close + reopen toggles state and bumps updatedAt', async () => {
    const p = newProvider();
    const issue = await p.create({ title: 'X' });
    const closed = await p.close(issue.id);
    expect(closed.state).toBe('closed');
    expect(closed.updatedAt >= issue.updatedAt).toBe(true);
    const reopened = await p.reopen(issue.id);
    expect(reopened.state).toBe('open');
    p.dispose();
  });
});
