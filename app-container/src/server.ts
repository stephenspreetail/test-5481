/**
 * App Container Server
 * Main entry point that runs:
 * - Agent Server on port 3100 (Claude Agent SDK)
 * - Dev Server on port 3000 (user's app)
 *
 * Note: Data Catalog MCP server runs in-process with the agent (no separate port)
 */

import Fastify from "fastify";
import { join } from "node:path";
import { streamQuery } from "./agent.js";
import { DevServerManager } from "./dev-server.js";
import { appContainerLog as log } from "./logger.js";
import type {
  HealthResponse,
  QueryRequest,
  SystemPromptConfig,
} from "./types.js";
import { DEFAULT_TOOLS } from "./types.js";
import { extendKovaAgentPrompt } from "@kova/agent";

// Configuration from environment
const AGENT_PORT = parseInt(process.env.AGENT_PORT || "3100");
const DEV_SERVER_PORT = parseInt(process.env.DEV_SERVER_PORT || "3000");
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || "/workspace";
const APP_ID = process.env.APP_ID || "unknown";

// Default system prompt: Kova agent prompt + container-specific instructions
const DEFAULT_SYSTEM_PROMPT_CONFIG = extendKovaAgentPrompt(
  `IMPORTANT: The dev server starts AUTOMATICALLY after you create the app files. Do NOT run "npm run dev" or start the server manually.`
);

// Initialize Fastify
const app = Fastify({
  logger: true,
});

// Initialize dev server manager
const devServerManager = new DevServerManager(WORKSPACE_DIR, DEV_SERVER_PORT);

/**
 * Health check endpoint
 */
app.get<{ Reply: HealthResponse }>("/health", async () => {
  return {
    status: "ok",
    devServer: devServerManager.getStatus(),
    servingPlaceholder: devServerManager.isServingPlaceholder(),
  };
});

/**
 * Query endpoint - executes Claude Agent SDK
 * Returns Server-Sent Events stream
 */
app.post<{ Body: QueryRequest }>("/query", async (request, reply) => {
  const { prompt, sessionId, chatId, allowedTools, systemPrompt } =
    request.body;

  if (!prompt) {
    reply.status(400).send({ error: "prompt is required" });
    return;
  }

  // Set up SSE response
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const sendEvent = (event: string, data: unknown) => {
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    request.log.info(
      { chatId, sessionId, prompt: prompt.substring(0, 100) },
      "Starting agent query",
    );

    for await (const event of streamQuery(prompt, {
      cwd: WORKSPACE_DIR,
      sessionId,
      allowedTools: allowedTools || (DEFAULT_TOOLS as unknown as string[]),
      systemPrompt: systemPrompt || DEFAULT_SYSTEM_PROMPT_CONFIG,
    })) {
      sendEvent(event.type, event);
    }

    request.log.info({ chatId }, "Agent query completed");

    // After agent query completes, check if content is now available
    // This auto-switches from placeholder to real app when agent creates servable content
    if (devServerManager.isServingPlaceholder()) {
      const switched = await devServerManager.checkAndRestartIfContentAvailable();
      if (switched) {
        request.log.info({ chatId }, "Switched from placeholder to real app content");
      }
    }
  } catch (error) {
    request.log.error({ error, chatId }, "Agent query error");
    sendEvent("error", {
      type: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    reply.raw.end();
  }
});

/**
 * Start the dev server manually (if not auto-started)
 */
app.post("/dev-server/start", async (request, reply) => {
  try {
    await devServerManager.start();
    return { success: true, status: devServerManager.getStatus() };
  } catch (error) {
    reply.status(500).send({
      error:
        error instanceof Error ? error.message : "Failed to start dev server",
    });
  }
});

/**
 * Stop the dev server
 */
app.post("/dev-server/stop", async (request, reply) => {
  try {
    await devServerManager.stop();
    return { success: true, status: devServerManager.getStatus() };
  } catch (error) {
    reply.status(500).send({
      error:
        error instanceof Error ? error.message : "Failed to stop dev server",
    });
  }
});

/**
 * Restart the dev server
 */
app.post("/dev-server/restart", async (request, reply) => {
  try {
    await devServerManager.restart();
    return { success: true, status: devServerManager.getStatus() };
  } catch (error) {
    reply.status(500).send({
      error:
        error instanceof Error ? error.message : "Failed to restart dev server",
    });
  }
});

/**
 * Check if real content is available and switch from placeholder if so
 * Call this after agent makes changes that might create servable content
 */
app.post("/dev-server/check-content", async (request, reply) => {
  try {
    const wasServingPlaceholder = devServerManager.isServingPlaceholder();
    const restarted = await devServerManager.checkAndRestartIfContentAvailable();
    return {
      success: true,
      wasServingPlaceholder,
      restarted,
      status: devServerManager.getStatus(),
      servingPlaceholder: devServerManager.isServingPlaceholder(),
    };
  } catch (error) {
    reply.status(500).send({
      error:
        error instanceof Error ? error.message : "Failed to check content",
    });
  }
});


/**
 * Main startup function
 */
async function main() {
  try {
    log.log(`Starting for app ${APP_ID}`);
    log.log(`Workspace: ${WORKSPACE_DIR}`);
    log.log(`Agent port: ${AGENT_PORT}`);
    log.log(`Dev server port: ${DEV_SERVER_PORT}`);

    // Note: Skills are automatically copied to project by kovaQuery when first query runs

    // Start the agent server
    await app.listen({ port: AGENT_PORT, host: "0.0.0.0" });
    log.log(`Agent server listening on port ${AGENT_PORT}`);

    // Start the dev server (if workspace has a package.json)
    await devServerManager.start();

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      log.log(`========== CONTAINER SHUTDOWN ==========`);
      log.log(`Received ${signal}`);
      if (signal === "SIGTERM") {
        log.log(`SIGTERM typically means IDLE TIMEOUT - container was inactive`);
      } else if (signal === "SIGINT") {
        log.log(`SIGINT means manual interrupt (Ctrl+C)`);
      }
      log.log(`Shutting down gracefully...`);
      log.log(`========================================`);
      await devServerManager.stop();
      await app.close();
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    log.error("Failed to start:", error);
    process.exit(1);
  }
}

main();
