/**
 * IApiClient - API client interface for the web application
 */

import type { AppChatContext, AppSearchResult, ChatSearchResult, ChatSummary, ContextPathResults, UserSettings } from "@/lib/schemas";
import type { Template } from "@/shared/templates";
import type {
  App,
  AppOutput,
  AppUpgrade,
  ApproveProposalResult,
  BranchResult,
  Chat,
  ChatLogsData,
  ChatResponseEnd,
  CloneRepoParams,
  CloneRepoReturnType,
  ConnectToExistingVercelProjectParams,
  CreateAppParams,
  CreateAppResult,
  CreateCustomLanguageModelParams,
  CreateCustomLanguageModelProviderParams,
  CreateMcpServer,
  CreateNeonProjectParams,
  CreatePromptParamsDto,
  CreateVercelProjectParams,
  DisconnectVercelProjectParams,
  EditAppFileReturnType,
  FileAttachment,
  GetNeonProjectParams,
  GetNeonProjectResponse,
  GetVercelDeploymentsParams,
  GithubRepository,
  ImportAppParams,
  ImportAppResult,
  IsVercelProjectAvailableResponse,
  LanguageModel,
  LanguageModelProvider,
  ListAppsResponse,
  LocalModel,
  McpServer,
  McpServerUpdate,
  McpTool,
  McpToolConsent,
  McpToolConsentType,
  Message,
  NeonProject,
  ProblemReport,
  PromptDto,
  RenameBranchParams,
  RespondToAppInputParams,
  RevertVersionParams,
  RevertVersionResponse,
  SaveVercelAccessTokenParams,
  SecurityReviewResult,
  SetSupabaseAppProjectParams,
  SupabaseBranch,
  SystemDebugInfo,
  TokenCountParams,
  TokenCountResult,
  UpdatePromptParamsDto,
  UserBudgetInfo,
  VercelDeployment,
  VercelProject,
  Version,
} from "@/types";

export interface ChatStreamCallbacks {
  onUpdate: (messages: Message[]) => void;
  onEnd: (response: ChatResponseEnd) => void;
  onError: (error: string) => void;
}

export interface AppStreamCallbacks {
  onOutput: (output: AppOutput) => void;
}


/**
 * Core API client interface - methods required for basic app functionality
 */
export interface IApiClient {
  // =====================
  // Apps
  // =====================
  createApp(params: CreateAppParams): Promise<CreateAppResult>;
  getApp(appId: number): Promise<App>;
  listApps(): Promise<ListAppsResponse>;
  deleteApp(appId: number): Promise<void>;
  renameApp(params: { appId: number; appName: string; appPath: string }): Promise<void>;
  copyApp(params: { appId: number; newName?: string }): Promise<{ app: App }>;
  addAppToFavorite(appId: number): Promise<{ isFavorite: boolean }>;
  searchApps(query: string): Promise<App[]>;
  importApp(params: ImportAppParams): Promise<ImportAppResult>;
  selectAppFolder(): Promise<{ path: string | null; canceled?: boolean }>;
  checkAppName(name: string): Promise<{ available: boolean; error?: string }>;
  checkAiRules(path: string): Promise<{ hasAiRules: boolean }>;

  // =====================
  // App Execution
  // =====================
  runApp(appId: number, onOutput: (output: AppOutput) => void): Promise<void>;
  stopApp(appId: number): Promise<void>;
  restartApp(
    appId: number,
    onOutput: (output: AppOutput) => void,
    removeNodeModules?: boolean
  ): Promise<{ success: boolean }>;
  respondToAppInput(params: RespondToAppInputParams): Promise<void>;
  clearSessionData(appId: number): Promise<void>;

  // =====================
  // App Files
  // =====================
  readAppFile(params: { appId: number; filePath: string }): Promise<{ content: string }>;
  editAppFile(params: { appId: number; filePath: string; content: string }): Promise<EditAppFileReturnType>;

  // =====================
  // App Upgrades
  // =====================
  getAppUpgrades(params: { appId: number }): Promise<AppUpgrade[]>;
  executeAppUpgrade(params: { appId: number; upgradeId: string }): Promise<void>;

