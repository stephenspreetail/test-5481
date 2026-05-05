/**
 * GitLab webhook payload subset that Archon cares about.
 *
 * Three event kinds matter:
 *   - Issue Hook (`object_kind: "issue"`)
 *   - Merge Request Hook (`object_kind: "merge_request"`)
 *   - Note Hook (`object_kind: "note"`) — comments on issues/MRs
 *
 * Field names follow GitLab's snake_case payloads. See
 * https://docs.gitlab.com/ee/user/project/integrations/webhook_events.html
 */
export interface GitLabUser {
  id: number;
  username: string;
  name?: string;
}

export interface GitLabProject {
  id: number;
  path_with_namespace: string;
  web_url: string;
  default_branch: string;
}

export interface GitLabIssueAttrs {
  id: number;
  iid: number;
  title: string;
  description: string | null;
  state: 'opened' | 'closed';
  action?: 'open' | 'close' | 'reopen' | 'update';
  url: string;
  labels?: { title: string }[];
}

export interface GitLabMergeRequestAttrs {
  id: number;
  iid: number;
  title: string;
  description: string | null;
  state: 'opened' | 'closed' | 'merged';
  action?: 'open' | 'close' | 'reopen' | 'update' | 'merge';
  url: string;
  source_branch: string;
  target_branch: string;
}

export interface GitLabNoteAttrs {
  id: number;
  note: string;
  noteable_type: 'Issue' | 'MergeRequest' | (string & {});
  url: string;
}

export interface WebhookEvent {
  object_kind: 'issue' | 'merge_request' | 'note' | (string & {});
  user: GitLabUser;
  project: GitLabProject;
  object_attributes: GitLabIssueAttrs | GitLabMergeRequestAttrs | GitLabNoteAttrs;
  /** Present on note hooks. */
  issue?: GitLabIssueAttrs;
  /** Present on note hooks attached to MRs. */
  merge_request?: GitLabMergeRequestAttrs;
}
