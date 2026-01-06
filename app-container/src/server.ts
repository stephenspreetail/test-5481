/**
 * App Container Server
 * Main entry point that runs:
 * - Agent Server on port 3100 (Claude Agent SDK)
 * - Dev Server on port 3000 (user's app)
 */

import Fastify from "fastify";
import { streamQuery } from "./agent.js";
import { DevServerManager } from "./dev-server.js";
import type { HealthResponse, QueryRequest, SystemPromptConfig } from "./types.js";
import { DEFAULT_TOOLS } from "./types.js";

// Configuration from environment
const AGENT_PORT = parseInt(process.env.AGENT_PORT || "3100");
const DEV_SERVER_PORT = parseInt(process.env.DEV_SERVER_PORT || "3000");
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || "/workspace";
const APP_ID = process.env.APP_ID || "unknown";

// Default system prompt config using preset with append
const DEFAULT_SYSTEM_PROMPT_CONFIG: SystemPromptConfig = {
  type: "preset",
  preset: "claude_code",
  append: `You are Kova, an AI app builder creating modern web applications.

Tech stack preferences:
- React 19 with TypeScript
- Vite as the build tool
- Tailwind CSS for styling

Use relative file paths from the workspace root.
Build complete, working applications without asking unnecessary questions.`,
};

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
  };
});

/**
 * Query endpoint - executes Claude Agent SDK
 * Returns Server-Sent Events stream
 */
app.post<{ Body: QueryRequest }>("/query", async (request, reply) => {
  const { prompt, sessionId, chatId, allowedTools, systemPrompt } = request.body;

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
    request.log.info({ chatId, sessionId, prompt: prompt.substring(0, 100) }, "Starting agent query");

    for await (const event of streamQuery(prompt, {
      cwd: WORKSPACE_DIR,
      sessionId,
      allowedTools: allowedTools || (DEFAULT_TOOLS as unknown as string[]),
      systemPrompt: systemPrompt || DEFAULT_SYSTEM_PROMPT_CONFIG,
    })) {
      sendEvent(event.type, event);
    }

    request.log.info({ chatId }, "Agent query completed");
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
      error: error instanceof Error ? error.message : "Failed to start dev server",
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
      error: error instanceof Error ? error.message : "Failed to stop dev server",
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
      error: error instanceof Error ? error.message : "Failed to restart dev server",
    });
  }
});

/**
 * Main startup function
 */
async function main() {
  try {
    console.log(`[AppContainer] Starting for app ${APP_ID}`);
    console.log(`[AppContainer] Workspace: ${WORKSPACE_DIR}`);
    console.log(`[AppContainer] Agent port: ${AGENT_PORT}`);
    console.log(`[AppContainer] Dev server port: ${DEV_SERVER_PORT}`);

    // Start the agent server
    await app.listen({ port: AGENT_PORT, host: "0.0.0.0" });
    console.log(`[AppContainer] Agent server listening on port ${AGENT_PORT}`);

    // Start the dev server (if workspace has a package.json)
    await devServerManager.start();

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`[AppContainer] Received ${signal}, shutting down...`);
      await devServerManager.stop();
      await app.close();
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("[AppContainer] Failed to start:", error);
    process.exit(1);
  }
}

main();
