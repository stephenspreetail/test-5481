import { currentAppAtom } from "@/atoms/appAtoms";
import { getClient } from "@/client/api/client_factory";
import { WebSocketClient } from "@/client/api/websocket_client";
import { App } from "@/types";
import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";

export function useLoadApp(appId: number | null) {
  const [, setApp] = useAtom(currentAppAtom);
  const queryClient = useQueryClient();

  const {
    data: appData,
    isLoading: loading,
    error,
    refetch: refreshApp,
  } = useQuery<App | null, Error>({
    queryKey: ["app", appId],
    queryFn: async () => {
      if (appId === null) {
        return null;
      }
      const client = getClient();
      return client.getApp(appId);
    },
    enabled: appId !== null,
    // Deliberately not showing error toast here because
    // this will pop up when app is deleted.
    // meta: { showErrorToast: true },
  });

  // Handle app name update from WebSocket
  const handleAppNameUpdate = useCallback((updatedAppId: number, name: string) => {
    if (appId === updatedAppId) {
      // Update the query cache directly for immediate UI update
      queryClient.setQueryData<App | null>(["app", appId], (old) =>
        old ? { ...old, name } : null
      );
      // Also update the atom
      setApp((prev) => prev ? { ...prev, name } : null);
    }
  }, [appId, queryClient, setApp]);

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

  useEffect(() => {
    if (appId === null) {
      setApp(null);
    } else if (appData !== undefined) {
      setApp(appData);
    }
  }, [appId, appData, setApp]);

  return { app: appData, loading, error, refreshApp };
}

// Function to invalidate the app query
export const invalidateAppQuery = (
  queryClient: QueryClient,
  { appId }: { appId: number | null },
) => {
  return queryClient.invalidateQueries({ queryKey: ["app", appId] });
};
