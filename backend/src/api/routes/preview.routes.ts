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
      // doesn't resolve in Bun/Node on Windows) or devUrl (port not exposed).
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
