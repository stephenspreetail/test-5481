/**
 * Tiny server-rendered views. No JSX, no client framework — just template
 * literals with HTML escaping. Anything fancier would be overkill for an
 * admin UI that exists to drive a SQLite store.
 */
import type { Issue } from '@archon/issues';

const escMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => escMap[c]);
}

export function renderLayout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: light dark; }
    body { font: 14px/1.4 system-ui, sans-serif; max-width: 1100px; margin: 1rem auto; padding: 0 1rem; }
    h1, h2 { margin: 1rem 0 0.5rem; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #5553; vertical-align: top; }
    th { font-weight: 600; }
    .muted { opacity: 0.65; }
    .pill { display: inline-block; padding: 1px 6px; border: 1px solid #5556; border-radius: 999px; font-size: 12px; margin-right: 4px; }
    form.inline { display: inline; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: start; }
    @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
    input, textarea, select, button { font: inherit; padding: 4px 6px; }
    textarea { width: 100%; min-height: 80px; }
    .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
    .row > * { flex-shrink: 0; }
    .row > .grow { flex-grow: 1; min-width: 200px; }
    .err { color: #c00; background: #f002; padding: 6px 8px; border-radius: 4px; }
    code { background: #5552; padding: 1px 4px; border-radius: 3px; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

export function renderError(msg: string): string {
  return `<p class="err">${esc(msg)}</p><p><a href="/">&larr; back</a></p>`;
}

export interface IndexProps {
  jiraConfigured: boolean;
  gitlabConfigured: boolean;
  jql: string;
  upstream: Issue[];
  upstreamError?: string;
  local: Issue[];
}

function epicOptions(upstream: Issue[]): string {
  const epics = upstream.filter(i => i.kind === 'epic' || i.kind === 'story');
  return epics
    .map(
      e =>
        `<option value="${esc(e.key ?? e.id)}">${esc(e.kind)} · ${esc(e.key ?? e.id)} — ${esc(
          e.title.slice(0, 80)
        )}</option>`
    )
    .join('');
}

function renderUpstream(
  upstream: Issue[],
  localByParent: Map<string, Issue[]>,
  jiraConfigured: boolean,
  error?: string
): string {
  if (!jiraConfigured) {
    return '<p class="muted">Jira not configured. Set <code>JIRA_BASE_URL</code>, <code>JIRA_EMAIL</code>, <code>JIRA_API_TOKEN</code>.</p>';
  }
  if (error) return `<p class="err">Jira error: ${esc(error)}</p>`;
  if (upstream.length === 0) return '<p class="muted">No matching epics or stories.</p>';
  const rows = upstream
    .map(i => {
      const children = localByParent.get(i.key ?? i.id) ?? [];
      const childList = children.length
        ? `<ul>${children
            .map(
              c =>
                `<li>${esc(c.title)} <span class="muted">(${esc(c.kind)}, ${esc(c.state)})</span></li>`
            )
            .join('')}</ul>`
        : '<span class="muted">no local issues</span>';
      return `<tr>
        <td><span class="pill">${esc(i.kind)}</span></td>
        <td><a href="${esc(i.url ?? '#')}" target="_blank" rel="noreferrer">${esc(i.key ?? i.id)}</a></td>
        <td>${esc(i.title)}</td>
        <td>${childList}</td>
      </tr>`;
    })
    .join('');
  return `<table>
    <thead><tr><th>Kind</th><th>Key</th><th>Title</th><th>Local issues</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderLocal(local: Issue[]): string {
  if (local.length === 0) return '<p class="muted">No local issues yet.</p>';
  const rows = local
    .map(i => {
      const action =
        i.state === 'open'
          ? `<form class="inline" method="post" action="/issues/${esc(i.id)}/close"><button>close</button></form>`
          : `<form class="inline" method="post" action="/issues/${esc(i.id)}/reopen"><button>reopen</button></form>`;
      const link =
        i.extra && (i.extra as { gitlabUrl?: string }).gitlabUrl
          ? ` · <a href="${esc((i.extra as { gitlabUrl: string }).gitlabUrl)}" target="_blank" rel="noreferrer">gitlab</a>`
          : '';
      return `<tr>
        <td><span class="pill">${esc(i.kind)}</span> <span class="pill">${esc(i.state)}</span></td>
        <td>${esc(i.parentId ?? '—')}</td>
        <td>${esc(i.title)}${link}</td>
        <td>${(i.labels ?? []).map(l => `<span class="pill">${esc(l)}</span>`).join('')}</td>
        <td>${action}</td>
      </tr>`;
    })
    .join('');
  return `<table>
    <thead><tr><th>State</th><th>Parent</th><th>Title</th><th>Labels</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function renderIndex(p: IndexProps): string {
  const localByParent = new Map<string, Issue[]>();
  for (const i of p.local) {
    if (!i.parentId) continue;
    const arr = localByParent.get(i.parentId) ?? [];
    arr.push(i);
    localByParent.set(i.parentId, arr);
  }

  const mirrorCheckbox = p.gitlabConfigured
    ? '<label><input type="checkbox" name="mirrorGitlab" /> mirror to GitLab</label>'
    : '<label class="muted"><input type="checkbox" disabled /> GitLab not configured</label>';

  return `
  <h1>Issues admin</h1>
  <p class="muted">SQLite-backed local issues, optionally linked to a Jira epic/story (read-only) and optionally mirrored to GitLab.</p>

  <h2>Upstream (Jira)</h2>
  <form method="get" class="row">
    <label class="grow">JQL <input class="grow" name="jql" value="${esc(p.jql)}" placeholder='issuetype in (Epic, Story) AND project = PROJ' /></label>
    <button>Search</button>
  </form>
  ${renderUpstream(p.upstream, localByParent, p.jiraConfigured, p.upstreamError)}

  <div class="grid">
    <div>
      <h2>Add local issue</h2>
      <form method="post" action="/issues">
        <input type="hidden" name="jql" value="${esc(p.jql)}" />
        <p><label>Title<br /><input name="title" required style="width: 100%" /></label></p>
        <p><label>Body<br /><textarea name="body"></textarea></label></p>
        <p class="row">
          <label>Kind
            <select name="kind">
              <option value="issue">issue</option>
              <option value="task">task</option>
              <option value="bug">bug</option>
              <option value="story">story</option>
              <option value="epic">epic</option>
            </select>
          </label>
          <label>Parent (Jira key or local id)
            <input name="parentId" placeholder="PROJ-123 or epic uuid" />
          </label>
        </p>
        <p>
          <label>Or pick from JQL results:
            <select name="parentId" onchange="this.form.parentId.value=this.value">
              <option value="">(none)</option>
              ${epicOptions(p.upstream)}
            </select>
          </label>
        </p>
        <p><label>Labels (comma-separated)<br /><input name="labels" /></label></p>
        <p>${mirrorCheckbox}</p>
        <p><button type="submit">Create</button></p>
      </form>
    </div>
    <div>
      <h2>Local issues</h2>
      ${renderLocal(p.local)}
    </div>
  </div>`;
}
