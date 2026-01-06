/**
 * Client Factory - Returns the API client for web mode
 *
 * Usage:
 *   import { getClient } from '@/client/api/client_factory';
 *   const client = getClient();
 *   const apps = await client.listApps();
 */

import { ApiClient } from "./api_client";
import type { IApiClient } from "./client_interface";

let cachedClient: IApiClient | null = null;

/**
 * Check if we're running in web (browser) environment
 * Always returns true since we only support web mode
 */
export function isWeb(): boolean {
  return true;
}

/**
 * Get the platform type
 * Always returns "web" since we only support web mode
 */
export function getPlatform(): "web" {
  return "web";
}

/**
 * Get the API client for web mode
 */
export function getClient(): IApiClient {
  if (cachedClient) {
    return cachedClient;
  }

  // Web mode - use HTTP/WebSocket client
  cachedClient = ApiClient.getInstance() as unknown as IApiClient;
  return cachedClient;
}

/**
 * Initialize the client with configuration
 * Call this once at app startup before using getClient()
 */
export function initializeClient(config?: {
  baseUrl?: string;
  getAccessToken?: () => string | null;
  onUnauthorized?: () => void;
}): void {
  if (config) {
    ApiClient.initialize({
      baseUrl: config.baseUrl || getDefaultBaseUrl(),
      getAccessToken:
        config.getAccessToken || (() => localStorage.getItem("accessToken")),
      onUnauthorized: config.onUnauthorized,
    });
  }
  // Reset cached client to pick up new configuration
  cachedClient = null;
}

/**
 * Get the default API base URL for web mode
 */
function getDefaultBaseUrl(): string {
  // In production, use the same origin
  // In development, use the configured API URL
  if (typeof window !== "undefined") {
    const apiUrl = (import.meta as any).env?.VITE_API_URL;
    if (apiUrl) {
      return apiUrl;
    }
    // Default to same origin with /api prefix
    return window.location.origin;
  }
  return "http://localhost:3002";
}

/**
 * Reset the cached client (useful for testing or logout)
 */
export function resetClient(): void {
  cachedClient = null;
}
