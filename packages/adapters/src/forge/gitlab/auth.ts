/**
 * GitLab webhook signature verification + user allow-listing.
 *
 * GitLab webhooks don't sign payloads with HMAC like GitHub does — instead
 * the configured "Secret token" is sent verbatim in the `X-Gitlab-Token`
 * request header. We compare it in constant time.
 */
import { timingSafeEqual } from 'crypto';

export function verifyWebhookToken(headerToken: string | null, expected: string): boolean {
  if (!headerToken || !expected) return false;
  const a = Buffer.from(headerToken);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseAllowedUsers(env: string | undefined): string[] {
  if (!env) return [];
  return env
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export function isGitLabUserAuthorized(username: string, allowList: string[]): boolean {
  if (allowList.length === 0) return true;
  return allowList.includes(username);
}
