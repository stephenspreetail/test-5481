import { chatsAtom, chatsLoadingAtom } from "@/atoms/chatAtoms";
import { WebSocketClient } from "@/client/api/websocket_client";
import { getAllChats } from "@/lib/chat";
import type { ChatSummary } from "@/lib/schemas";
import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";

export function useChats(appId: number | null) {
  const [chats, setChats] = useAtom(chatsAtom);
  const [loading, setLoading] = useAtom(chatsLoadingAtom);

  // Handle title updates from WebSocket
  const handleTitleUpdate = useCallback(
    (chatId: number, title: string) => {
      setChats((prevChats) =>
        prevChats.map((chat) =>
          chat.id === chatId ? { ...chat, title } : chat,
        ),
      );
    },
    [setChats],
  );

  useEffect(() => {
    const fetchChats = async () => {
      try {
        setLoading(true);
        const chatList = await getAllChats(appId || undefined);
        setChats(chatList);
      } catch (error) {
        console.error("Failed to load chats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchChats();
  }, [appId, setChats, setLoading]);

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

  const refreshChats = async () => {
    try {
      setLoading(true);
      const chatList = await getAllChats(appId || undefined);
      setChats(chatList);
      return chatList;
    } catch (error) {
      console.error("Failed to refresh chats:", error);
      return [] as ChatSummary[];
    } finally {
      setLoading(false);
    }
  };

  return { chats, loading, refreshChats };
}
