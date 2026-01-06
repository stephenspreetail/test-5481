import { eq } from "drizzle-orm";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../../db/index.js";
import { userSettings } from "../../db/schema.js";
import { secretService } from "../../services/secret.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

// Settings schema matching existing UserSettings type
const settingsSchema = z.object({
  selectedModel: z
    .object({
      name: z.string(),
      provider: z.string(),
    })
    .optional(),
  telemetryConsent: z.enum(["opted_in", "opted_out", "unset"]).optional(),
  telemetryUserId: z.string().optional(),
  hasRunBefore: z.boolean().optional(),
  zoomLevel: z.enum(["90", "100", "110", "125", "150"]).optional(),
  selectedTemplateId: z.string().optional(),
  selectedChatMode: z.enum(["build", "ask", "agent"]).optional(),
  enableAutoFixProblems: z.boolean().optional(),
});

const setSecretSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

export async function settingsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook("preHandler", authMiddleware);

  /**
   * GET /api/settings
   * Get user settings
   */
  app.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;

    const result = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, user.userId))
      .limit(1);

    if (result.length === 0) {
      // Return default settings if none exist
      return {
        telemetryConsent: "unset",
        zoomLevel: "100",
      };
    }

    return result[0].settings;
  });

  /**
   * PATCH /api/settings
   * Update user settings (partial update)
   */
  app.patch("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = settingsSchema.parse(request.body);

    // Get existing settings
    const existing = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, user.userId))
      .limit(1);

    const currentSettings =
      existing.length > 0 ? (existing[0].settings as object) : {};
    const newSettings = { ...currentSettings, ...body };

    if (existing.length === 0) {
      // Create new settings
      await db.insert(userSettings).values({
        userId: user.userId,
        settings: newSettings,
      });
    } else {
      // Update existing settings
      await db
        .update(userSettings)
        .set({
          settings: newSettings,
          updatedAt: new Date(),
        })
        .where(eq(userSettings.userId, user.userId));
    }

    return newSettings;
  });

  // =====================
  // User Secrets (API keys, tokens)
  // =====================

  /**
   * GET /api/settings/secrets
   * List secret keys (not values) for the user
   */
  app.get("/secrets", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const keys = await secretService.listUserSecretKeys(user.userId);
    return { keys };
  });

  /**
   * POST /api/settings/secrets
   * Set a secret for the user
   */
  app.post("/secrets", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = setSecretSchema.parse(request.body);

    await secretService.setUserSecret(user.userId, body.key, body.value);
    return { success: true };
  });

  /**
   * GET /api/settings/secrets/:key
   * Get a specific secret value
   */
  app.get(
    "/secrets/:key",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { key } = request.params as { key: string };

      const value = await secretService.getUserSecret(user.userId, key);

      if (value === null) {
        reply.status(404).send({ error: "Secret not found" });
        return;
      }

      return { key, value };
    }
  );

  /**
   * DELETE /api/settings/secrets/:key
   * Delete a secret
   */
  app.delete(
    "/secrets/:key",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { key } = request.params as { key: string };

      await secretService.deleteUserSecret(user.userId, key);
      return { success: true };
    }
  );

  // =====================
  // Provider-specific settings
  // =====================

  /**
   * POST /api/settings/providers/:providerId/api-key
   * Set API key for a provider
   */
  app.post(
    "/providers/:providerId/api-key",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { providerId } = request.params as { providerId: string };
      const body = z.object({ apiKey: z.string() }).parse(request.body);

      // Store with provider-specific key
      await secretService.setUserSecret(
        user.userId,
        `provider:${providerId}:apiKey`,
        body.apiKey
      );

      return { success: true };
    }
  );

  /**
   * DELETE /api/settings/providers/:providerId/api-key
   * Delete API key for a provider
   */
  app.delete(
    "/providers/:providerId/api-key",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { providerId } = request.params as { providerId: string };

      await secretService.deleteUserSecret(
        user.userId,
        `provider:${providerId}:apiKey`
      );

      return { success: true };
    }
  );

  /**
   * GET /api/settings/providers/:providerId/has-api-key
   * Check if provider has API key set (without revealing the key)
   */
  app.get(
    "/providers/:providerId/has-api-key",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { providerId } = request.params as { providerId: string };

      const value = await secretService.getUserSecret(
        user.userId,
        `provider:${providerId}:apiKey`
      );

      return { hasApiKey: value !== null };
    }
  );

  /**
   * GET /api/settings/providers/:providerId/env-key
   * Check if a provider's API key is set via environment variable
   */
  app.get(
    "/providers/:providerId/env-key",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { providerId } = request.params as { providerId: string };

      const envVarName = PROVIDER_ENV_VARS[providerId];
      if (!envVarName) {
        return { hasEnvKey: false };
      }

      const hasEnvKey = !!process.env[envVarName];
      return { hasEnvKey };
    }
  );

  /**
   * GET /api/settings/env-vars
   * Get environment variable status for all providers (masked values)
   * Returns which env vars are set, but not their actual values for security
   */
  app.get(
    "/env-vars",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result: Record<string, string | undefined> = {};

      for (const [providerId, envVarName] of Object.entries(PROVIDER_ENV_VARS)) {
        const value = process.env[envVarName];
        if (value) {
          // Return masked value to indicate it's set
          result[envVarName] = maskApiKey(value);
        }
      }

      return result;
    }
  );
}

// Map provider IDs to their environment variable names
const PROVIDER_ENV_VARS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  groq: "GROQ_API_KEY",
  xai: "XAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  mistral: "MISTRAL_API_KEY",
  together: "TOGETHER_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  cohere: "COHERE_API_KEY",
  azure: "AZURE_API_KEY",
};

// Azure-specific env vars
const AZURE_ENV_VARS = ["AZURE_API_KEY", "AZURE_RESOURCE_NAME", "AZURE_DEPLOYMENT_NAME"];

function maskApiKey(key: string): string {
  if (key.length < 8) return "****";
  return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
}
