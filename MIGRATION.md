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

Sibling of the existing `forge/github` adapter:

- Implements `IPlatformAdapter`.
- Conversation IDs use GitLab's own ref syntax: `group/proj#42` for issues,
  `group/proj!7` for merge requests.
- Posts notes to either issues or MRs via `/api/v4/projects/:id/{issues,merge_requests}/:iid/notes`.
- Webhook auth uses GitLab's `X-Gitlab-Token` header (constant-time compare),
  not GitHub's HMAC scheme.
- `parseConversationId`, `shouldRespondToNote`, `verifyWebhook`,
  `isUserAuthorized`, message chunking — all mirror the GitHub adapter's
  behavior.

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

| Layer                                     | Status                                         |
| ----------------------------------------- | ---------------------------------------------- |
| GitHub forge adapter (legacy)             | Preserved, untouched                           |
| GitLab forge adapter (new)                | Added, tested                                  |
| `IssueProvider` abstraction               | Added, three impls                             |
| Server wiring (`packages/server`)         | **Still instantiates `GitHubAdapter`**         |
| Workflow YAMLs that mention "github"      | **Unchanged** — copy any you actively use      |
| `gh` CLI calls (e.g. `github-graphql.ts`) | **Unchanged** — would need GitLab GraphQL port |

## How to finish the migration (incremental path)

1. **Server wiring.** In `packages/server/src/index.ts`, replace
   `new GitHubAdapter(...)` with `new GitLabAdapter(...)` (constructor
   signatures match closely; just swap GitHub `webhookSecret` for GitLab
   `webhookToken` and add `baseUrl`).
2. **Webhook routes.** Update `packages/server/src/routes/api.ts` to validate
   `X-Gitlab-Token` instead of `X-Hub-Signature-256`.
3. **`getLinkedIssueNumbers`.** Port `packages/core/src/utils/github-graphql.ts`
   to use GitLab's `/api/v4/projects/:id/merge_requests/:iid/closes_issues`
   REST endpoint — no GraphQL needed.
4. **Workflow YAMLs.** Search `.archon/workflows/` for `github` references and
   either rename them or drop them.
5. **`@archon/issues` injection.** In `packages/core/src/orchestrator/orchestrator.ts`,
   accept an `IssueProvider` and route any "create issue" / "comment on issue"
   nodes through it instead of calling Octokit directly.

The interface and adapters are ready; the work above is a series of mechanical
swaps once you decide which specific workflows you need.

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
