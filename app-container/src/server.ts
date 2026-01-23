/**
 * App Container Server
 * Main entry point that runs:
 * - Agent Server on port 3100 (Claude Agent SDK)
 * - Dev Server on port 3000 (user's app)
 *
 * Note: Data Catalog MCP server runs in-process with the agent (no separate port)
 */

import Fastify from "fastify";
import { cpSync, existsSync, readdirSync } from "node:fs";
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
- React 18 with TypeScript
- Vite as the build tool
- Tailwind CSS for styling

IMPORTANT: The dev server starts AUTOMATICALLY after you create the app files. Do NOT run "npm run dev" or start the server manually.

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
 * Recursively list directory contents for debugging
 */
function listDirRecursive(dir: string, prefix = ""): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(`${prefix}${entry.name}/`);
        results.push(...listDirRecursive(fullPath, `${prefix}  `));
      } else {
        results.push(`${prefix}${entry.name}`);
      }
    }
  } catch (error) {
    results.push(`${prefix}[ERROR reading dir: ${error}]`);
  }
  return results;
}

/**
 * Copy bundled skills to project .claude/skills directory
 * This directory uses a named volume mount, so we can write to it
 * without the permission issues of the bind-mounted workspace
 */
function copySkillsToProjectDir() {
  const bundledSkillsDir = "/app/skills";
  const projectSkillsDir = join(WORKSPACE_DIR, ".claude", "skills");

  log.log(`[SKILLS] Bundled skills dir: ${bundledSkillsDir}`);
  log.log(`[SKILLS] Project skills dir: ${projectSkillsDir}`);

  if (!existsSync(bundledSkillsDir)) {
    log.log("[SKILLS] No bundled skills directory found, skipping skill setup");
    return;
  }

  // Log bundled skills contents
  log.log("[SKILLS] Bundled skills:");
  const bundledContents = listDirRecursive(bundledSkillsDir);
  for (const line of bundledContents) {
    log.log(`  ${line}`);
  }

  // Copy to project directory (/workspace/.claude/skills/)
  // This now uses a named volume, so permissions should work
  try {
    cpSync(bundledSkillsDir, projectSkillsDir, { recursive: true });
    log.log(`[SKILLS] Copied skills to project dir: ${projectSkillsDir}`);

    // Verify copy
    log.log("[SKILLS] Project skills after copy:");
    const projectContents = listDirRecursive(projectSkillsDir);
    for (const line of projectContents) {
      log.log(`  ${line}`);
    }
  } catch (error) {
    log.error("[SKILLS] Failed to copy skills to project dir:", error);
  }
}

/**
 * Main startup function
 */
async function main() {
  try {
    log.log(`Starting for app ${APP_ID}`);
    log.log(`Workspace: ${WORKSPACE_DIR}`);
    log.log(`Agent port: ${AGENT_PORT}`);
    log.log(`Dev server port: ${DEV_SERVER_PORT}`);

    // Copy bundled skills to project directory (uses named volume mount)
    copySkillsToProjectDir();

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
