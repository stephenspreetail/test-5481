// API Client Types

export interface ApiClientConfig {
  baseUrl: string;
  getAccessToken: () => string | null;
  onUnauthorized?: () => void;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: number;
    email: string;
  };
  accessToken: string;
  refreshToken: string;
}

// WebSocket message types
export interface WsMessage {
  type: string;
  [key: string]: any;
}

export interface ChatStreamRequest {
  type: "chat:stream";
  chatId: number;
  prompt: string;
  attachments?: Array<{
    type: string;
    data: string;
    fileName?: string;
  }>;
  redo?: boolean;
  promptType?: string;
}

export interface ChatStreamChunk {
  type: "chat:response:chunk";
  chatId: number;
  messages: Array<{
    id?: number;
    role: "user" | "assistant";
    content: string;
  }>;
}

export interface ChatStreamDelta {
  type: "chat:response:delta";
  chatId: number;
  delta: string;
  toolName?: string;
  /** Structured block type for rich rendering */
  blockType?: string;
  /** Structured block data (shape depends on blockType) */
  blockData?: Record<string, unknown>;
}

export interface ChatStreamEnd {
  type: "chat:response:end";
  chatId: number;
  updatedFiles: boolean;
  extraFiles?: string[];
}

export interface ChatStreamError {
  type: "chat:response:error";
  chatId: number;
  error: string;
}

export interface ChatTitleUpdate {
  type: "chat:title:update";
  chatId: number;
  title: string;
}

export interface AppNameUpdate {
  type: "app:name:update";
  appId: number;
  name: string;
}

export interface AppOutputMessage {
  type: "app:output";
  appId: number;
  outputType: "stdout" | "stderr" | "info" | "input-requested";
  message: string;
  timestamp: number;
}

export interface AppStatusMessage {
  type: "app:status";
  appId: number;
  status: "starting" | "running" | "stopped" | "error";
  url?: string;
  error?: string;
}

export type AgentStatus =
  | "offline"
  | "scheduling"
  | "starting"
  | "ready"
  | "working"
  | "error";

export interface AgentStatusMessage {
  type: "app:agent:status";
  appId: number;
  status: AgentStatus;
  message: string;
  timestamp: number;
}
