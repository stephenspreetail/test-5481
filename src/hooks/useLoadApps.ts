import { appBasePathAtom, appsListAtom } from "@/atoms/appAtoms";
import { getClient } from "@/client/api/client_factory";
import { WebSocketClient } from "@/client/api/websocket_client";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";

export function useLoadApps() {
  const [apps, setApps] = useAtom(appsListAtom);
  const [, setAppBasePath] = useAtom(appBasePathAtom);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refreshApps = useCallback(async () => {
    setLoading(true);
    try {
      const client = getClient();
      const appListResponse = await client.listApps();
      setApps(appListResponse.apps);
      setAppBasePath(appListResponse.appBasePath);
      setError(null);
    } catch (error) {
      console.error("Error refreshing apps:", error);
      setError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoading(false);
    }
  }, [setApps, setError, setLoading]);

  // Handle app name update from WebSocket
  const handleAppNameUpdate = useCallback(
    (appId: number, name: string) => {
      setApps((prev) =>
        prev.map((app) => (app.id === appId ? { ...app, name } : app)),
      );
    },
    [setApps],
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

  useEffect(() => {
    refreshApps();
  }, [refreshApps]);

  return { apps, loading, error, refreshApps };
}
