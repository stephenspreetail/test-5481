import { versionsListAtom } from "@/atoms/appAtoms";
import { getClient } from "@/client/api/client_factory";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";

import { chatMessagesByIdAtom, selectedChatIdAtom } from "@/atoms/chatAtoms";
import type { RevertVersionResponse, Version } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useVersions(appId: number | null) {
  const [, setVersionsAtom] = useAtom(versionsListAtom);
  const selectedChatId = useAtomValue(selectedChatIdAtom);
  const setMessagesById = useSetAtom(chatMessagesByIdAtom);
  const queryClient = useQueryClient();

  const {
    data: versions,
    isLoading: loading,
    error,
    refetch: refreshVersions,
  } = useQuery<Version[], Error>({
    queryKey: ["versions", appId],
    queryFn: async (): Promise<Version[]> => {
      if (appId === null) {
        return [];
      }
      const client = getClient();
      return client.listVersions({ appId });
    },
    enabled: appId !== null,
    initialData: [],
    meta: { showErrorToast: true },
  });

  useEffect(() => {
    if (versions) {
      setVersionsAtom(versions);
    }
  }, [versions, setVersionsAtom]);

  const revertVersionMutation = useMutation<
    RevertVersionResponse,
    Error,
    { versionId: string }
  >({
    mutationFn: async ({ versionId }: { versionId: string }) => {
      const currentAppId = appId;
      if (currentAppId === null) {
        throw new Error("App ID is null");
      }
      const client = getClient();
      return client.revertVersion({
        appId: currentAppId,
        previousVersionId: versionId,
      });
    },
    onSuccess: async (result) => {
      if ("successMessage" in result) {
        toast.success(result.successMessage);
      } else if ("warningMessage" in result) {
        toast.warning(result.warningMessage);
      }
      await queryClient.invalidateQueries({ queryKey: ["versions", appId] });
      await queryClient.invalidateQueries({
        queryKey: ["currentBranch", appId],
      });
      if (selectedChatId) {
        const chat = await getClient().getChat(selectedChatId);
        setMessagesById((prev) => {
          const next = new Map(prev);
          next.set(selectedChatId, chat.messages);
          return next;
        });
      }
      await queryClient.invalidateQueries({
        queryKey: ["problems", appId],
      });
    },
    meta: { showErrorToast: true },
  });

  return {
    versions: versions || [],
    loading,
    error,
    refreshVersions,
    revertVersion: revertVersionMutation.mutateAsync,
    isRevertingVersion: revertVersionMutation.isPending,
  };
}
