import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createApp } from './server';

function makeApp() {
  const dir = mkdtempSync(join(tmpdir(), 'issues-admin-'));
  return createApp({
    port: 0,
    sqlitePath: join(dir, 'issues.sqlite'),
  });
}

describe('issues-admin server', () => {
  test('GET / renders the layout when nothing is configured', async () => {
    const app = makeApp();
    const res = await app.request('http://localhost/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<h1>Issues admin</h1>');
    expect(html).toContain('Jira not configured');
  });

  test('POST /issues creates a local issue and redirects', async () => {
    const app = makeApp();
    const form = new URLSearchParams({ title: 'Hello world', kind: 'story' });
    const res = await app.request('http://localhost/issues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    expect(res.status).toBe(302);
    const list = (await (await app.request('http://localhost/api/issues')).json()) as {
      items: { title: string }[];
    };
    expect(list.items.find(i => i.title === 'Hello world')).toBeDefined();
  });

  test('POST /api/issues creates from JSON', async () => {
    const app = makeApp();
    const res = await app.request('http://localhost/api/issues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'JSON-created', kind: 'task', parentId: 'PROJ-1' }),
    });
    expect(res.status).toBe(200);
    const created = (await res.json()) as { title: string; parentId?: string };
    expect(created.title).toBe('JSON-created');
    expect(created.parentId).toBe('PROJ-1');
  });
});
