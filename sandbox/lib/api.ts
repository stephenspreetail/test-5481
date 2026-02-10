import { API_BASE_URL } from "./context.js";

export interface LoginResponse {
  user: { id: number; email: string };
  accessToken: string;
  refreshToken: string;
}

export interface App {
  id: number;
  userId: number;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  installCommand: string | null;
  startCommand: string | null;
  isFavorite: boolean;
  [key: string]: unknown;
}

export interface CreateAppResponse {
  app: App;
  chatId: number;
}

export interface ChatMessage {
  id: number;
  chatId: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface Chat {
  id: number;
  appId: number;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface AppStatus {
  status: "running" | "stopped";
  agentUrl?: string;
  previewUrl?: string;
}

async function request<T>(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const { method = "GET", token, body } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON
  }

  if (!res.ok) {
    throw new Error(
      `${method} ${path} returned ${res.status}: ${text.slice(0, 500)}`,
    );
  }

  return json as T;
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  return request<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export async function createApp(
  token: string,
  name: string,
): Promise<CreateAppResponse> {
  return request<CreateAppResponse>("/api/apps", {
    method: "POST",
    token,
    body: { name },
  });
}

export async function getChat(token: string, chatId: number): Promise<Chat> {
  return request<Chat>(`/api/chats/${chatId}`, { token });
}

export async function getAppStatus(
  token: string,
  appId: number,
): Promise<AppStatus> {
  return request<AppStatus>(`/api/apps/${appId}/status`, { token });
}

export async function stopApp(
  token: string,
  appId: number,
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/apps/${appId}/stop`, {
    method: "POST",
    token,
  });
}

export async function getMe(
  token: string,
): Promise<{ id: number; email: string; createdAt: string }> {
  return request("/api/auth/me", { token });
}

export async function listApps(token: string): Promise<App[]> {
  return request<App[]>("/api/apps", { token });
}

export async function getApp(token: string, appId: number): Promise<App> {
  return request<App>(`/api/apps/${appId}`, { token });
}

export async function deleteApp(
  token: string,
  appId: number,
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/apps/${appId}`, {
    method: "DELETE",
    token,
  });
}
