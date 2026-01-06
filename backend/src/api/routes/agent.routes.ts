import { and, eq } from "drizzle-orm";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../../db/index.js";
import { apps } from "../../db/schema.js";
import {
  AVAILABLE_TOOLS,
  TOOL_PRESETS,
  agentService,
} from "../../services/agent.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const querySchema = z.object({
  prompt: z.string().min(1),
  appId: z.number().optional(),
  sessionId: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  maxBudgetUsd: z.number().optional(),
  systemPrompt: z.string().optional(),
});

const resumeSchema = z.object({
  sessionId: z.string().min(1),
  prompt: z.string().min(1),
  appId: z.number().optional(),
  allowedTools: z.array(z.string()).optional(),
});

const forkSchema = z.object({
  sessionId: z.string().min(1),
  prompt: z.string().min(1),
  appId: z.number().optional(),
  allowedTools: z.array(z.string()).optional(),
});

export async function agentRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook("preHandler", authMiddleware);

  /**
   * POST /api/agent/query
   * Execute a single-turn agent query (waits for completion)
   */
  app.post("/query", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = querySchema.parse(request.body);

    // Get app path if appId provided
    let cwd: string | undefined;
    if (body.appId) {
      const appResult = await db
        .select()
        .from(apps)
        .where(and(eq(apps.id, body.appId), eq(apps.userId, user.userId)))
        .limit(1);

      if (appResult.length === 0) {
        reply.status(404).send({ error: "App not found" });
        return;
      }
      cwd = appResult[0].path || undefined;
    }

    try {
      const result = await agentService.executeQuery(body.prompt, {
        cwd,
        sessionId: body.sessionId,
        allowedTools: body.allowedTools,
        maxBudgetUsd: body.maxBudgetUsd,
        systemPrompt: body.systemPrompt,
      });

      return {
        success: true,
        sessionId: result.sessionId,
        result: result.result,
        costUsd: result.costUsd,
        durationMs: result.durationMs,
      };
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * POST /api/agent/session/resume
   * Resume a previous session with a new prompt
   */
  app.post(
    "/session/resume",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const body = resumeSchema.parse(request.body);

      // Get app path if appId provided
      let cwd: string | undefined;
      if (body.appId) {
        const appResult = await db
          .select()
          .from(apps)
          .where(and(eq(apps.id, body.appId), eq(apps.userId, user.userId)))
          .limit(1);

        if (appResult.length === 0) {
          reply.status(404).send({ error: "App not found" });
          return;
        }
        cwd = appResult[0].path || undefined;
      }

      try {
        let result = "";
        let costUsd: number | undefined;
        let durationMs: number | undefined;

        for await (const event of agentService.resumeSession(
          body.sessionId,
          body.prompt,
          { cwd, allowedTools: body.allowedTools },
        )) {
          if (event.type === "result") {
            result = event.result || "";
            costUsd = event.costUsd;
            durationMs = event.durationMs;
          }
          if (event.type === "error") {
            throw new Error(event.error);
          }
        }

        return {
          success: true,
          sessionId: body.sessionId,
          result,
          costUsd,
          durationMs,
        };
      } catch (error) {
        reply.status(500).send({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  /**
   * POST /api/agent/session/fork
   * Fork a session to explore alternatives
   */
  app.post(
    "/session/fork",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const body = forkSchema.parse(request.body);

      // Get app path if appId provided
      let cwd: string | undefined;
      if (body.appId) {
        const appResult = await db
          .select()
          .from(apps)
          .where(and(eq(apps.id, body.appId), eq(apps.userId, user.userId)))
          .limit(1);

        if (appResult.length === 0) {
          reply.status(404).send({ error: "App not found" });
          return;
        }
        cwd = appResult[0].path || undefined;
      }

      try {
        let newSessionId: string | undefined;
        let result = "";
        let costUsd: number | undefined;
        let durationMs: number | undefined;

        for await (const event of agentService.forkSession(
          body.sessionId,
          body.prompt,
          { cwd, allowedTools: body.allowedTools },
        )) {
          if (event.type === "session_init") {
            newSessionId = event.sessionId;
          }
          if (event.type === "result") {
            result = event.result || "";
            costUsd = event.costUsd;
            durationMs = event.durationMs;
          }
          if (event.type === "error") {
            throw new Error(event.error);
          }
        }

        return {
          success: true,
          originalSessionId: body.sessionId,
          newSessionId,
          result,
          costUsd,
          durationMs,
        };
      } catch (error) {
        reply.status(500).send({
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  /**
   * GET /api/agent/tools
   * Get list of available tools and presets
   */
  app.get("/tools", async () => {
    return {
      tools: [
        {
          name: "Read",
          description: "Read any file in the working directory",
        },
        {
          name: "Write",
          description: "Create new files",
        },
        {
          name: "Edit",
          description: "Make precise edits to existing files",
        },
        {
          name: "Glob",
          description: "Find files by pattern (e.g., **/*.ts, src/**/*.py)",
        },
        {
          name: "Grep",
          description: "Search file contents with regex",
        },
        {
          name: "Bash",
          description: "Run terminal commands, scripts, git operations",
        },
        {
          name: "WebSearch",
          description: "Search the web for current information",
        },
        {
          name: "WebFetch",
          description: "Fetch and parse web page content",
        },
        {
          name: "Task",
          description: "Spawn specialized subagents for focused subtasks",
        },
      ],
      availableTools: AVAILABLE_TOOLS,
      presets: {
        readOnly: {
          description: "Read-only tools for analysis",
          tools: TOOL_PRESETS.readOnly,
        },
        codeEdit: {
          description: "Tools for code editing",
          tools: TOOL_PRESETS.codeEdit,
        },
        all: {
          description: "All available tools",
          tools: TOOL_PRESETS.all,
        },
        webEnabled: {
          description: "Tools with web access",
          tools: TOOL_PRESETS.webEnabled,
        },
      },
    };
  });
}
