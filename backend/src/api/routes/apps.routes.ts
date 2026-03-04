import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, count, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "../../config/index.js";
import { db } from "../../db/index.js";
import { apps, chats, messages } from "../../db/schema.js";
import { appContainerService } from "../../services/app-container.service.js";
import { secretService } from "../../services/secret.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { slugify, validateSlug, shortId, appHostname } from "../../utils/app-identifiers.js";
import { buildK8sEnvironmentConfig } from "../../services/k8s-environment.service.js";

const createAppSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(3).max(100).optional(),
  installCommand: z.string().optional(),
  startCommand: z.string().optional(),
});

const updateAppSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(3).max(100).optional().nullable(),
  installCommand: z.string().optional(),
  startCommand: z.string().optional(),
  isFavorite: z.boolean().optional(),
  chatContext: z.any().optional(),
});

const setEnvVarSchema = z.object({
  key: z.string().min(1).max(255),
  value: z.string(),
});

export async function appsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook("preHandler", authMiddleware);

  /**
   * GET /api/apps
   * List all apps for the current user with recent chats and stats
   */
  app.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const query = request.query as { search?: string };

    // Build base query with search filter (case-insensitive)
    const whereClause = query.search
      ? and(eq(apps.userId, user.userId), ilike(apps.name, `%${query.search}%`), isNull(apps.archivedAt))
      : and(eq(apps.userId, user.userId), isNull(apps.archivedAt));

    // Get all apps
    const appsResult = await db
      .select()
      .from(apps)
      .where(whereClause)
      .orderBy(desc(apps.updatedAt));

    // For each app, get recent chats and stats
    const appsWithDetails = await Promise.all(
      appsResult.map(async (app) => {
        // Get 3 most recently updated chats
        const recentChats = await db
          .select({
            id: chats.id,
            title: chats.title,
            createdAt: chats.createdAt,
            updatedAt: chats.updatedAt,
          })
          .from(chats)
          .where(eq(chats.appId, app.id))
          .orderBy(desc(chats.updatedAt))
          .limit(3);

        // Get chat count
        const chatCountResult = await db
          .select({ count: count() })
          .from(chats)
          .where(eq(chats.appId, app.id));

        // Get message count (usage stat)
        const messageCountResult = await db
          .select({ count: count() })
          .from(messages)
          .innerJoin(chats, eq(messages.chatId, chats.id))
          .where(eq(chats.appId, app.id));

        // Get the most recent chat activity timestamp
        const mostRecentChatActivity = recentChats.length > 0
          ? recentChats[0].updatedAt
          : null;

        return {
          ...app,
          recentChats,
          chatCount: chatCountResult[0]?.count || 0,
          messageCount: messageCountResult[0]?.count || 0,
          mostRecentChatActivity,
        };
      }),
    );

    return appsWithDetails;
  });

  /**
   * POST /api/apps
   * Create a new app (also creates an initial chat)
   * Path format: {userId}/{appId}-{timestamp}
   */
  app.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = createAppSchema.parse(request.body);

    // Validate slug if provided, otherwise auto-generate from name
    let slug = body.slug ?? slugify(body.name);
    if (slug) {
      const validation = validateSlug(slug);
      if (!validation.valid) {
        reply.status(400).send({ error: validation.error });
        return;
      }
    }

    const timestamp = Date.now();
    // Insert with temporary path first to get the app ID
    const tempPath = `${user.userId}/temp-${timestamp}`;

    // Attempt insert; if slug conflicts, append a short random suffix
    let appResult;
    try {
      appResult = await db
        .insert(apps)
        .values({
          userId: user.userId,
          name: body.name,
          slug: slug || null,
          path: tempPath,
          installCommand: body.installCommand,
          startCommand: body.startCommand,
        })
        .returning();
    } catch (error: any) {
      // Handle unique constraint violation on slug
      if (error.code === "23505" && error.constraint?.includes("slug")) {
        // Auto-append random suffix to slug
        const suffix = Math.random().toString(36).substring(2, 6);
        slug = `${slug}-${suffix}`;
        appResult = await db
          .insert(apps)
          .values({
            userId: user.userId,
            name: body.name,
            slug,
            path: tempPath,
            installCommand: body.installCommand,
            startCommand: body.startCommand,
          })
          .returning();
      } else {
        throw error;
      }
    }

    const insertedApp = appResult[0];

    // Update path to use the actual app ID: {userId}/{appId}-{timestamp}
    const finalPath = `${user.userId}/${insertedApp.id}-${timestamp}`;
    const updatedAppResult = await db
      .update(apps)
      .set({ path: finalPath })
      .where(eq(apps.id, insertedApp.id))
      .returning();

    const newApp = updatedAppResult[0];

    // Also create an initial chat for this app
    const chatResult = await db
      .insert(chats)
      .values({
        appId: newApp.id,
        title: "New Chat",
      })
      .returning();

    reply.status(201).send({
      app: newApp,
      chatId: chatResult[0].id,
    });
  });

  /**
   * GET /api/apps/:id
   * Get a single app
   */
  app.get("/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const result = await db
      .select()
      .from(apps)
      .where(and(eq(apps.id, parseInt(id)), eq(apps.userId, user.userId), isNull(apps.archivedAt)))
      .limit(1);

    if (result.length === 0) {
      reply.status(404).send({ error: "App not found" });
      return;
    }

    return result[0];
  });

  /**
   * GET /api/apps/:id/preview-url
   * Compute the preview URL for an app (independent of container state)
   */
  app.get(
    "/:id/preview-url",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const result = await db
        .select({ guid: apps.guid, slug: apps.slug })
        .from(apps)
        .where(and(eq(apps.id, parseInt(id)), eq(apps.userId, user.userId), isNull(apps.archivedAt)))
        .limit(1);

      if (result.length === 0) {
        reply.status(404).send({ error: "App not found" });
        return;
      }

      const { guid, slug } = result[0];
      const k8sEnv = buildK8sEnvironmentConfig();
      const hostname = appHostname(
        k8sEnv.previewUrlMode === "slug" && slug
          ? { mode: "slug", slug, domain: k8sEnv.previewDomain }
          : { mode: "prefixed", shortId: shortId(guid), domain: k8sEnv.previewDomain },
      );
      const isHttps = k8sEnv.previewPort === 443 || k8sEnv.previewPort === 8443;
      const protocol = isHttps ? "https" : "http";
      const portSuffix =
        k8sEnv.previewPort === 443 || k8sEnv.previewPort === 80
          ? ""
          : `:${k8sEnv.previewPort}`;

      return { previewUrl: `${protocol}://${hostname}${portSuffix}` };
    },
  );

  /**
   * PUT /api/apps/:id
   * Update an app
   */
  app.put("/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = updateAppSchema.parse(request.body);

    // Validate slug if provided
    if (body.slug !== undefined && body.slug !== null) {
      const validation = validateSlug(body.slug);
      if (!validation.valid) {
        reply.status(400).send({ error: validation.error });
        return;
      }
    }

    const appId = parseInt(id);
    let result;
    try {
      result = await db
        .update(apps)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(apps.id, appId), eq(apps.userId, user.userId)))
        .returning();
    } catch (error: any) {
      // Slug conflict — retry with a random suffix
      if (error.code === "23505" && error.constraint?.includes("slug") && body.slug) {
        const suffix = Math.random().toString(36).substring(2, 6);
        body.slug = `${body.slug}-${suffix}`;
        result = await db
          .update(apps)
          .set({ ...body, updatedAt: new Date() })
          .where(and(eq(apps.id, appId), eq(apps.userId, user.userId)))
          .returning();
      } else {
        throw error;
      }
    }

    if (result.length === 0) {
      reply.status(404).send({ error: "App not found" });
      return;
    }

    return result[0];
  });

  /**
   * DELETE /api/apps/:id
   * Archive an app (soft delete) and clean up container resources
   */
  app.delete("/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const appId = parseInt(id);
    const result = await db
      .update(apps)
      .set({ archivedAt: new Date() })
      .where(and(eq(apps.id, appId), eq(apps.userId, user.userId), isNull(apps.archivedAt)))
      .returning();

    if (result.length === 0) {
      reply.status(404).send({ error: "App not found" });
      return;
    }

    // Stop container and clean up resources (including PVC)
    try {
      await appContainerService.stopContainer(appId, {
        reason: "app archived",
        deletePersistentStorage: true,
      });
    } catch (error) {
      console.error(`[DELETE /api/apps/${id}] Failed to stop container:`, error);
      // Continue anyway - app is already archived in DB
    }

    return { success: true };
  });

  /**
   * POST /api/apps/:id/favorite
   * Toggle favorite status
   */
  app.post(
    "/:id/favorite",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      // Get current favorite status
      const current = await db
        .select({ isFavorite: apps.isFavorite })
        .from(apps)
        .where(and(eq(apps.id, parseInt(id)), eq(apps.userId, user.userId)))
        .limit(1);

      if (current.length === 0) {
        reply.status(404).send({ error: "App not found" });
        return;
      }

      // Toggle
      const result = await db
        .update(apps)
        .set({
          isFavorite: !current[0].isFavorite,
          updatedAt: new Date(),
        })
        .where(and(eq(apps.id, parseInt(id)), eq(apps.userId, user.userId)))
        .returning();

      return result[0];
    },
  );

  // =====================
  // Environment Variables
  // =====================

  /**
   * GET /api/apps/:id/env
   * List environment variable keys (not values) for an app
   */
  app.get("/:id/env", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    // Verify user owns the app
    const appResult = await db
      .select({ id: apps.id })
      .from(apps)
      .where(and(eq(apps.id, parseInt(id)), eq(apps.userId, user.userId)))
      .limit(1);

    if (appResult.length === 0) {
      reply.status(404).send({ error: "App not found" });
      return;
    }

    const keys = await secretService.listAppEnvVarKeys(parseInt(id));
    return { keys };
  });

  /**
   * POST /api/apps/:id/env
   * Set an environment variable for an app
   */
  app.post("/:id/env", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = setEnvVarSchema.parse(request.body);

    // Verify user owns the app
    const appResult = await db
      .select({ id: apps.id })
      .from(apps)
      .where(and(eq(apps.id, parseInt(id)), eq(apps.userId, user.userId)))
      .limit(1);

    if (appResult.length === 0) {
      reply.status(404).send({ error: "App not found" });
      return;
    }

    await secretService.setAppEnvVar(parseInt(id), body.key, body.value);
    return { success: true };
  });

  /**
   * DELETE /api/apps/:id/env/:key
   * Delete an environment variable for an app
   */
  app.delete(
    "/:id/env/:key",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id, key } = request.params as { id: string; key: string };

      // Verify user owns the app
      const appResult = await db
        .select({ id: apps.id })
        .from(apps)
        .where(and(eq(apps.id, parseInt(id)), eq(apps.userId, user.userId)))
        .limit(1);

      if (appResult.length === 0) {
        reply.status(404).send({ error: "App not found" });
        return;
      }

      await secretService.deleteAppEnvVar(parseInt(id), key);
      return { success: true };
    },
  );

  // =====================
  // App Chats (convenience endpoint)
  // =====================

  /**
   * GET /api/apps/:id/chats
   * List all chats for an app
   */
  app.get(
    "/:id/chats",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      // Verify user owns the app
      const appResult = await db
        .select({ id: apps.id })
        .from(apps)
        .where(and(eq(apps.id, parseInt(id)), eq(apps.userId, user.userId)))
        .limit(1);

      if (appResult.length === 0) {
        reply.status(404).send({ error: "App not found" });
        return;
      }

      const result = await db
        .select()
        .from(chats)
        .where(eq(chats.appId, parseInt(id)))
        .orderBy(desc(chats.updatedAt));

      return result;
    },
  );

  /**
   * POST /api/apps/:id/chats
   * Create a new chat for an app
   */
  app.post(
    "/:id/chats",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = z
        .object({
          title: z.string().optional(),
          initialCommitHash: z.string().optional(),
        })
        .parse(request.body);

      // Verify user owns the app
      const appResult = await db
        .select({ id: apps.id })
        .from(apps)
        .where(and(eq(apps.id, parseInt(id)), eq(apps.userId, user.userId)))
        .limit(1);

      if (appResult.length === 0) {
        reply.status(404).send({ error: "App not found" });
        return;
      }

      const result = await db
        .insert(chats)
        .values({
          appId: parseInt(id),
          title: body.title,
          initialCommitHash: body.initialCommitHash,
        })
        .returning();

      reply.status(201).send(result[0]);
    },
  );

  // =====================
  // Versions (Git)
  // =====================

  /**
   * GET /api/apps/:id/versions
   * List all versions (git commits) for an app
   */
  app.get(
    "/:id/versions",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      // Verify user owns the app
      const appResult = await db
        .select({ id: apps.id })
        .from(apps)
        .where(and(eq(apps.id, parseInt(id)), eq(apps.userId, user.userId)))
        .limit(1);

      if (appResult.length === 0) {
        reply.status(404).send({ error: "App not found" });
        return;
      }

      // TODO: Implement git version history
      // For now, return empty array - git operations will be added in Phase C
      return [];
    },
  );

  /**
   * GET /api/apps/:id/branch
   * Get current git branch for an app
   */
  app.get(
    "/:id/branch",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      // Verify user owns the app
      const appResult = await db
        .select({ id: apps.id })
        .from(apps)
        .where(and(eq(apps.id, parseInt(id)), eq(apps.userId, user.userId)))
        .limit(1);

      if (appResult.length === 0) {
        reply.status(404).send({ error: "App not found" });
        return;
      }

      // TODO: Implement git branch detection
      // For now, return default branch - git operations will be added in Phase C
      return { name: "main", isDetached: false };
    },
  );

  // =====================
  // App Files
  // =====================

  /**
   * GET /api/apps/:id/files
   * Read a file from an app
   */
  app.get(
    "/:id/files",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const { path: filePath } = request.query as { path: string };

      // Validate id is a valid number
      const appId = parseInt(id);
      if (isNaN(appId)) {
        reply.status(400).send({ error: "Invalid app ID" });
        return;
      }

      if (!filePath) {
        reply.status(400).send({ error: "File path is required" });
        return;
      }

      // Verify user owns the app
      const appResult = await db
        .select({ id: apps.id, path: apps.path })
        .from(apps)
        .where(and(eq(apps.id, appId), eq(apps.userId, user.userId)))
        .limit(1);

      if (appResult.length === 0) {
        reply.status(404).send({ error: "App not found" });
        return;
      }

      const appPath = appResult[0].path;

      // Sanitize file path to prevent directory traversal
      const normalizedFilePath = filePath.replace(/\\/g, "/");
      if (
        normalizedFilePath.includes("..") ||
        normalizedFilePath.startsWith("/")
      ) {
        reply.status(400).send({ error: "Invalid file path" });
        return;
      }

      // Build full path: {APPS_BASE_PATH}/{appPath}/{filePath}
      const basePath = config.APPS_BASE_PATH;
      const resolvedBasePath =
        resolve(basePath) === basePath
          ? basePath
          : resolve(process.cwd(), basePath);
      const fullPath = resolve(resolvedBasePath, appPath, normalizedFilePath);

      // Verify the resolved path is within the app directory (prevent traversal)
      const appDir = resolve(resolvedBasePath, appPath);
      if (!fullPath.startsWith(appDir)) {
        reply.status(400).send({ error: "Invalid file path" });
        return;
      }

      // Try container first (authoritative when running), then fall back to host.
      // readFileFromContainer queries k8s by label directly — no in-memory map dependency.
      const containerPath = `/workspace/${normalizedFilePath}`;
      try {
        const content = await appContainerService.readFileFromContainer(appId, containerPath);
        return { content };
      } catch {
        // No running container or file not in container — fall through to host
      }

      // Fallback: host filesystem (original behavior)
      try {
        const content = readFileSync(fullPath, "utf-8");
        return { content };
      } catch (error: any) {
        if (error.code === "ENOENT") {
          reply.status(404).send({ error: "File not found" });
          return;
        }
        console.error("[apps.routes] Error reading file:", error);
        reply.status(500).send({ error: "Failed to read file" });
        return;
      }
    },
  );

  /**
   * PUT /api/apps/:id/files
   * Edit a file in an app
   */
  app.put(
    "/:id/files",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = z
        .object({
          path: z.string().min(1),
          content: z.string(),
        })
        .parse(request.body);

      // Verify user owns the app
      const appResult = await db
        .select({ id: apps.id, path: apps.path })
        .from(apps)
        .where(and(eq(apps.id, parseInt(id)), eq(apps.userId, user.userId)))
        .limit(1);

      if (appResult.length === 0) {
        reply.status(404).send({ error: "App not found" });
        return;
      }

      // TODO: Implement file writing to app storage
      // For now, return success - file operations will be added in Phase C
      return { success: true };
    },
  );
}
