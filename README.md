# Archon (GitLab + Jira fork)

This repository is a fork of [coleam00/Archon](https://github.com/coleam00/Archon)
re-targeted at **GitLab** for source control / merge requests and **Jira** for
upstream issue tracking, with a local **SQLite** store for issues that the
Archon workflow engine creates and updates.

> Upstream Archon is built around GitHub. Rather than rip the GitHub adapter
> out (it's deeply wired throughout the codebase), this fork adds the GitLab
> and Jira plumbing alongside it. The `IssueProvider` interface is the seam
> that lets workflows be agnostic about where an "issue" lives. See
> [MIGRATION.md](./MIGRATION.md) for the porting status.

## What's new in this fork

| Package                     | Purpose                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| `@archon/issues`            | Forge-agnostic `IssueProvider` interface, error types, and shared shapes |
| `@archon/issues-sqlite`     | Reference impl: bun:sqlite store; full read/write                        |
| `@archon/issues-gitlab`     | GitLab REST v4 issues impl (full read/write)                             |
| `@archon/issues-jira`       | Jira Cloud read-only impl, JQL-driven; writes throw `NotSupportedError` |
| `@archon/issues-admin`      | Hono web app: browse Jira epics/stories via JQL, add SQLite issues      |
| `packages/adapters/src/forge/gitlab` | GitLab platform adapter (note posting on issues + MRs)         |

The original GitHub adapter at `packages/adapters/src/forge/github` is
preserved unchanged so existing tests stay green; new deployments should wire
the GitLab adapter instead.

## Running the issues admin app

The admin app is the smallest useful surface: it reads epics and stories from
Jira, lets you add SQLite-backed issues against them, and (optionally)
mirrors each new issue into a GitLab project.

```bash
bun install
JIRA_BASE_URL=https://your-org.atlassian.net \
JIRA_EMAIL=you@example.com \
JIRA_API_TOKEN=... \
JIRA_DEFAULT_JQL='project = PROJ AND issuetype in (Epic, Story) ORDER BY updated DESC' \
GITLAB_URL=https://gitlab.example.com \
GITLAB_TOKEN=... \
GITLAB_PROJECT_ID=group/sub/project \
ISSUES_SQLITE_PATH=./.archon/issues.sqlite \
bun --filter @archon/issues-admin dev
```

Then open http://localhost:5174.

If you only set `JIRA_*`, the GitLab mirror checkbox is hidden. If you set
neither, the admin still works as a pure local SQLite issue tracker.

## JSON API

The admin app also exposes a small JSON API for scripting and for Archon
workflows that want to consume the same data:

| Method | Path                          | Description                                  |
| ------ | ----------------------------- | -------------------------------------------- |
| GET    | `/api/upstream?jql=…`         | Run a JQL query against Jira                 |
| GET    | `/api/issues?parentId=PROJ-1` | List local issues, optionally by parent      |
| POST   | `/api/issues`                 | Create a local issue (optional GitLab mirror) |

## Tests

```bash
bun test packages/issues/src \
         packages/issues-sqlite/src \
         packages/issues-gitlab/src \
         packages/issues-jira/src \
         packages/adapters/src/forge/gitlab \
         packages/issues-admin/src
```

All adapters use injected `fetch` so the GitLab/Jira tests don't hit the
network.

## Upstream Archon

Everything outside the packages listed above is the upstream Archon source as
of the cloned commit. See `CLAUDE.md`, `CONTRIBUTING.md`, and the upstream
README at https://github.com/coleam00/Archon for documentation on workflows,
the orchestrator, and the rest of the platform.
