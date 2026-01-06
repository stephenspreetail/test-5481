/**
 * Language Model Service
 * Handles language model providers and models for web backend
 */

import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { languageModelProviders, languageModels } from "../db/schema.js";
import {
  CLOUD_PROVIDERS,
  CUSTOM_PROVIDER_PREFIX,
  LOCAL_PROVIDERS,
  LanguageModel,
  LanguageModelProvider,
  MODEL_OPTIONS,
  PROVIDER_TO_ENV_VAR,
  isCustomProvider,
} from "../shared/language_model_constants.js";

export interface CreateProviderParams {
  id: string;
  name: string;
  apiBaseUrl: string;
  envVarName?: string;
}

export interface CreateModelParams {
  apiName: string;
  displayName: string;
  providerId: string;
  description?: string;
  maxOutputTokens?: number;
  contextWindow?: number;
}

class LanguageModelService {
  /**
   * Get all language model providers (both hardcoded cloud/local and custom from DB)
   */
  async getProviders(userId: number): Promise<LanguageModelProvider[]> {
    // Fetch custom providers from the database for this user
    const customProvidersDb = await db
      .select()
      .from(languageModelProviders)
      .where(eq(languageModelProviders.userId, userId));

    const customProvidersMap = new Map<string, LanguageModelProvider>();
    for (const cp of customProvidersDb) {
      customProvidersMap.set(cp.id, {
        id: cp.id,
        name: cp.name,
        apiBaseUrl: cp.apiBaseUrl,
        envVarName: cp.envVarName ?? undefined,
        type: "custom",
      });
    }

    // Get hardcoded cloud providers
    const hardcodedProviders: LanguageModelProvider[] = [];
    for (const providerKey in CLOUD_PROVIDERS) {
      if (Object.prototype.hasOwnProperty.call(CLOUD_PROVIDERS, providerKey)) {
        const key = providerKey as keyof typeof CLOUD_PROVIDERS;
        const providerDetails = CLOUD_PROVIDERS[key];
        if (providerDetails) {
          hardcodedProviders.push({
            id: key,
            name: providerDetails.displayName,
            hasFreeTier: providerDetails.hasFreeTier,
            websiteUrl: providerDetails.websiteUrl,
            gatewayPrefix: providerDetails.gatewayPrefix,
            secondary: providerDetails.secondary,
            envVarName: PROVIDER_TO_ENV_VAR[key] ?? undefined,
            type: "cloud",
          });
        }
      }
    }

    for (const providerKey in LOCAL_PROVIDERS) {
      if (Object.prototype.hasOwnProperty.call(LOCAL_PROVIDERS, providerKey)) {
        const key = providerKey as keyof typeof LOCAL_PROVIDERS;
        const providerDetails = LOCAL_PROVIDERS[key];
        hardcodedProviders.push({
          id: key,
          name: providerDetails.displayName,
          hasFreeTier: providerDetails.hasFreeTier,
          type: "local",
        });
      }
    }

    return [...hardcodedProviders, ...customProvidersMap.values()];
  }

  /**
   * Create a custom language model provider
   */
  async createProvider(
    userId: number,
    params: CreateProviderParams
  ): Promise<LanguageModelProvider> {
    const { id, name, apiBaseUrl, envVarName } = params;

    if (!id) throw new Error("Provider ID is required");
    if (!name) throw new Error("Provider name is required");
    if (!apiBaseUrl) throw new Error("API base URL is required");

    const fullId = CUSTOM_PROVIDER_PREFIX + id;

    // Check if a provider with this ID already exists for this user
    const existingProvider = await db
      .select()
      .from(languageModelProviders)
      .where(
        and(
          eq(languageModelProviders.id, fullId),
          eq(languageModelProviders.userId, userId)
        )
      )
      .limit(1);

    if (existingProvider.length > 0) {
      throw new Error(`A provider with ID "${id}" already exists`);
    }

    // Insert the new provider
    await db.insert(languageModelProviders).values({
      id: fullId,
      userId,
      name,
      apiBaseUrl,
      envVarName: envVarName || null,
    });

    return {
      id: fullId,
      name,
      apiBaseUrl,
      envVarName,
      type: "custom",
    };
  }

  /**
   * Update a custom language model provider
   */
  async updateProvider(
    userId: number,
    params: CreateProviderParams
  ): Promise<LanguageModelProvider> {
    const { id, name, apiBaseUrl, envVarName } = params;

    if (!id) throw new Error("Provider ID is required");
    if (!name) throw new Error("Provider name is required");
    if (!apiBaseUrl) throw new Error("API base URL is required");

    const fullId = CUSTOM_PROVIDER_PREFIX + id;

    // Check if the provider exists and belongs to this user
    const existingProvider = await db
      .select()
      .from(languageModelProviders)
      .where(
        and(
          eq(languageModelProviders.id, fullId),
          eq(languageModelProviders.userId, userId)
        )
      )
      .limit(1);

    if (existingProvider.length === 0) {
      throw new Error(`Provider with ID "${id}" not found`);
    }

    // Update the provider
    const result = await db
      .update(languageModelProviders)
      .set({
        name,
        apiBaseUrl,
        envVarName: envVarName || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(languageModelProviders.id, fullId),
          eq(languageModelProviders.userId, userId)
        )
      )
      .returning();

    if (result.length === 0) {
      throw new Error(`Failed to update provider with ID "${id}"`);
    }

    return {
      id: fullId,
      name,
      apiBaseUrl,
      envVarName,
      type: "custom",
    };
  }

