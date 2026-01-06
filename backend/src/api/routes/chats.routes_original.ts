import { and, desc, eq } from "drizzle-orm";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../../db/index.js";
import { apps, chats, messages } from "../../db/schema.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const updateChatSchema = z.object({
  title: z.string().min(1).max(255).optional(),
});

const createMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  approvalState: z.enum(["approved", "rejected"]).optional(),
  sourceCommitHash: z.string().optional(),
  commitHash: z.string().optional(),
  requestId: z.string().optional(),
  maxTokensUsed: z.number().optional(),
});

export async function chatsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook("preHandler", authMiddleware);

  /**
   * GET /api/chats
   * List all chats for the current user (across all their apps)
   */
  app.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;

    const result = await db
      .select({
        id: chats.id,
        appId: chats.appId,
        title: chats.title,
        createdAt: chats.createdAt,
        initialCommitHash: chats.initialCommitHash,
      })
      .from(chats)
      .innerJoin(apps, eq(chats.appId, apps.id))
      .where(eq(apps.userId, user.userId))
      .orderBy(desc(chats.createdAt));

    return result;
  });

  /**
   * Helper to verify user owns the chat
   */
  async function verifyChatOwnership(
    chatId: number,
    userId: number
  ): Promise<{ chat: typeof chats.$inferSelect } | null> {
    const result = await db
      .select({
        chat: chats,
        appUserId: apps.userId,
      })
      .from(chats)
      .innerJoin(apps, eq(chats.appId, apps.id))
      .where(and(eq(chats.id, chatId), eq(apps.userId, userId)))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return { chat: result[0].chat };
  }

  /**
   * GET /api/chats/:id
   * Get a chat with its messages
   */
  app.get("/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const ownership = await verifyChatOwnership(parseInt(id), user.userId);
    if (!ownership) {
      reply.status(404).send({ error: "Chat not found" });
      return;
    }

    // Get messages for this chat
    const chatMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, parseInt(id)))
      .orderBy(messages.createdAt);

    return {
      ...ownership.chat,
      messages: chatMessages,
    };
  });

  /**
   * PUT /api/chats/:id
   * Update a chat (title)
   */
  app.put("/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = updateChatSchema.parse(request.body);

    const ownership = await verifyChatOwnership(parseInt(id), user.userId);
    if (!ownership) {
      reply.status(404).send({ error: "Chat not found" });
      return;
    }

    const result = await db
      .update(chats)
      .set(body)
      .where(eq(chats.id, parseInt(id)))
      .returning();

    return result[0];
  });

  /**
   * DELETE /api/chats/:id
   * Delete a chat and its messages
   */
  app.delete("/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const ownership = await verifyChatOwnership(parseInt(id), user.userId);
    if (!ownership) {
      reply.status(404).send({ error: "Chat not found" });
      return;
    }

    await db.delete(chats).where(eq(chats.id, parseInt(id)));

    return { success: true };
  });

  /**
   * GET /api/chats/:id/messages
   * Get messages for a chat
   */
  app.get(
    "/:id/messages",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const ownership = await verifyChatOwnership(parseInt(id), user.userId);
      if (!ownership) {
        reply.status(404).send({ error: "Chat not found" });
        return;
      }

      const result = await db
        .select()
        .from(messages)
        .where(eq(messages.chatId, parseInt(id)))
        .orderBy(messages.createdAt);

      return result;
    }
  );

  /**
   * POST /api/chats/:id/messages
   * Add a message to a chat
   */
  app.post(
    "/:id/messages",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = createMessageSchema.parse(request.body);

      const ownership = await verifyChatOwnership(parseInt(id), user.userId);
      if (!ownership) {
        reply.status(404).send({ error: "Chat not found" });
        return;
      }

      const result = await db
        .insert(messages)
        .values({
          chatId: parseInt(id),
          ...body,
        })
        .returning();

      reply.status(201).send(result[0]);
    }
  );

  /**
   * PUT /api/chats/:id/messages/:messageId
   * Update a message (e.g., approval state)
   */
  app.put(
    "/:id/messages/:messageId",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id, messageId } = request.params as {
        id: string;
        messageId: string;
      };
      const body = z
        .object({
          approvalState: z.enum(["approved", "rejected"]).optional(),
          commitHash: z.string().optional(),
        })
        .parse(request.body);

      const ownership = await verifyChatOwnership(parseInt(id), user.userId);
      if (!ownership) {
        reply.status(404).send({ error: "Chat not found" });
        return;
      }

      const result = await db
        .update(messages)
        .set(body)
        .where(
          and(
            eq(messages.id, parseInt(messageId)),
            eq(messages.chatId, parseInt(id))
          )
        )
        .returning();

      if (result.length === 0) {
        reply.status(404).send({ error: "Message not found" });
        return;
      }

      return result[0];
    }
  );

  /**
   * DELETE /api/chats/:id/messages
   * Delete all messages in a chat
   */
  app.delete(
    "/:id/messages",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const ownership = await verifyChatOwnership(parseInt(id), user.userId);
      if (!ownership) {
        reply.status(404).send({ error: "Chat not found" });
        return;
      }

      await db.delete(messages).where(eq(messages.chatId, parseInt(id)));

      return { success: true };
    }
  );

  // =====================
  // Proposals
  // =====================

  /**
   * GET /api/chats/:id/proposal
   * Get the current proposal for a chat (unapproved assistant message)
   */
  app.get(
    "/:id/proposal",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const ownership = await verifyChatOwnership(parseInt(id), user.userId);
      if (!ownership) {
        reply.status(404).send({ error: "Chat not found" });
        return;
      }

      // Get the most recent unapproved assistant message
      const proposalMessages = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.chatId, parseInt(id)),
            eq(messages.role, "assistant")
          )
        )
        .orderBy(desc(messages.createdAt))
        .limit(1);

      if (proposalMessages.length === 0 || proposalMessages[0].approvalState !== null) {
        return { proposal: null };
      }

      return { proposal: proposalMessages[0].content };
    }
  );

  /**
   * POST /api/chats/:id/proposal/approve
   * Approve a proposal (message)
   */
  app.post(
    "/:id/proposal/approve",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = z
        .object({
          messageId: z.number(),
        })
        .parse(request.body);

      const ownership = await verifyChatOwnership(parseInt(id), user.userId);
      if (!ownership) {
        reply.status(404).send({ error: "Chat not found" });
        return;
      }

      const result = await db
        .update(messages)
        .set({ approvalState: "approved" })
        .where(
          and(
            eq(messages.id, body.messageId),
            eq(messages.chatId, parseInt(id))
          )
        )
        .returning();

      if (result.length === 0) {
        reply.status(404).send({ error: "Message not found" });
        return;
      }

      // TODO: Execute the proposal (apply file changes, run commands)
      // This will be implemented in Phase C

      return { success: true };
    }
  );

  /**
   * POST /api/chats/:id/proposal/reject
   * Reject a proposal (message)
   */
  app.post(
    "/:id/proposal/reject",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = z
        .object({
          messageId: z.number(),
        })
        .parse(request.body);

      const ownership = await verifyChatOwnership(parseInt(id), user.userId);
      if (!ownership) {
        reply.status(404).send({ error: "Chat not found" });
        return;
      }

      const result = await db
        .update(messages)
        .set({ approvalState: "rejected" })
        .where(
          and(
            eq(messages.id, body.messageId),
            eq(messages.chatId, parseInt(id))
          )
        )
        .returning();

      if (result.length === 0) {
        reply.status(404).send({ error: "Message not found" });
        return;
      }

      return { success: true };
    }
  );
}
