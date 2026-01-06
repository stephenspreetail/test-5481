import { and, desc, eq } from "drizzle-orm";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../../db/index.js";
import { prompts } from "../../db/schema.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const createPromptSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  content: z.string().min(1),
});

const updatePromptSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  content: z.string().min(1).optional(),
});

export async function promptsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook("preHandler", authMiddleware);

  /**
   * GET /api/prompts
   * List all prompts for the user
   */
  app.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;

    const result = await db
      .select()
      .from(prompts)
      .where(eq(prompts.userId, user.userId))
      .orderBy(desc(prompts.updatedAt));

    return result;
  });

  /**
   * POST /api/prompts
   * Create a new prompt
   */
  app.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = createPromptSchema.parse(request.body);

    const result = await db
      .insert(prompts)
      .values({
        userId: user.userId,
        title: body.title,
        description: body.description,
        content: body.content,
      })
      .returning();

    reply.status(201).send(result[0]);
  });

  /**
   * GET /api/prompts/:id
   * Get a single prompt
   */
  app.get("/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const result = await db
      .select()
      .from(prompts)
      .where(and(eq(prompts.id, parseInt(id)), eq(prompts.userId, user.userId)))
      .limit(1);

    if (result.length === 0) {
      reply.status(404).send({ error: "Prompt not found" });
      return;
    }

    return result[0];
  });

  /**
   * PUT /api/prompts/:id
   * Update a prompt
   */
  app.put("/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = updatePromptSchema.parse(request.body);

    const result = await db
      .update(prompts)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(and(eq(prompts.id, parseInt(id)), eq(prompts.userId, user.userId)))
      .returning();

    if (result.length === 0) {
      reply.status(404).send({ error: "Prompt not found" });
      return;
    }

    return result[0];
  });

  /**
   * DELETE /api/prompts/:id
   * Delete a prompt
   */
  app.delete("/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const result = await db
      .delete(prompts)
      .where(and(eq(prompts.id, parseInt(id)), eq(prompts.userId, user.userId)))
      .returning();

    if (result.length === 0) {
      reply.status(404).send({ error: "Prompt not found" });
      return;
    }

    return { success: true };
  });
}
