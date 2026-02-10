import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import Fastify, { FastifyInstance, FastifyError } from "fastify";
import { config } from "./config/index.js";
import packageJson from "../../package.json" with { type: "json" };

import { agentRoutes } from "./api/routes/agent.routes.js";
import { appExecutionRoutes } from "./api/routes/app-execution.routes.js";
import { appsRoutes } from "./api/routes/apps.routes.js";
// Import routes
import { authRoutes } from "./api/routes/auth.routes.js";
import { chatsRoutes } from "./api/routes/chats.routes.js";
import { workflowAppRoutes } from "./api/routes/workflow-app.routes.js";
import { languageModelsRoutes } from "./api/routes/language-models.routes.js";
import { previewRoutes } from "./api/routes/preview.routes.js";
import { settingsRoutes } from "./api/routes/settings.routes.js";
import { templatesRoutes } from "./api/routes/templates.routes.js";
import { appContainerService } from "./services/app-container.service.js";
import { setupWebSocket } from "./websocket/index.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "info",
      transport:
        config.NODE_ENV !== "production"
          ? {
              target: "pino-pretty",
              options: {
                colorize: true,
              },
            }
          : undefined,
    },
    disableRequestLogging: true,
  });

  // Register plugins
  await app.register(cors, {
    origin: config.CORS_ORIGIN || true,
    credentials: true,
    maxAge: 86400, // Cache preflight responses for 24 hours
  });

  await app.register(cookie);

  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: {
      expiresIn: config.JWT_ACCESS_EXPIRES_IN,
    },
  });

  await app.register(websocket, {
    options: {
      maxPayload: 10 * 1024 * 1024, // 10MB max message size
    },
  });

  // Health check endpoint
  app.get("/health", async () => {
    return { status: "ok", version: packageJson.version, timestamp: new Date().toISOString() };
  });

  // Register API routes
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(appsRoutes, { prefix: "/api/apps" });
  await app.register(appExecutionRoutes, { prefix: "/api/apps" });
  await app.register(chatsRoutes, { prefix: "/api/chats" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.register(languageModelsRoutes, { prefix: "/api/language-models" });
  await app.register(templatesRoutes, { prefix: "/api/templates" });
  await app.register(workflowAppRoutes, { prefix: "/api/workflows" });
  await app.register(agentRoutes, { prefix: "/api/agent" });
  await app.register(previewRoutes, { prefix: "/api/preview" });

  // Initialize app container service (scans existing containers)
  await appContainerService.initialize();

  // Setup WebSocket
  await setupWebSocket(app);

  // Global error handler
  app.setErrorHandler((error: FastifyError, request, reply) => {
    app.log.error(error);

    // Don't expose internal errors in production
    if (config.NODE_ENV === "production" && error.statusCode === undefined) {
      reply.status(500).send({ error: "Internal Server Error" });
    } else {
      reply.status(error.statusCode || 500).send({
        error: error.message,
        ...(config.NODE_ENV !== "production" && { stack: error.stack }),
      });
    }
  });

  // Graceful shutdown hook
  app.addHook("onClose", async () => {
    if (config.NODE_ENV === "development") {
      app.log.info(
        `Shutting down kova-app-container service (${config.NODE_ENV} mode)...`,
      );
      await appContainerService.shutdown();
    } else {
      app.log.info(
        `Don't shutdown kova-app-container services (${config.NODE_ENV} mode)...`,
      );
    }
  });

  return app;
}
