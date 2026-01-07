import { getClient } from "@/client/api/client_factory";
import { WebSocketClient } from "@/client/api/websocket_client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

// Query key for cache management
export const appsQueryKey = ["apps"] as const;

export function useLoadApps() {
  const queryClient = useQueryClient();

  // Fetch apps with TanStack Query caching
  const {
    data,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: appsQueryKey,
    queryFn: async () => {
      const client = getClient();
      return client.listApps();
    },
    staleTime: 2 * 60 * 1000, // Consider fresh for 2 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });

  // Handle app name update from WebSocket - update cache
  const handleAppNameUpdate = useCallback(
    (appId: number, name: string) => {
      // Update TanStack Query cache
      queryClient.setQueryData(appsQueryKey, (oldData: typeof data) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          apps: oldData.apps.map((app) =>
            app.id === appId ? { ...app, name } : app
          ),
        };
      });
    },
    [queryClient],
  );

  // Subscribe to app name updates
  useEffect(() => {
    try {
      const wsClient = WebSocketClient.getInstance();
      const unsubscribe = wsClient.onAppNameUpdate(handleAppNameUpdate);
      return unsubscribe;
    } catch {
      // WebSocket not initialized yet - that's okay
      return undefined;
    }
  }, [handleAppNameUpdate]);

  const refreshApps = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: appsQueryKey });
  }, [queryClient]);

  return {
    apps: data?.apps ?? [],
    loading,
    error: error instanceof Error ? error : null,
    refreshApps,
  };
}
