import { selectedAppIdAtom } from "@/atoms/appAtoms";
import {
  chatErrorByIdAtom,
  chatMessagesByIdAtom,
  chatStreamCountByIdAtom,
  isStreamingByIdAtom,
  recentStreamChatIdsAtom,
} from "@/atoms/chatAtoms";
import { isPreviewOpenAtom } from "@/atoms/viewAtoms";
import { getClient } from "@/client/api/client_factory";
import { showExtraFilesToast } from "@/lib/toast";
import type { FileAttachment, Message } from "@/types";
import type { ChatResponseEnd } from "@/types";
import { useSearch } from "@tanstack/react-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { usePostHog } from "posthog-js/react";
import { useCallback } from "react";
import { useChats } from "./useChats";
import { useCheckProblems } from "./useCheckProblems";
import { useCountTokens } from "./useCountTokens";
import { useLoadApp } from "./useLoadApp";
import { useProposal } from "./useProposal";
import { useRunApp } from "./useRunApp";
import { useSettings } from "./useSettings";
import { useVersions } from "./useVersions";

export function getRandomNumberId() {
  return Math.floor(Math.random() * 1_000_000_000_000_000);
}

export function useStreamChat({
  hasChatId = true,
}: { hasChatId?: boolean } = {}) {
  const setMessagesById = useSetAtom(chatMessagesByIdAtom);
  const isStreamingById = useAtomValue(isStreamingByIdAtom);
  const setIsStreamingById = useSetAtom(isStreamingByIdAtom);
  const errorById = useAtomValue(chatErrorByIdAtom);
  const setErrorById = useSetAtom(chatErrorByIdAtom);
  const setIsPreviewOpen = useSetAtom(isPreviewOpenAtom);
  const [selectedAppId] = useAtom(selectedAppIdAtom);
  const { refreshChats } = useChats(selectedAppId);
  const { refreshApp } = useLoadApp(selectedAppId);

  const setStreamCountById = useSetAtom(chatStreamCountByIdAtom);
  const { refreshVersions } = useVersions(selectedAppId);
  const { refreshAppIframe } = useRunApp();
  const { checkProblems } = useCheckProblems(selectedAppId);
  const { settings } = useSettings();
  const setRecentStreamChatIds = useSetAtom(recentStreamChatIdsAtom);
  const posthog = usePostHog();
  let chatId: number | undefined;

  if (hasChatId) {
    const { id } = useSearch({ from: "/chat" });
    chatId = id;
  }
  let { refreshProposal } = hasChatId ? useProposal(chatId) : useProposal();
  const { invalidateTokenCount } = useCountTokens(chatId ?? null, "");

  const streamMessage = useCallback(
    async ({
      prompt,
      chatId,
      redo,
      attachments,
      onSettled,
    }: {
      prompt: string;
      chatId: number;
      redo?: boolean;
      attachments?: FileAttachment[];
      onSettled?: () => void;
    }) => {
      if (
        (!prompt.trim() && (!attachments || attachments.length === 0)) ||
        !chatId
      ) {
        return;
      }

      setRecentStreamChatIds((prev) => {
        const next = new Set(prev);
        next.add(chatId);
        return next;
      });

      setErrorById((prev) => {
        const next = new Map(prev);
        next.set(chatId, null);
        return next;
      });
      setIsStreamingById((prev) => {
        const next = new Map(prev);
        next.set(chatId, true);
        return next;
      });

      let hasIncrementedStreamCount = false;
      console.log(
        `💬 [STREAM] Starting stream - chatId: ${chatId}, prompt length: ${prompt.length}, PAGE_ID: ${window.__KOVA_PAGE_LOAD_ID || "unknown"}`,
      );
      try {
        getClient().streamMessage(prompt, {
          chatId,
          redo,
          attachments,
          onUpdate: (updatedMessages: Message[]) => {
            if (!hasIncrementedStreamCount) {
              setStreamCountById((prev) => {
                const next = new Map(prev);
                next.set(chatId, (prev.get(chatId) ?? 0) + 1);
                return next;
              });
              hasIncrementedStreamCount = true;
            }

            setMessagesById((prev) => {
              const next = new Map(prev);
              next.set(chatId, updatedMessages);
              return next;
            });
          },
          onEnd: (response: ChatResponseEnd) => {
            console.log(
              `💬 [STREAM] onEnd called - chatId: ${chatId}, updatedFiles: ${response.updatedFiles}, PAGE_ID: ${window.__KOVA_PAGE_LOAD_ID || "unknown"}`,
            );
            if (response.updatedFiles) {
              console.log(
                `💬 [STREAM] Setting preview open and refreshing iframe - PAGE_ID: ${window.__KOVA_PAGE_LOAD_ID || "unknown"}`,
              );
              setIsPreviewOpen(true);
              refreshAppIframe();
              if (settings?.enableAutoFixProblems) {
                checkProblems();
              }
            }
            if (response.extraFiles) {
              showExtraFilesToast({
                files: response.extraFiles,
                error: response.extraFilesError,
                posthog,
              });
            }
            refreshProposal(chatId);

            // Keep the same as below
            setIsStreamingById((prev) => {
              const next = new Map(prev);
              next.set(chatId, false);
              return next;
            });
            refreshChats();
            refreshApp();
            refreshVersions();
            invalidateTokenCount();
            onSettled?.();
          },
          onError: (errorMessage: string) => {
            console.error(`[CHAT] Stream error for ${chatId}:`, errorMessage);
            setErrorById((prev) => {
              const next = new Map(prev);
              next.set(chatId, errorMessage);
              return next;
            });

            // Keep the same as above
            setIsStreamingById((prev) => {
              const next = new Map(prev);
              next.set(chatId, false);
              return next;
            });
            refreshChats();
            refreshApp();
            refreshVersions();
            invalidateTokenCount();
            onSettled?.();
          },
        });
      } catch (error) {
        console.error("[CHAT] Exception during streaming setup:", error);
        setIsStreamingById((prev) => {
          const next = new Map(prev);
          if (chatId) next.set(chatId, false);
          return next;
        });
        setErrorById((prev) => {
          const next = new Map(prev);
          if (chatId)
            next.set(
              chatId,
              error instanceof Error ? error.message : String(error),
            );
          return next;
        });
        onSettled?.();
      }
    },
    [
      setMessagesById,
      setIsStreamingById,
      setIsPreviewOpen,
      checkProblems,
      selectedAppId,
      settings,
    ],
  );

  return {
    streamMessage,
    isStreaming:
      hasChatId && chatId !== undefined
        ? (isStreamingById.get(chatId) ?? false)
        : false,
    error:
      hasChatId && chatId !== undefined
        ? (errorById.get(chatId) ?? null)
        : null,
    setError: (value: string | null) =>
      setErrorById((prev) => {
        const next = new Map(prev);
        if (chatId !== undefined) next.set(chatId, value);
        return next;
      }),
    setIsStreaming: (value: boolean) =>
      setIsStreamingById((prev) => {
        const next = new Map(prev);
        if (chatId !== undefined) next.set(chatId, value);
        return next;
      }),
  };
}
