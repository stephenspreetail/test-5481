import { getClient } from "@/client/api/client_factory";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface PromptItem {
  id: number;
  title: string;
  description: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export function usePrompts() {
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: ["prompts"],
    queryFn: async (): Promise<PromptItem[]> => {
      const client = getClient();
      return client.listPrompts();
    },
    meta: { showErrorToast: true },
  });

  const createMutation = useMutation({
    mutationFn: async (params: {
      title: string;
      description?: string;
      content: string;
    }): Promise<PromptItem> => {
      const client = getClient();
      return client.createPrompt(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
    },
    meta: {
      showErrorToast: true,
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (params: {
      id: number;
      title: string;
      description?: string;
      content: string;
    }): Promise<void> => {
      const client = getClient();
      return client.updatePrompt(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
    },
    meta: {
      showErrorToast: true,
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number): Promise<void> => {
      const client = getClient();
      return client.deletePrompt(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
    },
    meta: {
      showErrorToast: true,
    },
  });

  return {
    prompts: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error,
    refetch: listQuery.refetch,
    createPrompt: createMutation.mutateAsync,
    updatePrompt: updateMutation.mutateAsync,
    deletePrompt: deleteMutation.mutateAsync,
  };
}
