import { relations, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

// =====================
// NEW: User & Auth Tables
// =====================

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 500 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userSecrets = pgTable(
  "user_secrets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 255 }).notNull(),
    encryptedValue: text("encrypted_value").notNull(),
    iv: varchar("iv", { length: 32 }).notNull(),
    authTag: varchar("auth_tag", { length: 32 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("user_secrets_user_key_unique").on(table.userId, table.key),
  ],
);

// =====================
// Apps (per-user)
// =====================

export const apps = pgTable("apps", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  path: varchar("path", { length: 500 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // GitHub integration
  githubOrg: varchar("github_org", { length: 255 }),
  githubRepo: varchar("github_repo", { length: 255 }),
  githubBranch: varchar("github_branch", { length: 255 }),
  // Neon integration
  neonProjectId: varchar("neon_project_id", { length: 255 }),
  neonDevelopmentBranchId: varchar("neon_development_branch_id", {
    length: 255,
  }),
  neonPreviewBranchId: varchar("neon_preview_branch_id", { length: 255 }),
  // Vercel integration
  vercelProjectId: varchar("vercel_project_id", { length: 255 }),
  vercelProjectName: varchar("vercel_project_name", { length: 255 }),
  vercelTeamId: varchar("vercel_team_id", { length: 255 }),
  vercelDeploymentUrl: varchar("vercel_deployment_url", { length: 500 }),
  // Commands
  installCommand: text("install_command"),
  startCommand: text("start_command"),
  // Context
  chatContext: jsonb("chat_context"),
  isFavorite: boolean("is_favorite").notNull().default(false),
});

// =====================
// App Environment Variables (per-app)
// =====================

export const appEnvVars = pgTable(
  "app_env_vars",
  {
    id: serial("id").primaryKey(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 255 }).notNull(),
    encryptedValue: text("encrypted_value").notNull(),
    iv: varchar("iv", { length: 32 }).notNull(),
    authTag: varchar("auth_tag", { length: 32 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [unique("app_env_vars_app_key_unique").on(table.appId, table.key)],
);

// =====================
// Chats
// =====================

export const chats = pgTable("chats", {
  id: serial("id").primaryKey(),
  appId: integer("app_id")
    .notNull()
    .references(() => apps.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }),
  initialCommitHash: varchar("initial_commit_hash", { length: 40 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// =====================
// Messages
// =====================

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20, enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  approvalState: varchar("approval_state", {
    length: 20,
    enum: ["approved", "rejected"],
  }),
  sourceCommitHash: varchar("source_commit_hash", { length: 40 }),
  commitHash: varchar("commit_hash", { length: 40 }),
  requestId: varchar("request_id", { length: 100 }),
  maxTokensUsed: integer("max_tokens_used"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// =====================
// Versions
// =====================

export const versions = pgTable(
  "versions",
  {
    id: serial("id").primaryKey(),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    commitHash: varchar("commit_hash", { length: 40 }).notNull(),
    neonDbTimestamp: varchar("neon_db_timestamp", { length: 100 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("versions_app_commit_unique").on(table.appId, table.commitHash),
  ],
);

// =====================
// Language Model Providers (per-user)
// =====================

export const languageModelProviders = pgTable("language_model_providers", {
  id: varchar("id", { length: 100 }).primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  apiBaseUrl: varchar("api_base_url", { length: 500 }).notNull(),
  envVarName: varchar("env_var_name", { length: 100 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// =====================
// Language Models (per-user)
// =====================

export const languageModels = pgTable("language_models", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  apiName: varchar("api_name", { length: 255 }).notNull(),
  builtinProviderId: varchar("builtin_provider_id", { length: 100 }),
  customProviderId: varchar("custom_provider_id", { length: 100 }).references(
    () => languageModelProviders.id,
    { onDelete: "cascade" },
  ),
  description: text("description"),
  maxOutputTokens: integer("max_output_tokens"),
  contextWindow: integer("context_window"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// =====================
// MCP Servers (per-user)
// =====================

export const mcpServers = pgTable("mcp_servers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  transport: varchar("transport", { length: 50 }).notNull(),
  command: text("command"),
  args: jsonb("args").$type<string[] | null>(),
  envJson: jsonb("env_json").$type<Record<string, string> | null>(),
  url: varchar("url", { length: 500 }),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// =====================
// MCP Tool Consents
// =====================

export const mcpToolConsents = pgTable(
  "mcp_tool_consents",
  {
    id: serial("id").primaryKey(),
    serverId: integer("server_id")
      .notNull()
      .references(() => mcpServers.id, { onDelete: "cascade" }),
    toolName: varchar("tool_name", { length: 255 }).notNull(),
    consent: varchar("consent", { length: 20 }).notNull().default("ask"), // ask | always | denied
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("mcp_tool_consents_server_tool_unique").on(
      table.serverId,
      table.toolName,
    ),
  ],
);

// =====================
// Relations
// =====================

export const usersRelations = relations(users, ({ many, one }) => ({
  apps: many(apps),
  settings: one(userSettings),
  secrets: many(userSecrets),
  refreshTokens: many(refreshTokens),
  languageModelProviders: many(languageModelProviders),
  languageModels: many(languageModels),
  mcpServers: many(mcpServers),
}));

export const appsRelations = relations(apps, ({ many, one }) => ({
  user: one(users, {
    fields: [apps.userId],
    references: [users.id],
  }),
  chats: many(chats),
  versions: many(versions),
  envVars: many(appEnvVars),
}));

export const chatsRelations = relations(chats, ({ many, one }) => ({
  messages: many(messages),
  app: one(apps, {
    fields: [chats.appId],
    references: [apps.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id],
  }),
}));

export const versionsRelations = relations(versions, ({ one }) => ({
  app: one(apps, {
    fields: [versions.appId],
    references: [apps.id],
  }),
}));

export const languageModelProvidersRelations = relations(
  languageModelProviders,
  ({ many, one }) => ({
    user: one(users, {
      fields: [languageModelProviders.userId],
      references: [users.id],
    }),
    languageModels: many(languageModels),
  }),
);

export const languageModelsRelations = relations(languageModels, ({ one }) => ({
  user: one(users, {
    fields: [languageModels.userId],
    references: [users.id],
  }),
  provider: one(languageModelProviders, {
    fields: [languageModels.customProviderId],
    references: [languageModelProviders.id],
  }),
}));

export const mcpServersRelations = relations(mcpServers, ({ many, one }) => ({
  user: one(users, {
    fields: [mcpServers.userId],
    references: [users.id],
  }),
  toolConsents: many(mcpToolConsents),
}));

export const mcpToolConsentsRelations = relations(
  mcpToolConsents,
  ({ one }) => ({
    server: one(mcpServers, {
      fields: [mcpToolConsents.serverId],
      references: [mcpServers.id],
    }),
  }),
);
