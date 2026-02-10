import { and, eq } from "drizzle-orm";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { db } from "../../db/index.js";
import { apps } from "../../db/schema.js";
import { appContainerService } from "../../services/app-container.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

export async function previewRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook("preHandler", authMiddleware);

  /**
   * GET /api/preview/:appId/health
   * Check if the preview URL is ready (returns actual HTTP status)
   * This endpoint helps the frontend determine when the preview is ready
   * without CORS issues.
   */
  app.get(
    "/:appId/health",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { appId } = request.params as { appId: string };

      // Verify user owns the app
      const appResult = await db
        .select({ id: apps.id })
        .from(apps)
        .where(and(eq(apps.id, parseInt(appId)), eq(apps.userId, user.userId)))
        .limit(1);

      if (appResult.length === 0) {
        reply.status(404).send({ error: "App not found" });
        return;
      }

      // Get container status
      const containerPorts = appContainerService.getContainerPorts(
        parseInt(appId),
      );

      if (!containerPorts) {
        return { ready: false, status: 503, reason: "container_not_running" };
      }

      // Check dev server status via the container's agent health endpoint
      // (port 3100, mapped to host). We can't use previewUrl (*.localhost DNS
      // doesn't resolve in Bun/Node on Windows).
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`${containerPorts.agentUrl}/health`, {
          signal: controller.signal,
        });

        const health = await response.json() as { status: string; devServer?: string; servingPlaceholder?: boolean };

        if (health.devServer === "running" && !health.servingPlaceholder) {
          return { ready: true, status: 200 };
        }

        return { ready: false, status: 503, reason: `devServer: ${health.devServer}` };
      } catch (error: any) {
        // Agent server not reachable
        return { ready: false, status: 0, reason: error.message || "network_error" };
      } finally {
        clearTimeout(timeout);
      }
    },
  );

  /**
   * GET /api/preview/:appId/status
   * Get the container status for preview
   */
  app.get(
    "/:appId/status",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { appId } = request.params as { appId: string };

      // Verify user owns the app
      const appResult = await db
        .select({ id: apps.id, path: apps.path })
        .from(apps)
        .where(and(eq(apps.id, parseInt(appId)), eq(apps.userId, user.userId)))
        .limit(1);

      if (appResult.length === 0) {
        reply.status(404).send({ error: "App not found" });
        return;
      }

      const status = await appContainerService.getContainerStatus(
        parseInt(appId),
      );

      return {
        state: status.state,
        previewUrl: status.ports?.previewUrl,
      };
    },
  );

  /**
   * POST /api/preview/:appId/start
   * Start the container for preview
   */
  app.post(
    "/:appId/start",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { appId } = request.params as { appId: string };

      // Verify user owns the app
      const appResult = await db
        .select({ id: apps.id, path: apps.path })
        .from(apps)
        .where(and(eq(apps.id, parseInt(appId)), eq(apps.userId, user.userId)))
        .limit(1);

      if (appResult.length === 0) {
        reply.status(404).send({ error: "App not found" });
        return;
      }

      try {
        const ports = await appContainerService.startContainer({
          appId: parseInt(appId),
          userId: user.userId,
          appPath: appResult[0].path,
        });

        return {
          state: "running",
          previewUrl: ports.previewUrl,
        };
      } catch (error: any) {
        reply.status(500).send({ error: error.message });
      }
    },
  );

  /**
   * POST /api/preview/:appId/stop
   * Stop the container
   */
  app.post(
    "/:appId/stop",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { appId } = request.params as { appId: string };

      // Verify user owns the app
      const appResult = await db
        .select({ id: apps.id })
        .from(apps)
        .where(and(eq(apps.id, parseInt(appId)), eq(apps.userId, user.userId)))
        .limit(1);

      if (appResult.length === 0) {
        reply.status(404).send({ error: "App not found" });
        return;
      }

      await appContainerService.stopContainer(parseInt(appId));

      return { state: "stopped" };
    },
  );
}
