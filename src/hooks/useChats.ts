import { WebSocketClient } from "@/client/api/websocket_client";
import { getAllChats } from "@/lib/chat";
import type { ChatSummary } from "@/lib/schemas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

// Query key factory for chats
export const chatsQueryKey = (appId: number | null | undefined) =>
  ["chats", appId ?? "all"] as const;

export function useChats(appId: number | null) {
  const queryClient = useQueryClient();

  // Fetch chats with TanStack Query caching
  const {
    data: chats = [],
    isLoading: loading,
  } = useQuery({
    queryKey: chatsQueryKey(appId),
    queryFn: async () => {
      return getAllChats(appId || undefined);
    },
    staleTime: 1 * 60 * 1000, // Consider fresh for 1 minute
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });

  // Handle title updates from WebSocket - update cache
  const handleTitleUpdate = useCallback(
    (chatId: number, title: string) => {
      // Update TanStack Query cache for all chat queries
      queryClient.setQueriesData<ChatSummary[]>(
        { queryKey: ["chats"] },
        (oldData) => {
          if (!oldData) return oldData;
          return oldData.map((chat) =>
            chat.id === chatId ? { ...chat, title } : chat
          );
        }
      );
    },
    [queryClient],
  );

  // Subscribe to title updates
  useEffect(() => {
    try {
      const wsClient = WebSocketClient.getInstance();
      const unsubscribe = wsClient.onTitleUpdate(handleTitleUpdate);
      return unsubscribe;
    } catch {
      // WebSocket not initialized yet - that's okay
      return undefined;
    }
  }, [handleTitleUpdate]);

  const refreshChats = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: chatsQueryKey(appId) });
    return chats;
  }, [queryClient, appId, chats]);

  return { chats, loading, refreshChats };
}
