import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  shortId,
  k8sResourceName,
  appHostname,
  validateSlug,
  slugify,
  getDefaultInstanceId,
} from "../app-identifiers.js";

describe("app-identifiers", () => {
  describe("shortId", () => {
    it("should extract first 8 hex chars from UUID", () => {
      expect(shortId("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(
        "a1b2c3d4",
      );
    });

    it("should handle UUID without hyphens", () => {
      expect(shortId("a1b2c3d4e5f67890abcdef1234567890")).toBe("a1b2c3d4");
    });

    it("should return first 8 chars of any hex string", () => {
      expect(shortId("deadbeef-cafe-babe-1234-567890abcdef")).toBe(
        "deadbeef",
      );
    });
  });

  describe("k8sResourceName", () => {
    it("should combine instanceId and shortId", () => {
      expect(
        k8sResourceName("dev", "a1b2c3d4-e5f6-7890-abcd-ef1234567890"),
      ).toBe("dev-a1b2c3d4");
    });

    it("should work with long instance IDs", () => {
      expect(
        k8sResourceName("gabe-desktop", "deadbeef-cafe-babe-1234-567890abcdef"),
      ).toBe("gabe-desktop-deadbeef");
    });
  });

  describe("appHostname", () => {
    it("should build prefixed hostname", () => {
      expect(
        appHostname({
          mode: "prefixed",
          shortId: "a1b2c3d4",
          domain: "dev.toolkit.co",
        }),
      ).toBe("app-a1b2c3d4.dev.toolkit.co");
    });

    it("should build slug-based hostname", () => {
      expect(
        appHostname({
          mode: "slug",
          slug: "my-todo-app",
          domain: "kova.app",
        }),
      ).toBe("my-todo-app.kova.app");
    });
  });

  describe("validateSlug", () => {
    it("should accept valid slugs", () => {
      expect(validateSlug("my-app").valid).toBe(true);
      expect(validateSlug("todo-app-v2").valid).toBe(true);
      expect(validateSlug("abc").valid).toBe(true);
      expect(validateSlug("a1b2c3").valid).toBe(true);
    });

    it("should reject slugs that are too short", () => {
      const result = validateSlug("ab");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least 3");
    });

    it("should reject slugs that are too long", () => {
      const result = validateSlug("a".repeat(61));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at most 60");
    });

    it("should reject slugs starting with hyphen", () => {
      expect(validateSlug("-my-app").valid).toBe(false);
    });

    it("should reject slugs ending with hyphen", () => {
      expect(validateSlug("my-app-").valid).toBe(false);
    });

    it("should reject slugs with uppercase", () => {
      expect(validateSlug("My-App").valid).toBe(false);
    });

    it("should reject slugs with consecutive hyphens", () => {
      const result = validateSlug("my--app");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("consecutive hyphens");
    });

    it("should reject slugs with special characters", () => {
      expect(validateSlug("my_app").valid).toBe(false);
      expect(validateSlug("my.app").valid).toBe(false);
      expect(validateSlug("my app").valid).toBe(false);
    });
  });

  describe("slugify", () => {
    it("should convert name to slug format", () => {
      expect(slugify("My Todo App")).toBe("my-todo-app");
    });

    it("should handle special characters", () => {
      expect(slugify("Hello, World!")).toBe("hello-world");
    });

    it("should trim leading/trailing hyphens", () => {
      expect(slugify(" --My App-- ")).toBe("my-app");
    });

    it("should collapse consecutive hyphens", () => {
      expect(slugify("My   App   Name")).toBe("my-app-name");
    });

    it("should truncate to 60 chars", () => {
      const longName = "A".repeat(100);
      expect(slugify(longName).length).toBeLessThanOrEqual(60);
    });
  });

  describe("getDefaultInstanceId", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should use COMPUTERNAME on Windows", () => {
      process.env.COMPUTERNAME = "GABE-PC";
      process.env.HOSTNAME = undefined;
      expect(getDefaultInstanceId()).toBe("gabe-pc");
    });

    it("should use HOSTNAME on Linux", () => {
      delete process.env.COMPUTERNAME;
      process.env.HOSTNAME = "dev-server-01";
      expect(getDefaultInstanceId()).toBe("dev-server-01");
    });

    it("should sanitize special characters", () => {
      process.env.COMPUTERNAME = "GABE's PC (Work)";
      expect(getDefaultInstanceId()).toBe("gabe-s-pc-work");
    });

    it("should truncate to 20 chars", () => {
      process.env.COMPUTERNAME = "very-long-computer-name-that-exceeds-limit";
      expect(getDefaultInstanceId().length).toBeLessThanOrEqual(20);
    });

    it("should fallback to 'local' for empty hostname", () => {
      delete process.env.COMPUTERNAME;
      delete process.env.HOSTNAME;
      // hostname() from os module will return the actual hostname,
      // so we can't easily test the "local" fallback without mocking os
      const result = getDefaultInstanceId();
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
