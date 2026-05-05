# GitHub → GitLab + Jira migration status

This document tracks the move from upstream Archon's GitHub-centric design to
this fork's GitLab-for-source / Jira-for-upstream-issues / SQLite-for-local
layout.

## What's done

### New `IssueProvider` abstraction (`@archon/issues`)

A narrow, forge-agnostic interface that decouples Archon workflows from any
single issue tracker:

```ts
interface IssueProvider {
  readonly providerType: string;
  list(opts?): Promise<ListIssuesResult>;
  get(id): Promise<Issue | null>;
  create(input): Promise<Issue>;
  update(id, patch): Promise<Issue>;
  close(id): Promise<Issue>;
  reopen(id): Promise<Issue>;
}
```

`Issue` has a `kind` field (`epic | story | issue | task | bug`) and a
`parentId` so story → epic linkage is uniform across providers. Read-only
providers throw `NotSupportedError` from the mutation methods.

### Three reference implementations

- **`@archon/issues-sqlite`** — bun:sqlite, single-file, full read/write.
  Schema is created on first connect; `parent_id` is intentionally NOT a
  foreign key so it can hold either a local UUID or an external key like
  `PROJ-123`.
- **`@archon/issues-gitlab`** — REST v4. Maps `state: opened|closed` →
  `open|closed`; `issue_type: incident|task` → `bug|task`; close uses
  `state_event=close`.
- **`@archon/issues-jira`** — Jira Cloud REST v3, JQL-driven. Read-only by
  design — the admin UI is the source of truth for write paths, and the user
  was clear that Jira is upstream not a write target.

All three are unit-tested with injected `fetch` (or `:memory:` for SQLite).

### GitLab platform adapter (`packages/adapters/src/forge/gitlab`)

The upstream community GitLab adapter (798 lines + 53 tests) promoted from
`packages/adapters/src/community/forge/gitlab/` to first-class:

- Moved to `packages/adapters/src/forge/gitlab/` to sit beside `forge/github`.
- Re-exported from `@archon/adapters` so `import { GitLabAdapter } from
'@archon/adapters'` works alongside `GitHubAdapter`.
- Server wiring (`packages/server/src/index.ts`) was already conditional on
  `GITLAB_TOKEN` and `GITLAB_WEBHOOK_SECRET`; only the import path changed.
- Implements `IPlatformAdapter`, full `handleMessage` integration, webhook
  verification, allow-list parsing, and isolation-aware codebase resolution
  (everything `GitHubAdapter` does).

Earlier in this branch I wrote a short stub adapter at the same path; that
stub was deleted in favour of the upstream community adapter.

### Issues admin app (`@archon/issues-admin`)

Hono server with server-rendered HTML (no SPA). Three things:

1. Take a JQL query, list epics + stories from Jira (read-only).
2. Form to create a local SQLite-backed issue, with `parentId` either typed
   freely or chosen from the JQL results.
3. Optional checkbox to mirror new issues into the configured GitLab project.

JSON endpoints under `/api/*` mirror the HTML actions for scripting.

## What's intentionally NOT done

The upstream codebase has **98 non-test source files** that mention `github`
or `octokit`. Mechanically rewriting all of them would have ballooned this
change beyond a single session and would have broken hundreds of existing
unit tests. The pragmatic split:

| Layer                                     | Status                                                  |
| ----------------------------------------- | ------------------------------------------------------- |
| GitHub forge adapter (legacy)             | Preserved, untouched                                    |
| GitLab forge adapter (first-class)        | Promoted from `community/forge/gitlab`; 53 tests pass   |
| `IssueProvider` abstraction               | Added, three impls                                      |
| Server wiring (`packages/server`)         | Already conditional — instantiates both when configured |
| Workflow YAMLs that mention "github"      | **Unchanged** — copy any you actively use               |
| `gh` CLI calls (e.g. `github-graphql.ts`) | **Unchanged** — would need GitLab REST port             |

## How to finish the migration (incremental path)

The real work is much smaller than the original "98 files" headline implied —
of the 54 actual `.ts/.tsx` files that mention GitHub, only ~6 are squarely
GitHub-only and ~4 have GitHub-aware branches. The rest are URLs in error
messages, JSDoc examples, and metadata key names.

1. **Server wiring is already conditional.** `packages/server/src/index.ts`
   spins up `GitHubAdapter` only when `GITHUB_TOKEN` + `WEBHOOK_SECRET` are
   set, and `GitLabAdapter` only when `GITLAB_TOKEN` + `GITLAB_WEBHOOK_SECRET`
   are set. To run GitLab-only, just don't set the GitHub envs.
2. **Webhook routes.** `packages/server/src/routes/api.ts` already has a
   GitLab webhook path; verify it against your gateway.
3. **`getLinkedIssueNumbers`.** Port `packages/core/src/utils/github-graphql.ts`
   to use GitLab's `/api/v4/projects/:id/merge_requests/:iid/closes_issues`
   REST endpoint — no GraphQL needed.
4. **`packages/core/src/handlers/clone.ts`.** Add a `git@gitlab.com:` →
   `https://gitlab.com/` SSH-URL normalization branch and a `GITLAB_TOKEN`
   injection branch alongside the existing GitHub ones.
5. **`packages/isolation/src/pr-state.ts`.** Currently bails out for
   non-`github.com` remotes. Add a `gitlab.com` branch using `glab` CLI or
   GitLab REST.
6. **Workflow YAMLs.** Search `.archon/workflows/` for `github` references and
   either rename them or drop them.
7. **`@archon/issues` injection.** In
   `packages/core/src/orchestrator/orchestrator.ts`, accept an `IssueProvider`
   and route any "create issue" / "comment on issue" nodes through it instead
   of calling Octokit directly.

Stale references that are safe to leave alone (or address later as cosmetic):
URLs to upstream Archon's GitHub repo in error messages, the `github_context`
metadata key name (it's just a string), routing-prompt examples in
`workflows/router.ts`, and the `/adapters/community/gitlab/` doc-site URL
(its source file is at `packages/docs-web/src/content/docs/adapters/community/gitlab.md`
and just needs an `aliases:` entry if you move it).

## Tests

```bash
# New code only — fast.
bun test packages/issues/src \
         packages/issues-sqlite/src \
         packages/issues-gitlab/src \
         packages/issues-jira/src \
         packages/adapters/src/forge/gitlab \
         packages/issues-admin/src

# Full upstream suite — runs the original GitHub-based tests too. Many of
# those will keep passing because the GitHub adapter is unchanged.
bun test
```

17/17 new tests pass. All five new packages and the GitLab forge adapter
typecheck under their respective `tsconfig.json` files.
