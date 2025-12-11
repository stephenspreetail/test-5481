import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  signup: async (email: string, password: string, name?: string) => {
    const response = await api.post('/api/auth/signup', { email, password, name });
    return response.data;
  },

  login: async (email: string, password: string) => {
    const response = await api.post('/api/auth/login', { email, password });
    return response.data;
  },

  me: async () => {
    const response = await api.get('/api/auth/me');
    return response.data;
  },
};

// Apps API
export const appsApi = {
  getAll: async () => {
    const response = await api.get('/api/apps');
    return response.data;
  },

  getById: async (id: number) => {
    const response = await api.get(`/api/apps/${id}`);
    return response.data;
  },

  create: async (name: string) => {
    const response = await api.post('/api/apps', { name });
    return response.data;
  },

  update: async (id: number, data: any) => {
    const response = await api.patch(`/api/apps/${id}`, data);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await api.delete(`/api/apps/${id}`);
    return response.data;
  },
};

// Chats API
export const chatsApi = {
  getByAppId: async (appId: number) => {
    const response = await api.get(`/api/chats/app/${appId}`);
    return response.data;
  },

  getById: async (id: number) => {
    const response = await api.get(`/api/chats/${id}`);
    return response.data;
  },

  create: async (appId: number, title?: string) => {
    const response = await api.post('/api/chats', { appId, title });
    return response.data;
  },

  update: async (id: number, data: any) => {
    const response = await api.patch(`/api/chats/${id}`, data);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await api.delete(`/api/chats/${id}`);
    return response.data;
  },

  getMessages: async (chatId: number) => {
    const response = await api.get(`/api/chats/${chatId}/messages`);
    return response.data;
  },

  addMessage: async (chatId: number, role: 'user' | 'assistant', content: string) => {
    const response = await api.post(`/api/chats/${chatId}/messages`, { role, content });
    return response.data;
  },
};

// AI API
export const aiApi = {
  // Stream AI response
  streamChat: async (
    chatId: number,
    prompt: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (error: string) => void,
    provider = 'anthropic',
    modelName?: string
  ) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/api/ai/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ chatId, prompt, provider, modelName }),
    });

    if (!response.ok) {
      const error = await response.text();
      onError(error);
      return;
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      onError('No response body');
      return;
    }

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));

            if (data.type === 'chunk') {
              onChunk(data.content);
            } else if (data.type === 'done') {
              onDone();
              return;
            } else if (data.type === 'error') {
              onError(data.message);
              return;
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        }
      }
    }
  },

  // Non-streaming chat
  chat: async (chatId: number, prompt: string, provider = 'anthropic', modelName?: string) => {
    const response = await api.post('/api/ai/chat', {
      chatId,
      prompt,
      provider,
      modelName,
    });
    return response.data;
  },
};
