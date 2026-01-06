import { getClient } from "@/client/api/client_factory";
import { AppSearchResult } from "@/lib/schemas";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

export function useSearchApps(query: string) {
  const enabled = Boolean(query && query.trim().length > 0);

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ["search-apps", query],
    enabled,
    queryFn: async (): Promise<AppSearchResult[]> => {
      return getClient().searchApps(query);
    },
    placeholderData: keepPreviousData,
    retry: 0,
  });

  return {
    apps: data ?? [],
    loading: enabled ? isFetching || isLoading : false,
  };
}
