import { getClient } from "@/client/api/client_factory";
import { showError } from "@/lib/toast";
import type { CreateAppParams, CreateAppResult } from "@/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useCreateApp() {
  const queryClient = useQueryClient();

  const mutation = useMutation<CreateAppResult, Error, CreateAppParams>({
    mutationFn: async (params: CreateAppParams) => {
      if (!params.name.trim()) {
        throw new Error("App name is required");
      }

      const client = getClient();
      return client.createApp(params);
    },
    onSuccess: () => {
      // Invalidate apps list to trigger refetch
      queryClient.invalidateQueries({ queryKey: ["apps"] });
    },
    onError: (error) => {
      showError(error);
    },
  });

  const createApp = async (
    params: CreateAppParams,
  ): Promise<CreateAppResult> => {
    return mutation.mutateAsync(params);
  };

  return {
    createApp,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}
