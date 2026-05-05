import { describe, expect, test } from 'bun:test';
import { ConversationLockManager } from '@archon/core';
import { GitLabAdapter } from './adapter';

function makeFetch(): { fetch: typeof fetch; calls: { url: string; body: unknown }[] } {
  const calls: { url: string; body: unknown }[] = [];
  const f: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    return new Response('{}', { status: 201 });
  };
  return { fetch: f, calls };
}

describe('GitLabAdapter', () => {
  test('parseConversationId distinguishes issues (#) from MRs (!)', () => {
    const a = new GitLabAdapter(
      'https://gitlab.example.com',
      't',
      'wt',
      new ConversationLockManager()
    );
    expect(a.parseConversationId('group/proj#42')).toEqual({
      projectPath: 'group/proj',
      kind: 'issue',
      iid: 42,
    });
    expect(a.parseConversationId('group/sub/proj!7')).toEqual({
      projectPath: 'group/sub/proj',
      kind: 'mr',
      iid: 7,
    });
    expect(a.parseConversationId('garbage')).toBeNull();
  });

  test('shouldRespondToNote checks for @mention', () => {
    const a = new GitLabAdapter('https://g', 't', 'w', new ConversationLockManager(), 'Archon');
    expect(a.shouldRespondToNote('hey @archon look at this')).toBe(true);
    expect(a.shouldRespondToNote('no mention')).toBe(false);
  });

  test('sendMessage posts a note to the right URL for issues vs MRs', async () => {
    const { fetch: f, calls } = makeFetch();
    const a = new GitLabAdapter(
      'https://gitlab.example.com',
      'tok',
      'wt',
      new ConversationLockManager(),
      'Archon',
      { fetchImpl: f }
    );
    await a.sendMessage('group/proj#42', 'hello');
    await a.sendMessage('group/proj!7', 'hi MR');
    expect(calls[0].url).toBe(
      'https://gitlab.example.com/api/v4/projects/group%2Fproj/issues/42/notes'
    );
    expect(calls[1].url).toBe(
      'https://gitlab.example.com/api/v4/projects/group%2Fproj/merge_requests/7/notes'
    );
    expect((calls[0].body as { body: string }).body).toContain('hello');
  });
});
