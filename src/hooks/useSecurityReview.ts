import { getClient } from "@/client/api/client_factory";
import { useQuery } from "@tanstack/react-query";

export function useSecurityReview(appId: number | null) {
  return useQuery({
    queryKey: ["security-review", appId],
    queryFn: async () => {
      if (!appId) {
        throw new Error("App ID is required");
      }
      const client = getClient();
      return client.getLatestSecurityReview(appId);
    },
    enabled: appId !== null,
    retry: false,
    meta: {
      showErrorToast: false, // Don't show error toast if no security review found
    },
  });
}