  /**
   * Delete a custom language model provider and its associated models
   */
  async deleteProvider(userId: number, providerId: string): Promise<void> {
    if (!providerId) throw new Error("Provider ID is required");

    // Check if the provider exists and belongs to this user
    const existingProvider = await db
      .select()
      .from(languageModelProviders)
      .where(
        and(
          eq(languageModelProviders.id, providerId),
          eq(languageModelProviders.userId, userId)
        )
      )
      .limit(1);

    if (existingProvider.length === 0) {
      // Provider might have already been deleted
      return;
    }

    // Delete associated models first
    await db
      .delete(languageModels)
      .where(
        and(
          eq(languageModels.customProviderId, providerId),
          eq(languageModels.userId, userId)
        )
      );

    // Delete the provider
    await db
      .delete(languageModelProviders)
      .where(
        and(
          eq(languageModelProviders.id, providerId),
          eq(languageModelProviders.userId, userId)
        )
      );
  }

  /**
   * Get language models for a specific provider
   */
  async getModels(userId: number, providerId: string): Promise<LanguageModel[]> {
    const providers = await this.getProviders(userId);
    const provider = providers.find((p) => p.id === providerId);

    if (!provider) {
      console.warn(`Provider with ID "${providerId}" not found.`);
      return [];
    }

    // Get custom models from DB
    let customModels: LanguageModel[] = [];

    try {
      const customModelsDb = await db
        .select()
        .from(languageModels)
        .where(
          and(
            eq(languageModels.userId, userId),
            isCustomProvider(providerId)
              ? eq(languageModels.customProviderId, providerId)
              : eq(languageModels.builtinProviderId, providerId)
          )
        );

      customModels = customModelsDb.map((model) => ({
        id: model.id,
        displayName: model.displayName,
        apiName: model.apiName,
        description: model.description ?? "",
        maxOutputTokens: model.maxOutputTokens ?? undefined,
        contextWindow: model.contextWindow ?? undefined,
        type: "custom" as const,
      }));
    } catch (error) {
      console.error(
        `Error fetching custom models for provider "${providerId}" from DB:`,
        error
      );
    }

    // If it's a cloud provider, also get the hardcoded models
    let hardcodedModels: LanguageModel[] = [];
    if (provider.type === "cloud") {
      if (providerId in MODEL_OPTIONS) {
        const models = MODEL_OPTIONS[providerId] || [];
        hardcodedModels = models.map((model) => ({
          ...model,
          apiName: model.name,
          type: "cloud" as const,
        }));
      }
    }

    return [...hardcodedModels, ...customModels];
  }

  /**
   * Get all language models grouped by provider
   */
  async getModelsByProviders(
    userId: number
  ): Promise<Record<string, LanguageModel[]>> {
    const providers = await this.getProviders(userId);

    // Fetch models for all non-local providers concurrently
    const modelPromises = providers
      .filter((p) => p.type !== "local")
      .map(async (provider) => {
        const models = await this.getModels(userId, provider.id);
        return { providerId: provider.id, models };
      });

    const results = await Promise.all(modelPromises);

    const record: Record<string, LanguageModel[]> = {};
    for (const result of results) {
      record[result.providerId] = result.models;
    }

    return record;
  }

  /**
   * Create a custom language model
   */
  async createModel(userId: number, params: CreateModelParams): Promise<void> {
    const {
      apiName,
      displayName,
      providerId,
      description,
      maxOutputTokens,
      contextWindow,
    } = params;

    if (!apiName) throw new Error("Model API name is required");
    if (!displayName) throw new Error("Model display name is required");
    if (!providerId) throw new Error("Provider ID is required");

    // Check if provider exists
    const providers = await this.getProviders(userId);
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) {
      throw new Error(`Provider with ID "${providerId}" not found`);
    }

    // Insert the new model
    await db.insert(languageModels).values({
      userId,
      displayName,
      apiName,
      builtinProviderId: provider.type === "cloud" ? providerId : undefined,
      customProviderId: provider.type === "custom" ? providerId : undefined,
      description: description || null,
      maxOutputTokens: maxOutputTokens || null,
      contextWindow: contextWindow || null,
    });
  }

  /**
   * Delete a custom language model by API name
   */
  async deleteModelByApiName(userId: number, apiName: string): Promise<void> {
    if (!apiName) throw new Error("Model API name is required");

    const existingModel = await db
      .select()
      .from(languageModels)
      .where(
        and(
          eq(languageModels.apiName, apiName),
          eq(languageModels.userId, userId)
        )
      )
      .limit(1);

    if (existingModel.length === 0) {
      throw new Error(`A model with API name "${apiName}" was not found`);
    }

    await db
      .delete(languageModels)
      .where(
        and(
          eq(languageModels.apiName, apiName),
          eq(languageModels.userId, userId)
        )
      );
  }

  /**
   * Delete a custom model by provider ID and API name
   */
  async deleteModel(
    userId: number,
    providerId: string,
    modelApiName: string
  ): Promise<void> {
    if (!providerId || !modelApiName) {
      throw new Error("Provider ID and Model API Name are required.");
    }

    const providers = await this.getProviders(userId);
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) {
      throw new Error(`Provider with ID "${providerId}" not found`);
    }
    if (provider.type === "local") {
      throw new Error("Local models cannot be deleted");
    }

    await db
      .delete(languageModels)
      .where(
        and(
          eq(languageModels.userId, userId),
          eq(languageModels.apiName, modelApiName),
          provider.type === "cloud"
            ? eq(languageModels.builtinProviderId, providerId)
            : eq(languageModels.customProviderId, providerId)
        )
      );
  }
}

export const languageModelService = new LanguageModelService();
