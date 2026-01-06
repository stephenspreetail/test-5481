import { and, count, desc, eq, like, sql } from "drizzle-orm";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../../db/index.js";
import { apps, chats, messages } from "../../db/schema.js";
import { secretService } from "../../services/secret.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const createAppSchema = z.object({
  name: z.string().min(1).max(255),
  installCommand: z.string().optional(),
  startCommand: z.string().optional(),
});

const updateAppSchema = z.object({
  name: z.string().min(1).max(255).optional(),
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

    // Build base query with search filter
    const whereClause = query.search
      ? and(eq(apps.userId, user.userId), like(apps.name, `%${query.search}%`))
      : eq(apps.userId, user.userId);

    // Get all apps
    const appsResult = await db
      .select()
      .from(apps)
      .where(whereClause)
      .orderBy(desc(apps.updatedAt));

    // For each app, get recent chats and stats
    const appsWithDetails = await Promise.all(
      appsResult.map(async (app) => {
        // Get 3 most recent chats
        const recentChats = await db
          .select({
            id: chats.id,
            title: chats.title,
            createdAt: chats.createdAt,
          })
          .from(chats)
          .where(eq(chats.appId, app.id))
          .orderBy(desc(chats.createdAt))
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

        return {
          ...app,
          recentChats,
          chatCount: chatCountResult[0]?.count || 0,
          messageCount: messageCountResult[0]?.count || 0,
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

    const timestamp = Date.now();
    // Insert with temporary path first to get the app ID
    const tempPath = `${user.userId}/temp-${timestamp}`;

    const appResult = await db
      .insert(apps)
      .values({
        userId: user.userId,
        name: body.name,
        path: tempPath,
        installCommand: body.installCommand,
        startCommand: body.startCommand,
      })
      .returning();

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
      .where(and(eq(apps.id, parseInt(id)), eq(apps.userId, user.userId)))
      .limit(1);

    if (result.length === 0) {
      reply.status(404).send({ error: "App not found" });
      return;
    }

    return result[0];
  });

  /**
   * PUT /api/apps/:id
   * Update an app
   */
  app.put("/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = updateAppSchema.parse(request.body);

    const result = await db
      .update(apps)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(and(eq(apps.id, parseInt(id)), eq(apps.userId, user.userId)))
      .returning();

    if (result.length === 0) {
      reply.status(404).send({ error: "App not found" });
      return;
    }

    return result[0];
  });

  /**
   * DELETE /api/apps/:id
   * Delete an app
   */
  app.delete("/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const result = await db
      .delete(apps)
      .where(and(eq(apps.id, parseInt(id)), eq(apps.userId, user.userId)))
      .returning();

    if (result.length === 0) {
      reply.status(404).send({ error: "App not found" });
      return;
    }

    // TODO: Also delete app files from storage

    return { success: true };
  });

  /**
   * POST /api/apps/:id/copy
   * Copy an app
   * Path format: {userId}/{appId}-{timestamp}
   */
  app.post(
    "/:id/copy",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = z
        .object({ name: z.string().optional() })
        .parse(request.body);

      // Get original app
      const original = await db
        .select()
        .from(apps)
        .where(and(eq(apps.id, parseInt(id)), eq(apps.userId, user.userId)))
        .limit(1);

      if (original.length === 0) {
        reply.status(404).send({ error: "App not found" });
        return;
      }

      const originalApp = original[0];
      const newName = body.name || `${originalApp.name} (Copy)`;
      const timestamp = Date.now();
      // Insert with temporary path first to get the app ID
      const tempPath = `${user.userId}/temp-${timestamp}`;

      // Create new app with temporary path
      const insertResult = await db
        .insert(apps)
        .values({
          userId: user.userId,
          name: newName,
          path: tempPath,
          installCommand: originalApp.installCommand,
          startCommand: originalApp.startCommand,
          chatContext: originalApp.chatContext,
        })
        .returning();

      const insertedApp = insertResult[0];

      // Update path to use the actual app ID: {userId}/{appId}-{timestamp}
      const finalPath = `${user.userId}/${insertedApp.id}-${timestamp}`;
      const result = await db
        .update(apps)
        .set({ path: finalPath })
        .where(eq(apps.id, insertedApp.id))
        .returning();

      // TODO: Also copy app files

      reply.status(201).send(result[0]);
    },
  );

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
        .orderBy(desc(chats.createdAt));

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

      // TODO: Implement file reading from app storage
      // For now, return empty content - file operations will be added in Phase C
      return { content: "" };
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
