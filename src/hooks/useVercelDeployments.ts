import { getClient } from "@/client/api/client_factory";
import { VercelDeployment } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useVercelDeployments(appId: number) {
  const queryClient = useQueryClient();

  const {
    data: deployments = [],
    isLoading,
    error,
    refetch,
  } = useQuery<VercelDeployment[], Error>({
    queryKey: ["vercel-deployments", appId],
    queryFn: async () => {
      const client = getClient();
      return client.getVercelDeployments({ appId });
    },
    // enabled: false, // Don't auto-fetch, only fetch when explicitly requested
  });

  const disconnectProjectMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      const client = getClient();
      return client.disconnectVercelProject({ appId });
    },
    onSuccess: () => {
      // Clear deployments cache when project is disconnected
      queryClient.removeQueries({ queryKey: ["vercel-deployments", appId] });
    },
  });

  const getDeployments = async () => {
    return refetch();
  };

  const disconnectProject = async () => {
    return disconnectProjectMutation.mutateAsync();
  };

  return {
    deployments,
    isLoading,
    error: error?.message || null,
    getDeployments,
    disconnectProject,
    isDisconnecting: disconnectProjectMutation.isPending,
    disconnectError: disconnectProjectMutation.error?.message || null,
  };
}
