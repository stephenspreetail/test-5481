import type {
  AppChatContext,
  ChatSummary,
  ContextPathResults,
  UserSettings,
} from "@/lib/schemas";
import type { Template } from "@/shared/templates";
import type {
  App,
  AppOutput,
  Chat,
  ChatResponseEnd,
  CreateAppParams,
  CreateAppResult,
  FileAttachment,
  LanguageModel,
  LanguageModelProvider,
  ListAppsResponse,
  Message,
  User,
  Version,
} from "@/types";
import type { IApiClient } from "./client_interface";
import type { ApiClientConfig, AuthResponse } from "./types";
import {
  type AppOutputCallbacks,
  type ChatStreamCallbacks,
  WebSocketClient,
} from "./websocket_client";

/**
 * ApiClient - HTTP/WebSocket client for web-based Kova
 */
export class ApiClient {
  private static instance: ApiClient | null = null;
  private baseUrl: string;
  private getAccessTokenFn: () => string | null;
  private refreshToken: string | null = null;
  private onUnauthorized?: () => void;
  private wsClient: WebSocketClient | null = null;
  private appOutputCallbacks: Map<number, (output: AppOutput) => void> =
    new Map();

  private constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl;
    this.getAccessTokenFn = config.getAccessToken;
    this.onUnauthorized = config.onUnauthorized;
    this.refreshToken = localStorage.getItem("refreshToken");
  }

  private get accessToken(): string | null {
    return this.getAccessTokenFn();
  }

  static initialize(config: ApiClientConfig): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient(config);
      // Initialize WebSocket client
      ApiClient.instance.wsClient = WebSocketClient.initialize(
        config.baseUrl,
        () => ApiClient.instance?.accessToken || null,
      );
    }
    return ApiClient.instance;
  }

  static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      throw new Error("ApiClient not initialized. Call initialize() first.");
    }
    return ApiClient.instance;
  }

  // =====================
  // HTTP Helpers
  // =====================

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      ...options.headers,
    };

    // Only set Content-Type for requests with a body
    if (options.body) {
      (headers as Record<string, string>)["Content-Type"] = "application/json";
    }

    if (this.accessToken) {
      (headers as Record<string, string>)["Authorization"] =
        `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Try to refresh token
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        // Retry request with new token
        (headers as Record<string, string>)["Authorization"] =
          `Bearer ${this.accessToken}`;
        const retryResponse = await fetch(url, { ...options, headers });
        if (!retryResponse.ok) {
          throw new Error(await retryResponse.text());
        }
        return retryResponse.json();
      }
      this.onUnauthorized?.();
      throw new Error("Unauthorized");
    }

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || errorText);
      } catch {
        throw new Error(errorText);
      }
    }

    return response.json();
  }

  private async tryRefreshToken(): Promise<boolean> {
    if (!this.refreshToken) return false;

    try {
      const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        this.refreshToken = data.refreshToken;
        // Store tokens (accessToken is read from localStorage via getter)
        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);
        return true;
      }
    } catch {
      // Refresh failed
    }
    return false;
  }

  // =====================
  // Authentication
  // =====================

  async getAuthConfig(): Promise<{ entraEnabled: boolean }> {
    return this.request("/api/auth/config");
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    this.refreshToken = response.refreshToken;
    localStorage.setItem("accessToken", response.accessToken);
    localStorage.setItem("refreshToken", response.refreshToken);
    return response;
  }

  async register(email: string, password: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    this.refreshToken = response.refreshToken;
    localStorage.setItem("accessToken", response.accessToken);
    localStorage.setItem("refreshToken", response.refreshToken);
    return response;
  }

  async logout(): Promise<void> {
    await this.request("/api/auth/logout", { method: "POST" });
    this.refreshToken = null;
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    this.wsClient?.disconnect();
  }

  async getCurrentUser(): Promise<User> {
    return this.request("/api/auth/me", { method: "GET" });
  }

  setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("refreshToken", refreshToken);
    this.refreshToken = refreshToken;
  }

  // =====================
  // Apps
  // =====================

  async createApp(params: CreateAppParams): Promise<CreateAppResult> {
    return this.request("/api/apps", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async getApp(appId: number): Promise<App> {
    return this.request(`/api/apps/${appId}`);
  }

  async listApps(): Promise<ListAppsResponse> {
    const apps = await this.request<App[]>("/api/apps");
    return { apps, appBasePath: "" };
  }

  async deleteApp(appId: number): Promise<void> {
    await this.request(`/api/apps/${appId}`, { method: "DELETE" });
  }

  async renameApp(params: {
    appId: number;
    appName: string;
  }): Promise<void> {
    await this.request(`/api/apps/${params.appId}`, {
      method: "PUT",
      body: JSON.stringify({ name: params.appName }),
    });
  }

  async getPreviewUrl(appId: number): Promise<{ previewUrl: string }> {
    return this.request<{ previewUrl: string }>(`/api/apps/${appId}/preview-url`);
  }

  async copyApp(params: {
    appId: number;
    newAppName?: string;
    withHistory?: boolean;
  }): Promise<{ app: App }> {
    const app = await this.request<App>(`/api/apps/${params.appId}/copy`, {
      method: "POST",
      body: JSON.stringify({
        name: params.newAppName,
        withHistory: params.withHistory,
      }),
    });
    return { app };
  }

  async addAppToFavorite(appId: number): Promise<{ isFavorite: boolean }> {
    const app = await this.request<App>(`/api/apps/${appId}/favorite`, {
      method: "POST",
    });
    return { isFavorite: app.isFavorite ?? true };
  }

  async searchApps(query: string): Promise<App[]> {
    return this.request(`/api/apps?search=${encodeURIComponent(query)}`);
  }

  // =====================
  // App Execution
  // =====================

  async runApp(
    appId: number,
    onOutput: (output: AppOutput) => void,
  ): Promise<void> {
    // Subscribe to app output via WebSocket
    this.appOutputCallbacks.set(appId, onOutput);
    await this.wsClient?.connect();
    this.wsClient?.subscribeToApp(appId, {
      onOutput: (output) => {
        onOutput({
          type: output.type,
          message: output.message,
          appId,
          timestamp: Date.now(),
        });
      },
      onStatus: (status) => {
        // Status updates can be handled via onOutput with type "info"
        if (status.status === "error" && status.error) {
          onOutput({
            type: "stderr",
            message: status.error,
            appId,
            timestamp: Date.now(),
          });
        }
      },
    });

    // Start the app
    await this.request(`/api/apps/${appId}/run`, { method: "POST" });
  }

  async stopApp(appId: number): Promise<void> {
    await this.request(`/api/apps/${appId}/stop`, { method: "POST" });
    this.wsClient?.unsubscribeFromApp(appId);
    this.appOutputCallbacks.delete(appId);
  }

  async restartApp(
    appId: number,
    onOutput: (output: AppOutput) => void,
    removeNodeModules?: boolean,
  ): Promise<{ success: boolean }> {
    // Update callback
    this.appOutputCallbacks.set(appId, onOutput);

    // Resubscribe to output
    await this.wsClient?.connect();
    this.wsClient?.subscribeToApp(appId, {
      onOutput: (output) => {
        onOutput({
          type: output.type,
          message: output.message,
          appId,
          timestamp: Date.now(),
        });
      },
      onStatus: (status) => {
        if (status.status === "error" && status.error) {
          onOutput({
            type: "stderr",
            message: status.error,
            appId,
            timestamp: Date.now(),
          });
        }
      },
    });

    await this.request(`/api/apps/${appId}/restart`, {
      method: "POST",
      body: JSON.stringify({ removeNodeModules }),
    });

    return { success: true };
  }

  async restartDevServer(appId: number): Promise<{ ok: boolean }> {
    return this.request(`/api/apps/${appId}/dev-server/restart`, {
      method: "POST",
    });
  }

  async getAppStatus(appId: number): Promise<{ status: string; url?: string }> {
    return this.request(`/api/apps/${appId}/status`);
  }

  /**
   * Check if the preview URL is ready (backend proxies the request to avoid CORS issues)
   */
  async checkPreviewHealth(
    appId: number,
  ): Promise<{ ready: boolean; status: number; reason?: string }> {
    return this.request(`/api/preview/${appId}/health`);
  }

  subscribeToAppOutput(appId: number, callbacks: AppOutputCallbacks): void {
    this.wsClient?.subscribeToApp(appId, callbacks);
  }

  unsubscribeFromAppOutput(appId: number): void {
    this.wsClient?.unsubscribeFromApp(appId);
  }

  sendAppInput(appId: number, response: string): void {
    this.wsClient?.sendAppInput(appId, response);
  }

  // =====================
  // Chats
  // =====================

  async createChat(appId: number): Promise<number> {
    const chat = await this.request<Chat>(`/api/apps/${appId}/chats`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    return chat.id;
  }

  async getChat(chatId: number): Promise<Chat> {
    return this.request(`/api/chats/${chatId}`);
  }

  async getChats(appId?: number): Promise<ChatSummary[]> {
    if (appId) {
      return this.request(`/api/apps/${appId}/chats`);
    }
    return this.request(`/api/chats`);
  }

  async updateChat(params: { chatId: number; title: string }): Promise<void> {
    await this.request(`/api/chats/${params.chatId}`, {
      method: "PUT",
      body: JSON.stringify({ title: params.title }),
    });
  }

  async deleteChat(chatId: number): Promise<void> {
    await this.request(`/api/chats/${chatId}`, { method: "DELETE" });
  }

  async deleteMessages(chatId: number): Promise<void> {
    await this.request(`/api/chats/${chatId}/messages`, { method: "DELETE" });
  }

  // =====================
  // Chat Streaming
  // =====================

  streamMessage(
    prompt: string,
    options: {
      chatId: number;
      redo?: boolean;
      promptType?: string;
      attachments?: FileAttachment[];
      onUpdate: (messages: Message[]) => void;
      onEnd: (response: ChatResponseEnd) => void;
      onError: (error: string) => void;
    },
  ): void {
    const { chatId, redo, promptType, attachments, onUpdate, onEnd, onError } = options;

    // Convert FileAttachment[] to the format expected by WebSocket
    const processAttachments = async (): Promise<
      Array<{ type: string; data: string; fileName?: string }> | undefined
    > => {
      if (!attachments || attachments.length === 0) return undefined;

      return Promise.all(
        attachments.map(async (attachment) => {
          return new Promise<{ type: string; data: string; fileName?: string }>(
            (resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                resolve({
                  type: attachment.file.type,
                  data: reader.result as string,
                  fileName: attachment.file.name,
                });
              };
              reader.onerror = () =>
                reject(
                  new Error(`Failed to read file: ${attachment.file.name}`),
                );
              reader.readAsDataURL(attachment.file);
            },
          );
        }),
      );
    };

    // Process attachments and start stream
    processAttachments()
      .then((processedAttachments) => {
        this.wsClient?.connect().then(() => {
          this.wsClient?.streamChat(
            chatId,
            prompt,
            {
              onUpdate,
              onEnd: (response) => {
                // Transform the response to match ChatResponseEnd
                onEnd({
                  chatId,
                  updatedFiles: response.updatedFiles,
                  extraFiles: response.extraFiles,
                });
              },
              onError,
            },
            {
              attachments: processedAttachments,
              redo,
              promptType,
            },
          );
        });
      })
      .catch((err) => {
        onError(String(err));
      });
  }

  cancelChatStream(chatId: number): void {
    this.wsClient?.cancelChat(chatId);
  }

  // =====================
  // Proposals
  // =====================

  async getProposal(chatId: number): Promise<{ proposal: string | null }> {
    return this.request(`/api/chats/${chatId}/proposal`);
  }

  async approveProposal(params: {
    chatId: number;
    messageId: number;
  }): Promise<{ success: boolean }> {
    return this.request(`/api/chats/${params.chatId}/proposal/approve`, {
      method: "POST",
      body: JSON.stringify({ messageId: params.messageId }),
    });
  }

  async rejectProposal(params: {
    chatId: number;
    messageId: number;
  }): Promise<void> {
    await this.request(`/api/chats/${params.chatId}/proposal/reject`, {
      method: "POST",
      body: JSON.stringify({ messageId: params.messageId }),
    });
  }

  // =====================
  // Settings
  // =====================

  async getUserSettings(): Promise<UserSettings> {
    return this.request("/api/settings");
  }

  async setUserSettings(
    settings: Partial<UserSettings>,
  ): Promise<UserSettings> {
    return this.request("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(settings),
    });
  }

  // =====================
  // App Files
  // =====================

  async readAppFile(params: {
    appId: number;
    filePath: string;
  }): Promise<{ content: string }> {
    return this.request(
      `/api/apps/${params.appId}/files?path=${encodeURIComponent(params.filePath)}`,
    );
  }

  async editAppFile(params: {
    appId: number;
    filePath: string;
    content: string;
  }): Promise<{ success: boolean }> {
    return this.request(`/api/apps/${params.appId}/files`, {
      method: "PUT",
      body: JSON.stringify({ path: params.filePath, content: params.content }),
    });
  }

  // =====================
  // Versions (Git)
  // =====================

  async listVersions(params: { appId: number }): Promise<Version[]> {
    return this.request(`/api/apps/${params.appId}/versions`);
  }

  async getCurrentBranch(
    appId: number,
  ): Promise<{ name: string; isDetached: boolean }> {
    return this.request(`/api/apps/${appId}/branch`);
  }

  async revertVersion(params: {
    appId: number;
    previousVersionId: string;
  }): Promise<{ successMessage: string } | { warningMessage: string }> {
    await this.request(
      `/api/apps/${params.appId}/versions/${params.previousVersionId}/revert`,
      {
        method: "POST",
      },
    );
    return { successMessage: "Version reverted successfully" };
  }

  async checkoutVersion(params: {
    appId: number;
    versionId: string;
  }): Promise<void> {
    await this.request(
      `/api/apps/${params.appId}/versions/${params.versionId}/checkout`,
      {
        method: "POST",
      },
    );
  }

  // =====================
  // Environment Variables
  // =====================

  async getAppEnvVars(params: {
    appId: number;
  }): Promise<{ key: string; value: string }[]> {
    return this.request(`/api/apps/${params.appId}/env`);
  }

  async setAppEnvVars(params: {
    appId: number;
    envVars: { key: string; value: string }[];
  }): Promise<void> {
    await this.request(`/api/apps/${params.appId}/env`, {
      method: "PUT",
      body: JSON.stringify({ envVars: params.envVars }),
    });
  }

  async getAppEnvVarKeys(appId: number): Promise<string[]> {
    const result = await this.request<{ keys: string[] }>(
      `/api/apps/${appId}/env/keys`,
    );
    return result.keys;
  }

  async setAppEnvVar(appId: number, key: string, value: string): Promise<void> {
    await this.request(`/api/apps/${appId}/env`, {
      method: "POST",
      body: JSON.stringify({ key, value }),
    });
  }

  async deleteAppEnvVar(appId: number, key: string): Promise<void> {
    await this.request(`/api/apps/${appId}/env/${key}`, { method: "DELETE" });
  }

  // =====================
  // Provider API Keys
  // =====================

  async setProviderApiKey(providerId: string, apiKey: string): Promise<void> {
    await this.request(`/api/settings/providers/${providerId}/api-key`, {
      method: "POST",
      body: JSON.stringify({ apiKey }),
    });
  }

  async deleteProviderApiKey(providerId: string): Promise<void> {
    await this.request(`/api/settings/providers/${providerId}/api-key`, {
      method: "DELETE",
    });
  }

  async hasProviderApiKey(providerId: string): Promise<boolean> {
    const result = await this.request<{ hasApiKey: boolean }>(
      `/api/settings/providers/${providerId}/has-api-key`,
    );
    return result.hasApiKey;
  }

  /**
   * Get environment variables for all providers (masked values)
   * Returns which env vars are set on the backend
   */
  async getEnvVars(): Promise<Record<string, string | undefined>> {
    try {
      return await this.request<Record<string, string | undefined>>(
        "/api/settings/env-vars",
      );
    } catch {
      // If the endpoint fails, return empty object
      return {};
    }
  }

  // =====================
  // Language Models
  // =====================

  async getLanguageModelProviders(): Promise<LanguageModelProvider[]> {
    return this.request("/api/language-models/providers");
  }

  async getLanguageModels(providerId: string): Promise<LanguageModel[]> {
    return this.request(`/api/language-models/${providerId}`);
  }

  async getLanguageModelsByProviders(): Promise<
    Record<string, LanguageModel[]>
  > {
    return this.request("/api/language-models/by-providers");
  }

  async createCustomModel(model: {
    apiName: string;
    displayName: string;
    providerId: string;
    description?: string;
    maxOutputTokens?: number;
    contextWindow?: number;
  }): Promise<void> {
    await this.request("/api/language-models", {
      method: "POST",
      body: JSON.stringify(model),
    });
  }

  async deleteCustomModel(
    providerId: string,
    modelApiName: string,
  ): Promise<void> {
    await this.request(`/api/language-models/${providerId}/${modelApiName}`, {
      method: "DELETE",
    });
  }

  async createCustomProvider(provider: {
    id: string;
    name: string;
    apiBaseUrl: string;
    envVarName?: string;
  }): Promise<LanguageModelProvider> {
    return this.request("/api/language-models/providers", {
      method: "POST",
      body: JSON.stringify(provider),
    });
  }

  async updateCustomProvider(
    id: string,
    provider: { name: string; apiBaseUrl: string; envVarName?: string },
  ): Promise<LanguageModelProvider> {
    return this.request(`/api/language-models/providers/${id}`, {
      method: "PUT",
      body: JSON.stringify(provider),
    });
  }

  async deleteCustomProvider(id: string): Promise<void> {
    await this.request(`/api/language-models/providers/${id}`, {
      method: "DELETE",
    });
  }

  /**
   * Check if a provider's environment variable API key is set
   * In web mode, this checks the backend's environment
   */
  async checkProviderEnvKey(providerId: string): Promise<boolean> {
    try {
      const result = await this.request<{ hasEnvKey: boolean }>(
        `/api/settings/providers/${providerId}/env-key`,
      );
      return result.hasEnvKey;
    } catch {
      return false;
    }
  }

  // =====================
  // WebSocket Connection
  // =====================

  async connectWebSocket(): Promise<void> {
    await this.wsClient?.connect();
  }

  disconnectWebSocket(): void {
    this.wsClient?.disconnect();
  }

  isWebSocketConnected(): boolean {
    return this.wsClient?.isConnected() ?? false;
  }

  // =====================
  // Utility Methods
  // =====================

  async getAppVersion(): Promise<string> {
    return this.request<{ version: string }>("/health").then(
      (r) => r.version || "1.0.0",
    );
  }

  openExternalUrl(url: string): void {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // =====================
  // Templates
  // =====================

  async getTemplates(): Promise<Template[]> {
    return this.request("/api/templates");
  }

  // =====================
  // Workflow Apps
  // =====================

  async createWorkflowApp(params: {
    workflowType: "excel-workflow" | "image-forge" | "data-platform";
    file: string;
    fileName: string;
  }): Promise<{
    appId: number;
    chatId: number;
    initialPrompt: string;
    workflowDocFilename: string;
  }> {
    return this.request("/api/workflows/create-app", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }
}
