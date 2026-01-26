/**
 * @kova/agent - Standalone Kova AI Agent package
 *
 * A thin wrapper around Claude Agent SDK with Spreetail defaults.
 *
 * @example Basic usage
 * ```typescript
 * import { kovaQuery } from '@kova/agent';
 *
 * for await (const message of kovaQuery("Create a hello world app", { cwd: '/path/to/project' })) {
 *   // Handle raw SDK messages
 *   if (message.type === 'assistant' && message.message) {
 *     for (const block of message.message.content) {
 *       if (block.type === 'text') console.log(block.text);
 *     }
 *   }
 * }
 * ```
 *
 * @packageDocumentation
 */

// Core exports - the main query function
export { kovaQuery, type SDKMessage } from "./core/index.js";
export type { KovaQueryOptions } from "./core/index.js";

// Type exports
export type {
  SystemPromptConfig,
  McpServerConfig,
  McpStdioServerConfig,
  McpHttpServerConfig,
  McpSSEServerConfig,
} from "./types/index.js";

// Tool exports
export {
  AVAILABLE_TOOLS,
  TOOL_PRESETS,
  DEFAULT_TOOLS,
  type AgentTool,
  type ToolPreset,
} from "./tools/index.js";

// Config exports
export {
  // System prompts
  DEFAULT_KOVA_SYSTEM_PROMPT,
  KOVA_AGENT_APPEND,
  extendKovaAgentPrompt,
  WORKFLOW_ANALYSIS_APPEND,
  constructWorkflowAnalysisPromptConfig,
  isWorkflowAnalysisPrompt,
  // Defaults
  DEFAULT_MCP_SERVERS,
  // Credentials management
  loadDataPlatformCredentials,
  injectDataPlatformCredentials,
  hasDataPlatformCredentials,
  createCredentialsTemplate,
  getCredentialsSetupMessage,
  getCredentialsPath,
  createProjectEnvFile,
  type DataPlatformCredentials,
} from "./config/index.js";

// Project exports
export {
  ProjectManager,
  getConfigDir,
  getDataDir,
  getProjectsDir,
  getProjectPath,
  getProjectKovaPath,
  getProjectMetadataPath,
  getProjectHistoryPath,
  getSettingsPath,
  validateProjectName,
  sanitizeProjectName,
  type Project,
  type ProjectMetadata,
  type ProjectHistory,
  type SessionMetadata,
  type CreateProjectOptions,
  type ListProjectsOptions,
} from "./projects/index.js";

// Data Platform exports
export {
  // MCP Server (in-process)
  dataCatalogMcpServer,
  initializeDataCatalog,
  // Metadata search functions
  searchTables,
  searchColumns,
  getTable,
  getAllTables,
  getDomainSummaries,
  suggestTablesForUseCase,
  getRelatedTables,
  loadMetadataCatalog,
  reloadMetadataCatalog,
  getCatalogStats,
  // Trino client
  TrinoClient,
  createTrinoClientFromEnv,
  createDataPlatformClient,
  createDataSourceClient,
  getDataSourceClient,
  closeAllDataSources,
  DataSourceError,
  // Types
  type TrinoConfig,
  type DataSourceClient,
  type DataSourceConfig,
  type QueryResult,
  type QueryOptions,
  type ConnectionTestResult,
  type TableDetails,
  type TableSearchResult,
  type DomainSummary,
  type SearchOptions,
} from "./data-platform/index.js";
