import { describe, expect, test } from 'bun:test';
import { isGitLabUserAuthorized, parseAllowedUsers, verifyWebhookToken } from './auth';

describe('gitlab auth', () => {
  test('verifyWebhookToken matches when equal, rejects otherwise', () => {
    expect(verifyWebhookToken('secret', 'secret')).toBe(true);
    expect(verifyWebhookToken('secret', 'other')).toBe(false);
    expect(verifyWebhookToken(null, 'secret')).toBe(false);
    expect(verifyWebhookToken('secret', '')).toBe(false);
  });

  test('parseAllowedUsers splits + trims', () => {
    expect(parseAllowedUsers(' alice ,bob, ')).toEqual(['alice', 'bob']);
    expect(parseAllowedUsers(undefined)).toEqual([]);
  });

  test('isGitLabUserAuthorized treats empty allow-list as open', () => {
    expect(isGitLabUserAuthorized('alice', [])).toBe(true);
    expect(isGitLabUserAuthorized('alice', ['alice', 'bob'])).toBe(true);
    expect(isGitLabUserAuthorized('eve', ['alice', 'bob'])).toBe(false);
  });
});
