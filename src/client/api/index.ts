/**
 * Client API module exports
 *
 * This module provides a platform-agnostic API layer for Kova.
 * Use getClient() to get the appropriate client for the current platform.
 */

// Main entry points
export {
  getClient,
  initializeClient,
  isWeb,
  getPlatform,
  resetClient,
} from "./client_factory";

// Client interface
export type {
  IApiClient,
  ChatStreamCallbacks,
  AppStreamCallbacks,
} from "./client_interface";

// Concrete implementations (use sparingly - prefer getClient())
export { ApiClient } from "./api_client";
export { WebSocketClient } from "./websocket_client";

// Types
export type {
  ApiClientConfig,
  AuthResponse,
  AuthTokens,
  WsMessage,
  ChatStreamRequest,
  ChatStreamChunk,
  ChatStreamEnd,
  ChatStreamError,
  AppOutputMessage,
  AppStatusMessage,
} from "./types";
