import { getClient } from "@/client/api/client_factory";
import { showError, showSuccess } from "@/lib/toast";
import type { ListAppsResponse } from "@/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appsQueryKey } from "./useLoadApps";

export function useAddAppToFavorite() {
  const queryClient = useQueryClient();

  const mutation = useMutation<boolean, Error, number>({
    mutationFn: async (appId: number): Promise<boolean> => {
      const result = await getClient().addAppToFavorite(appId);
      return result.isFavorite;
    },
    onSuccess: (newIsFavorite, appId) => {
      // Update TanStack Query cache directly
      queryClient.setQueryData(appsQueryKey, (oldData: ListAppsResponse | undefined) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          apps: oldData.apps.map((app) =>
            app.id === appId ? { ...app, isFavorite: newIsFavorite } : app,
          ),
        };
      });
      showSuccess("App favorite status updated");
    },
    onError: (error) => {
      showError(error.message || "Failed to update favorite status");
    },
  });

  return {
    toggleFavorite: mutation.mutate,
    toggleFavoriteAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error,
    isError: mutation.isError,
    isSuccess: mutation.isSuccess,
  };
}