  // =====================
  // Chats
  // =====================
  createChat(appId: number): Promise<number>;
  getChat(chatId: number): Promise<Chat>;
  getChats(appId?: number): Promise<ChatSummary[]>;
  updateChat(params: { chatId: number; title: string }): Promise<void>;
  deleteChat(chatId: number): Promise<void>;
  deleteMessages(chatId: number): Promise<void>;
  searchChats(params: { query: string }): Promise<ChatSearchResult[]>;

  // =====================
  // Chat Streaming
  // =====================
  streamMessage(
    prompt: string,
    options: {
      chatId: number;
      redo?: boolean;
      attachments?: FileAttachment[];
      onUpdate: (messages: Message[]) => void;
      onEnd: (response: ChatResponseEnd) => void;
      onError: (error: string) => void;
    }
  ): void;
  cancelChatStream(chatId: number): void;

  // =====================
  // Chat Context
  // =====================
  getChatContextResults(params: { appId: number; chatId: number }): Promise<ContextPathResults>;
  setChatContext(params: { appId: number; chatId: number; context: AppChatContext }): Promise<void>;

  // =====================
  // Proposals
  // =====================
  getProposal(chatId: number): Promise<{ proposal: string | null }>;
  approveProposal(params: { chatId: number; messageId: number }): Promise<ApproveProposalResult>;
  rejectProposal(params: { chatId: number; messageId: number }): Promise<void>;

  // =====================
  // Problems
  // =====================
  checkProblems(params: { appId: number }): Promise<ProblemReport>;

  // =====================
  // Settings
  // =====================
  getUserSettings(): Promise<UserSettings>;
  setUserSettings(settings: Partial<UserSettings>): Promise<UserSettings>;
  resetAll(): Promise<void>;

  // =====================
  // Prompts
  // =====================
  listPrompts(): Promise<PromptDto[]>;
  createPrompt(params: CreatePromptParamsDto): Promise<PromptDto>;
  updatePrompt(params: UpdatePromptParamsDto): Promise<void>;
  deletePrompt(id: number): Promise<void>;

  // =====================
  // Templates
  // =====================
  getTemplates(): Promise<Template[]>;

  // =====================
  // Versions (Git)
  // =====================
  listVersions(params: { appId: number }): Promise<Version[]>;
  revertVersion(params: RevertVersionParams): Promise<RevertVersionResponse>;
  checkoutVersion(params: { appId: number; versionId: string }): Promise<void>;
  getCurrentBranch(appId: number): Promise<BranchResult>;
  renameBranch(params: RenameBranchParams): Promise<void>;

  // =====================
  // Environment Variables
  // =====================
  getAppEnvVars(params: { appId: number }): Promise<{ key: string; value: string }[]>;
  setAppEnvVars(params: { appId: number; envVars: { key: string; value: string }[] }): Promise<void>;

  // =====================
  // Language Models
  // =====================
  getLanguageModelProviders(): Promise<LanguageModelProvider[]>;
  getLanguageModels(providerId: string): Promise<LanguageModel[]>;
  getLanguageModelsByProviders(): Promise<{ providers: { provider: LanguageModelProvider; models: LanguageModel[] }[] }>;
  createCustomLanguageModelProvider(params: CreateCustomLanguageModelProviderParams): Promise<void>;
  editCustomLanguageModelProvider(params: { providerId: string } & CreateCustomLanguageModelProviderParams): Promise<void>;
  deleteCustomLanguageModelProvider(providerId: string): Promise<void>;
  createCustomLanguageModel(params: CreateCustomLanguageModelParams): Promise<void>;
  deleteCustomModel(modelId: number): Promise<void>;

  // =====================
  // Local Models (Ollama/LMStudio)
  // =====================
  listLocalOllamaModels(): Promise<{ models: LocalModel[] }>;
  listLocalLMStudioModels(): Promise<{ models: LocalModel[] }>;

  // =====================
  // Token Counting
  // =====================
  countTokens(params: TokenCountParams): Promise<TokenCountResult>;

  // =====================
  // Security Review
  // =====================
  getLatestSecurityReview(chatId: number): Promise<SecurityReviewResult | null>;

