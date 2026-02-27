/**
 * App Identifier Utilities
 *
 * Apps have multiple identifiers:
 * - id: Serial integer (DB primary key, API routes, internal refs)
 * - guid: UUIDv4 (globally unique, stored in DB)
 * - shortId: First 8 hex chars of guid (K8s resource names, DNS labels)
 * - slug: User-defined human-readable name (optional, unique per DB)
 */

import { hostname } from "node:os";

/**
 * Extract an 8-character short ID from a UUID.
 * Used for K8s resource naming where conciseness matters.
 * 8 hex chars = ~4 billion combinations — collision-free at our scale.
 */
export function shortId(guid: string): string {
  return guid.replace(/-/g, "").substring(0, 8);
}

/**
 * Build the K8s resource name for an app.
 * Format: {instanceId}-{shortId} (e.g., "dev-a1b2c3d4")
 */
export function k8sResourceName(instanceId: string, guid: string): string {
  return `${instanceId}-${shortId(guid)}`;
}

/**
 * Build the DNS hostname for an app's preview URL.
 *
 * In "prefixed" mode (dev/staging): app-{shortId}.{domain}
 * In "slug" mode (prod): {slug}.{domain}
 */
export function appHostname(
  opts:
    | { mode: "prefixed"; shortId: string; domain: string }
    | { mode: "slug"; slug: string; domain: string },
): string {
  if (opts.mode === "slug") {
    return `${opts.slug}.${opts.domain}`;
  }
  return `app-${opts.shortId}.${opts.domain}`;
}

/**
 * Validate a user-defined slug.
 * Rules:
 * - 3-60 characters
 * - Lowercase alphanumeric + hyphens
 * - Must start and end with alphanumeric
 * - No consecutive hyphens
 */
export function validateSlug(slug: string): { valid: boolean; error?: string } {
  if (slug.length < 3) {
    return { valid: false, error: "Slug must be at least 3 characters" };
  }
  if (slug.length > 60) {
    return { valid: false, error: "Slug must be at most 60 characters" };
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return {
      valid: false,
      error: "Slug must start and end with a letter or number, and contain only lowercase letters, numbers, and hyphens",
    };
  }
  if (/--/.test(slug)) {
    return { valid: false, error: "Slug must not contain consecutive hyphens" };
  }
  return { valid: true };
}

/**
 * Generate a slug from an app name.
 * Lowercases, replaces non-alphanumeric with hyphens, trims, deduplicates hyphens.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .substring(0, 60);
}

/**
 * Get the default KOVA_INSTANCE_ID from the machine hostname.
 * Sanitizes to be K8s-label-safe (lowercase, alphanumeric + hyphens, max 20 chars).
 * Works on Windows (COMPUTERNAME), Linux ($HOSTNAME), and macOS.
 */
export function getDefaultInstanceId(): string {
  const raw = process.env.COMPUTERNAME || process.env.HOSTNAME || hostname();
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 20) || "local";
}
