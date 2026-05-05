/**
 * GitLab platform adapter — sibling of the GitHub adapter.
 *
 * Posts notes (comments) on issues and merge requests. Conversation IDs use
 * the form `${projectPath}#${iid}` for issues and `${projectPath}!${iid}`
 * for merge requests, mirroring GitLab's URL/ref conventions ("#" issue,
 * "!" MR).
 *
 * Only the methods required by IPlatformAdapter are implemented; richer
 * surfaces (assignees, labels, transitions) live in @archon/issues-gitlab.
 */
import type { IPlatformAdapter, MessageMetadata } from '@archon/core';
import { ConversationLockManager } from '@archon/core';
import { createLogger } from '@archon/paths';
import { isGitLabUserAuthorized, parseAllowedUsers, verifyWebhookToken } from './auth';
import { splitIntoParagraphChunks } from '../../utils/message-splitting';

let cachedLog: ReturnType<typeof createLogger> | undefined;
function getLog(): ReturnType<typeof createLogger> {
  if (!cachedLog) cachedLog = createLogger('adapter.gitlab');
  return cachedLog;
}

const MAX_LENGTH = 990_000;
const BOT_RESPONSE_MARKER = '<!-- archon-bot-response -->';

interface ParsedConvId {
  projectPath: string;
  kind: 'issue' | 'mr';
  iid: number;
}

export class GitLabAdapter implements IPlatformAdapter {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly webhookToken: string;
  private readonly allowedUsers: string[];
  private readonly botMention: string;
  /** Available for orchestrator integration; mirrors GitHubAdapter's wiring. */
  readonly lockManager: ConversationLockManager;
  private readonly retryDelayFn: (attempt: number) => number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    baseUrl: string,
    token: string,
    webhookToken: string,
    lockManager: ConversationLockManager,
    botMention?: string,
    options?: { retryDelayMs?: (attempt: number) => number; fetchImpl?: typeof fetch }
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
    this.webhookToken = webhookToken;
    this.lockManager = lockManager;
    this.botMention = botMention ?? 'Archon';
    this.allowedUsers = parseAllowedUsers(process.env.GITLAB_ALLOWED_USERS);
    this.retryDelayFn = options?.retryDelayMs ?? ((a: number): number => 1000 * a);
    this.fetchImpl = options?.fetchImpl ?? fetch;
    getLog().info(
      { baseUrl: this.baseUrl, allowList: this.allowedUsers.length },
      'gitlab.adapter_initialized'
    );
  }

  // ---------- IPlatformAdapter ----------

  getPlatformType(): string {
    return 'gitlab';
  }

  getStreamingMode(): 'stream' | 'batch' {
    return 'batch';
  }

  async ensureThread(originalConversationId: string): Promise<string> {
    // GitLab notes are always under their issue/MR, no separate thread.
    return originalConversationId;
  }

  async start(): Promise<void> {
    // Webhook server lifecycle is owned by the host (server package).
    getLog().info('gitlab.adapter_started');
  }

  stop(): void {
    getLog().info('gitlab.adapter_stopped');
  }

  async sendMessage(
    conversationId: string,
    message: string,
    _metadata?: MessageMetadata
  ): Promise<void> {
    const parsed = this.parseConversationId(conversationId);
    if (!parsed) {
      getLog().error({ conversationId }, 'gitlab.invalid_conversation_id');
      return;
    }
    if (message.length <= MAX_LENGTH) {
      await this.postNote(parsed, message);
      return;
    }
    const chunks = splitIntoParagraphChunks(message, MAX_LENGTH - 500);
    for (let i = 0; i < chunks.length; i++) {
      try {
        await this.postNote(parsed, chunks[i]);
      } catch (error) {
        const wrap = new Error(
          `Failed to post note chunk ${i + 1}/${chunks.length}; ${i} chunks delivered.`
        );
        wrap.cause = error;
        throw wrap;
      }
    }
  }

  // ---------- helpers ----------

  /** `group/sub/proj#42` → issue 42; `group/sub/proj!7` → MR 7. */
  parseConversationId(id: string): ParsedConvId | null {
    const m = /^(.+?)([#!])(\d+)$/.exec(id);
    if (!m) return null;
    return {
      projectPath: m[1],
      kind: m[2] === '!' ? 'mr' : 'issue',
      iid: Number(m[3]),
    };
  }

  isUserAuthorized(username: string): boolean {
    return isGitLabUserAuthorized(username, this.allowedUsers);
  }

  /** Verify the X-Gitlab-Token header against the configured secret. */
  verifyWebhook(headerToken: string | null): boolean {
    return verifyWebhookToken(headerToken, this.webhookToken);
  }

  shouldRespondToNote(noteBody: string): boolean {
    // Mirror GitHub's @mention semantics.
    return noteBody.toLowerCase().includes(`@${this.botMention.toLowerCase()}`);
  }

  private async postNote(parsed: ParsedConvId, message: string): Promise<void> {
    const project = encodeURIComponent(parsed.projectPath);
    const segment = parsed.kind === 'mr' ? 'merge_requests' : 'issues';
    const url = `${this.baseUrl}/api/v4/projects/${project}/${segment}/${parsed.iid}/notes`;
    const body = `${message}\n\n${BOT_RESPONSE_MARKER}`;
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'PRIVATE-TOKEN': this.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body }),
      });
      if (res.ok) return;
      const retryable = res.status === 429 || res.status >= 500;
      if (attempt < maxRetries && retryable) {
        await new Promise(r => setTimeout(r, this.retryDelayFn(attempt)));
        continue;
      }
      const text = await res.text();
      throw new Error(`GitLab note post failed: ${res.status} ${text.slice(0, 200)}`);
    }
  }
}
