import { getClient } from "@/client/api/client_factory";
import { useQuery } from "@tanstack/react-query";

export const useCheckName = (appName: string) => {
  return useQuery({
    queryKey: ["checkAppName", appName],
    queryFn: async () => {
      const result = await getClient().checkAppName({ appName });
      return result;
    },
    enabled: !!appName && !!appName.trim(),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: false,
    staleTime: 300000, // 5 minutes
  });
};
