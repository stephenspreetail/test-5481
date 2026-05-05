/**
 * Reads admin-app configuration from env. All values are optional except the
 * SQLite path; missing Jira/GitLab creds disable those panels in the UI.
 */
export interface AdminConfig {
  port: number;
  sqlitePath: string;
  jira?: {
    baseUrl: string;
    email: string;
    apiToken: string;
    defaultJql: string;
  };
  gitlab?: {
    baseUrl: string;
    token: string;
    projectId: string;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AdminConfig {
  const cfg: AdminConfig = {
    port: Number(env.ISSUES_ADMIN_PORT ?? 5174),
    sqlitePath: env.ISSUES_SQLITE_PATH ?? './.archon/issues.sqlite',
  };
  if (env.JIRA_BASE_URL && env.JIRA_EMAIL && env.JIRA_API_TOKEN) {
    cfg.jira = {
      baseUrl: env.JIRA_BASE_URL,
      email: env.JIRA_EMAIL,
      apiToken: env.JIRA_API_TOKEN,
      defaultJql: env.JIRA_DEFAULT_JQL ?? 'issuetype in (Epic, Story) ORDER BY updated DESC',
    };
  }
  if (env.GITLAB_URL && env.GITLAB_TOKEN && env.GITLAB_PROJECT_ID) {
    cfg.gitlab = {
      baseUrl: env.GITLAB_URL,
      token: env.GITLAB_TOKEN,
      projectId: env.GITLAB_PROJECT_ID,
    };
  }
  return cfg;
}