  // =====================
  // Help Bot
  // =====================
  startHelpChat(params: { sessionId: string; message: string }, onDelta: (delta: string) => void): Promise<void>;

  // =====================
  // MCP (Model Context Protocol)
  // =====================
  listMcpServers(): Promise<McpServer[]>;
  listMcpTools(serverId: number): Promise<McpTool[]>;
  getMcpToolConsents(serverId: number): Promise<McpToolConsent[]>;
  createMcpServer(server: CreateMcpServer): Promise<McpServer>;
  updateMcpServer(server: McpServerUpdate): Promise<McpServer>;
  deleteMcpServer(serverId: number): Promise<void>;
  setMcpToolConsent(params: { serverId: number; toolName: string; consent: McpToolConsentType }): Promise<void>;

  // =====================
  // GitHub Integration
  // =====================
  listGithubRepos(): Promise<GithubRepository[]>;
  getGithubRepoBranches(params: { owner: string; repo: string }): Promise<{ branches: string[] }>;
  checkGithubRepoAvailable(params: { owner: string; repo: string }): Promise<{ available: boolean }>;
  createGithubRepo(params: { appId: number; repoName: string; isPrivate: boolean }): Promise<void>;
  connectToExistingGithubRepo(params: { appId: number; owner: string; repo: string; branch: string }): Promise<void>;
  disconnectGithubRepo(appId: number): Promise<void>;
  syncGithubRepo(appId: number): Promise<{ success: boolean }>;
  cloneRepoFromUrl(params: CloneRepoParams): Promise<CloneRepoReturnType>;

  // =====================
  // Neon Integration
  // =====================
  createNeonProject(params: CreateNeonProjectParams): Promise<NeonProject>;
  getNeonProject(params: GetNeonProjectParams): Promise<GetNeonProjectResponse>;
  fakeHandleNeonConnect(): Promise<void>;

  // =====================
  // Supabase Integration
  // =====================
  listSupabaseProjects(): Promise<{ id: string; name: string }[]>;
  listSupabaseBranches(projectId: string): Promise<SupabaseBranch[]>;
  setSupabaseAppProject(params: SetSupabaseAppProjectParams): Promise<void>;
  unsetSupabaseAppProject(appId: number): Promise<void>;
  fakeHandleSupabaseConnect(): Promise<void>;

  // =====================
  // Vercel Integration
  // =====================
  listVercelProjects(): Promise<VercelProject[]>;
  saveVercelAccessToken(params: SaveVercelAccessTokenParams): Promise<void>;
  isVercelProjectAvailable(params: { name: string }): Promise<IsVercelProjectAvailableResponse>;
  createVercelProject(params: CreateVercelProjectParams): Promise<void>;
  connectToExistingVercelProject(params: ConnectToExistingVercelProjectParams): Promise<void>;
  disconnectVercelProject(params: DisconnectVercelProjectParams): Promise<void>;
  getVercelDeployments(params: GetVercelDeploymentsParams): Promise<VercelDeployment[]>;

  // =====================
  // System & Debug
  // =====================
  getAppVersion(): Promise<string>;
  getSystemDebugInfo(): Promise<SystemDebugInfo>;
  getChatLogs(chatId: number): Promise<ChatLogsData>;
  uploadToSignedUrl(params: { url: string; data: string }): Promise<void>;


  // =====================
  // User Budget (Pro)
  // =====================
  getUserBudget(): Promise<UserBudgetInfo>;

  // =====================
  // Capacitor (Mobile)
  // =====================
  isCapacitor(params: { appId: number }): Promise<boolean>;
  syncCapacitor(params: { appId: number }): Promise<void>;
  openIos(params: { appId: number }): Promise<void>;
  openAndroid(params: { appId: number }): Promise<void>;

  // =====================
  // Release Notes
  // =====================
  doesReleaseNoteExist(version: string): Promise<boolean>;

  // =====================
  // Portal Migration
  // =====================
  portalMigrateCreate(appId: number): Promise<{ success: boolean }>;


  // =====================
  // Screenshots
  // =====================
  takeScreenshot(): Promise<string>;


  // =====================
  // Utility
  // =====================
  openExternalUrl(url: string): void;
}
