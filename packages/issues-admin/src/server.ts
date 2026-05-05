/**
 * Issues Admin app — small Hono server that:
 *
 *   1. Reads epics + stories from Jira via JQL (read-only).
 *   2. Lets you create local issues in SQLite, optionally linked to a Jira
 *      epic or story (parentId = Jira key, e.g. "PROJ-123").
 *   3. Optionally mirrors created issues into GitLab (per-issue toggle).
 *
 * Server-rendered HTML; no SPA. JSON endpoints exist under /api for
 * scripting and for Archon workflows that want to consume the same data.
 */
import { Hono } from 'hono';
import { JiraIssueProvider } from '@archon/issues-jira';
import { SqliteIssueProvider } from '@archon/issues-sqlite';
import { GitLabIssueProvider } from '@archon/issues-gitlab';
import { type Issue, type IssueKind, NotSupportedError } from '@archon/issues';
import { loadConfig, type AdminConfig } from './config';
import { renderLayout, renderIndex, renderError } from './views';

export function createApp(cfg: AdminConfig = loadConfig()): Hono {
  const app = new Hono();
  const sqlite = new SqliteIssueProvider({ path: cfg.sqlitePath });
  const jira = cfg.jira ? new JiraIssueProvider(cfg.jira) : null;
  const gitlab = cfg.gitlab ? new GitLabIssueProvider(cfg.gitlab) : null;

  // ----- HTML -----

  app.get('/', async c => {
    const jql = c.req.query('jql') ?? cfg.jira?.defaultJql ?? '';
    let upstream: Issue[] = [];
    let upstreamError: string | undefined;
    if (jira && jql) {
      try {
        const res = await jira.searchJql(jql, 0, 50);
        upstream = res.items;
      } catch (e) {
        upstreamError = (e as Error).message;
      }
    }
    const local = await sqlite.list({ state: 'all', limit: 200 });
    const html = renderLayout(
      'Issues Admin',
      renderIndex({
        jiraConfigured: Boolean(jira),
        gitlabConfigured: Boolean(gitlab),
        jql,
        upstream,
        upstreamError,
        local: local.items,
      })
    );
    return c.html(html);
  });

  app.post('/issues', async c => {
    const form = await c.req.parseBody();
    const fStr = (k: string): string => {
      const v = form[k];
      return typeof v === 'string' ? v : '';
    };
    const title = fStr('title').trim();
    if (!title) return c.html(renderLayout('Error', renderError('title is required')), 400);
    const kind = (fStr('kind') as IssueKind) || 'issue';
    const parentId = fStr('parentId').trim() || undefined;
    const body = fStr('body');
    const labels = fStr('labels')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const mirrorGitlab = form.mirrorGitlab === 'on';

    const created = await sqlite.create({ title, body, kind, parentId, labels });
    if (mirrorGitlab && gitlab) {
      try {
        const remote = await gitlab.create({ title, body, kind, labels });
        await sqlite.update(created.id, {
          extra: { ...(created.extra ?? {}), gitlabIid: remote.id, gitlabUrl: remote.url },
        });
      } catch (e) {
        // Don't fail the local create if mirroring blew up.
        await sqlite.update(created.id, {
          extra: { ...(created.extra ?? {}), gitlabError: (e as Error).message },
        });
      }
    }
    return c.redirect(`/?jql=${encodeURIComponent(fStr('jql'))}`);
  });

  app.post('/issues/:id/close', async c => {
    await sqlite.close(c.req.param('id'));
    return c.redirect('/');
  });

  app.post('/issues/:id/reopen', async c => {
    await sqlite.reopen(c.req.param('id'));
    return c.redirect('/');
  });

  // ----- JSON -----

  app.get('/api/upstream', async c => {
    if (!jira) return c.json({ error: 'jira not configured' }, 400);
    const jql = c.req.query('jql') ?? cfg.jira?.defaultJql ?? '';
    try {
      const res = await jira.searchJql(jql);
      return c.json(res);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
  });

  app.get('/api/issues', async c => {
    const parentId = c.req.query('parentId') ?? undefined;
    const res = await sqlite.list({ state: 'all', parentId, limit: 200 });
    return c.json(res);
  });

  app.post('/api/issues', async c => {
    const body = await c.req.json<{
      title: string;
      body?: string;
      kind?: IssueKind;
      parentId?: string;
      labels?: string[];
      mirrorGitlab?: boolean;
    }>();
    if (!body.title) return c.json({ error: 'title required' }, 400);
    const created = await sqlite.create(body);
    if (body.mirrorGitlab && gitlab) {
      try {
        const remote = await gitlab.create({
          title: body.title,
          body: body.body,
          kind: body.kind,
          labels: body.labels,
        });
        await sqlite.update(created.id, {
          extra: { ...(created.extra ?? {}), gitlabIid: remote.id, gitlabUrl: remote.url },
        });
      } catch (e) {
        if (e instanceof NotSupportedError) {
          // GitLab impl never throws this, but be defensive.
          return c.json({ created, mirrorError: e.message });
        }
        return c.json({ created, mirrorError: (e as Error).message });
      }
    }
    return c.json(await sqlite.get(created.id));
  });

  return app;
}

if (import.meta.main) {
  const cfg = loadConfig();
  const app = createApp(cfg);
  Bun.serve({ fetch: app.fetch, port: cfg.port });

  console.log(`issues-admin listening on http://localhost:${cfg.port}`);
}
