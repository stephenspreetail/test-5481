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
   * GET /api/preview/:appId/*
   * Proxy requests to the app container's dev server
   */
  app.get("/:appId/*", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { appId } = request.params as { appId: string };
    const path = (request.params as { "*": string })["*"] || "";

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

    // Get container status
    const containerPorts = await appContainerService.getContainerPorts(
      parseInt(appId),
    );

    if (!containerPorts) {
      reply.status(503).send({ error: "App container not running" });
      return;
    }

    // Record preview activity to reset idle timer
    appContainerService.recordActivity(parseInt(appId), "preview");

    // Proxy the request to the container's dev server
    const targetUrl = `${containerPorts.devUrl}/${path}`;

    try {
      const response = await fetch(targetUrl, {
        method: "GET",
        headers: {
          // Forward relevant headers
          Accept: request.headers.accept || "*/*",
          "Accept-Encoding":
            request.headers["accept-encoding"] || "gzip, deflate",
        },
      });

      // Forward status code
      reply.status(response.status);

      // Forward content type
      const contentType = response.headers.get("content-type");
      if (contentType) {
        reply.header("Content-Type", contentType);
      }

      // Stream the response body
      if (response.body) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        // Concatenate all chunks
        const totalLength = chunks.reduce(
          (acc, chunk) => acc + chunk.length,
          0,
        );
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }

        return reply.send(Buffer.from(result));
      }

      return reply.send();
    } catch (error: any) {
      console.error(
        `[Preview] Failed to proxy request to ${targetUrl}:`,
        error,
      );
      reply.status(502).send({ error: "Failed to connect to app container" });
    }
  });

  /**
   * POST /api/preview/:appId/*
   * Proxy POST requests to the app container's dev server
   */
  app.post(
    "/:appId/*",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { appId } = request.params as { appId: string };
      const path = (request.params as { "*": string })["*"] || "";

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
      const containerPorts = await appContainerService.getContainerPorts(
        parseInt(appId),
      );

      if (!containerPorts) {
        reply.status(503).send({ error: "App container not running" });
        return;
      }

      // Record preview activity
      appContainerService.recordActivity(parseInt(appId), "preview");

      const targetUrl = `${containerPorts.devUrl}/${path}`;

      try {
        const response = await fetch(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type":
              request.headers["content-type"] || "application/json",
            Accept: request.headers.accept || "*/*",
          },
          body: JSON.stringify(request.body),
        });

        reply.status(response.status);

        const contentType = response.headers.get("content-type");
        if (contentType) {
          reply.header("Content-Type", contentType);
        }

        const text = await response.text();
        return reply.send(text);
      } catch (error: any) {
        console.error(
          `[Preview] Failed to proxy POST request to ${targetUrl}:`,
          error,
        );
        reply.status(502).send({ error: "Failed to connect to app container" });
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
        devUrl: status.ports?.devUrl,
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
          devUrl: ports.devUrl,
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
