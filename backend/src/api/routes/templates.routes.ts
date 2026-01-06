import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { templatesService } from "../../services/templates.service.js";

export async function templatesRoutes(app: FastifyInstance) {
  /**
   * GET /api/templates
   * Get all templates (local + API)
   * Note: This endpoint doesn't require authentication
   */
  app.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const templates = await templatesService.getTemplates();
    return templates;
  });

  /**
   * GET /api/templates/:id
   * Get a specific template by ID
   */
  app.get("/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      const template = await templatesService.getTemplate(id);
      return template;
    } catch (error) {
      reply.status(404).send({ error: (error as Error).message });
    }
  });
}
