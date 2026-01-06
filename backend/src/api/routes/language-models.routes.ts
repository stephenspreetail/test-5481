import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { languageModelService } from "../../services/language-model.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const createProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  apiBaseUrl: z.string().url(),
  envVarName: z.string().optional(),
});

const createModelSchema = z.object({
  apiName: z.string().min(1),
  displayName: z.string().min(1),
  providerId: z.string().min(1),
  description: z.string().optional(),
  maxOutputTokens: z.number().optional(),
  contextWindow: z.number().optional(),
});

export async function languageModelsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook("preHandler", authMiddleware);

  /**
   * GET /api/language-models/providers
   * Get all language model providers (cloud, local, and custom)
   */
  app.get(
    "/providers",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const providers = await languageModelService.getProviders(user.userId);
      return providers;
    },
  );

  /**
   * POST /api/language-models/providers
   * Create a custom language model provider
   */
  app.post(
    "/providers",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const body = createProviderSchema.parse(request.body);

      const provider = await languageModelService.createProvider(
        user.userId,
        body,
      );
      reply.status(201).send(provider);
    },
  );

  /**
   * PUT /api/language-models/providers/:id
   * Update a custom language model provider
   */
  app.put(
    "/providers/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = createProviderSchema.omit({ id: true }).parse(request.body);

      const provider = await languageModelService.updateProvider(user.userId, {
        id,
        ...body,
      });
      return provider;
    },
  );

  /**
   * DELETE /api/language-models/providers/:id
   * Delete a custom language model provider
   */
  app.delete(
    "/providers/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      await languageModelService.deleteProvider(user.userId, id);
      return { success: true };
    },
  );

  /**
   * GET /api/language-models/by-providers
   * Get all language models grouped by provider
   */
  app.get(
    "/by-providers",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const modelsByProviders = await languageModelService.getModelsByProviders(
        user.userId,
      );
      return modelsByProviders;
    },
  );

  /**
   * GET /api/language-models/:providerId
   * Get language models for a specific provider
   */
  app.get(
    "/:providerId",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { providerId } = request.params as { providerId: string };

      const models = await languageModelService.getModels(
        user.userId,
        providerId,
      );
      return models;
    },
  );

  /**
   * POST /api/language-models
   * Create a custom language model
   */
  app.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = createModelSchema.parse(request.body);

    await languageModelService.createModel(user.userId, body);
    reply.status(201).send({ success: true });
  });

  /**
   * DELETE /api/language-models/:modelId
   * Delete a custom language model by API name (modelId)
   */
  app.delete(
    "/:modelId",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { modelId } = request.params as { modelId: string };

      await languageModelService.deleteModelByApiName(user.userId, modelId);
      return { success: true };
    },
  );

  /**
   * DELETE /api/language-models/:providerId/:modelApiName
   * Delete a custom model by provider and API name
   */
  app.delete(
    "/:providerId/:modelApiName",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { providerId, modelApiName } = request.params as {
        providerId: string;
        modelApiName: string;
      };

      await languageModelService.deleteModel(
        user.userId,
        providerId,
        modelApiName,
      );
      return { success: true };
    },
  );
}
