import { and, eq } from "drizzle-orm";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../../config/index.js";
import { db } from "../../db/index.js";
import { apps } from "../../db/schema.js";
import { appContainerService } from "../../services/app-container.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

export async function appExecutionRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook("preHandler", authMiddleware);

  /**
   * POST /api/apps/:id/run
   * Start an app in a Docker container
   */
  app.post("/:id/run", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    // Get app details
    const appResult = await db
      .select()
      .from(apps)
      .where(and(eq(apps.id, parseInt(id)), eq(apps.userId, user.userId)))
      .limit(1);

    if (appResult.length === 0) {
      reply.status(404).send({ error: "App not found" });
      return;
    }

    const appData = appResult[0];

    try {
      const result = await appContainerService.startContainer({
        appId: appData.id,
        userId: user.userId,
        appPath: appData.path,
      });

      return {
        success: true,
        containerId: appContainerService.getContainerStatus(appData.id).ports?.agentPort ? `app-${appData.id}` : "",
        port: result.agentPort,
        url: result.previewUrl,
      };
    } catch (error: any) {
      reply.status(500).send({ error: error.message });
    }
  });

  /**
   * POST /api/apps/:id/stop
   * Stop a running app container
   */
  app.post("/:id/stop", async (request: FastifyRequest, reply: FastifyReply) => {
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

    try {
      await appContainerService.stopContainer(parseInt(id));
      return { success: true };
    } catch (error: any) {
      reply.status(500).send({ error: error.message });
    }
  });

  /**
   * POST /api/apps/:id/restart
   * Restart an app container
   */
  app.post(
    "/:id/restart",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      // Get app details
      const appResult = await db
        .select()
        .from(apps)
        .where(and(eq(apps.id, parseInt(id)), eq(apps.userId, user.userId)))
        .limit(1);

      if (appResult.length === 0) {
        reply.status(404).send({ error: "App not found" });
        return;
      }

      const appData = appResult[0];

      try {
        // Stop existing container first
        await appContainerService.stopContainer(parseInt(id));

        // Start new container
        const result = await appContainerService.startContainer({
          appId: appData.id,
          userId: user.userId,
          appPath: appData.path,
        });

        return {
          success: true,
          containerId: `app-${appData.id}`,
          port: result.agentPort,
          url: result.previewUrl,
        };
      } catch (error: any) {
        reply.status(500).send({ error: error.message });
      }
    }
  );

  /**
   * GET /api/apps/:id/status
   * Get the running status of an app
   */
  app.get(
    "/:id/status",
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

      const containerStatus = appContainerService.getContainerStatus(parseInt(id));
      return {
        status: containerStatus.state === "running" ? "running" : "stopped",
        port: containerStatus.ports?.agentPort,
        url: containerStatus.ports?.previewUrl,
      };
    }
  );
}
