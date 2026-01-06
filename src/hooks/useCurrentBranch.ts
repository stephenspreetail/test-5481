import { getClient } from "@/client/api/client_factory";
import type { BranchResult } from "@/types";
import { useQuery } from "@tanstack/react-query";

export function useCurrentBranch(appId: number | null) {
  const {
    data: branchInfo,
    isLoading,
    refetch: refetchBranchInfo,
  } = useQuery<BranchResult, Error>({
    queryKey: ["currentBranch", appId],
    queryFn: async (): Promise<BranchResult> => {
      if (appId === null) {
        // This case should ideally be handled by the `enabled` option
        // but as a safeguard, and to ensure queryFn always has a valid appId if called.
        throw new Error("appId is null, cannot fetch current branch.");
      }
      const client = getClient();
      return client.getCurrentBranch(appId);
    },
    enabled: appId !== null,
    meta: { showErrorToast: true },
  });

  return {
    branchInfo,
    isLoading,
    refetchBranchInfo,
  };
}
