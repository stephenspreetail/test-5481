import { getClient } from "@/client/api/client_factory";
import type { ChatSearchResult } from "@/lib/schemas";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

export function useSearchChats(appId: number | null, query: string) {
  const enabled = Boolean(appId && query && query.trim().length > 0);

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ["search-chats", appId, query],
    enabled,
    queryFn: async (): Promise<ChatSearchResult[]> => {
      // Non-null assertion safe due to enabled guard
      return getClient().searchChats(appId as number, query);
    },
    placeholderData: keepPreviousData,
    retry: 0,
  });

  return {
    chats: data ?? [],
    loading: enabled ? isFetching || isLoading : false,
  };
}
