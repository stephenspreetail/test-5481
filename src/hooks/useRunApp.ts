import {
  appOutputAtom,
  appUrlAtom,
  currentAppAtom,
  previewErrorMessageAtom,
  previewPanelKeyAtom,
  selectedAppIdAtom,
} from "@/atoms/appAtoms";
import { getClient } from "@/client/api/client_factory";
import { showInputRequest } from "@/lib/toast";
import { AppOutput } from "@/types";
import { atom } from "jotai";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";

const useRunAppLoadingAtom = atom(false);

export function useRunApp() {
  const [loading, setLoading] = useAtom(useRunAppLoadingAtom);
  const [app, setApp] = useAtom(currentAppAtom);
  const setAppOutput = useSetAtom(appOutputAtom);
  const [, setAppUrlObj] = useAtom(appUrlAtom);
  const setPreviewPanelKey = useSetAtom(previewPanelKeyAtom);
  const appId = useAtomValue(selectedAppIdAtom);
  const setPreviewErrorMessage = useSetAtom(previewErrorMessageAtom);

  const processProxyServerOutput = (output: AppOutput) => {
    const matchesProxyServerStart = output.message.includes(
      "[kova-proxy-server]started=[",
    );
    if (matchesProxyServerStart) {
      // Extract both proxy URL and original URL using regex
      const proxyUrlMatch = output.message.match(
        /\[kova-proxy-server\]started=\[(.*?)\]/,
      );
      const originalUrlMatch = output.message.match(/original=\[(.*?)\]/);

      if (proxyUrlMatch && proxyUrlMatch[1]) {
        const proxyUrl = proxyUrlMatch[1];
        const originalUrl = originalUrlMatch && originalUrlMatch[1];
        setAppUrlObj({
          appUrl: proxyUrl,
          appId: output.appId,
          originalUrl: originalUrl!,
        });
      }
    }
  };

  const processAppOutput = useCallback(
    (output: AppOutput) => {
      // Handle input requests specially
      if (output.type === "input-requested") {
        showInputRequest(output.message, async (response) => {
          try {
            const client = getClient();
            await client.respondToAppInput({
              appId: output.appId,
              response,
            });
          } catch (error) {
            console.error("Failed to respond to app input:", error);
          }
        });
        return; // Don't add to regular output
      }

      // Add to regular app output
      setAppOutput((prev) => [...prev, output]);

      // Process proxy server output
      processProxyServerOutput(output);
    },
    [setAppOutput],
  );
  const runApp = useCallback(
    async (appId: number) => {
      setLoading(true);
      try {
        const client = getClient();
        console.debug("Running app", appId);

        // Clear the URL and add restart message
        setAppUrlObj((prevAppUrlObj) => {
          if (prevAppUrlObj?.appId !== appId) {
            return { appUrl: null, appId: null, originalUrl: null };
          }
          return prevAppUrlObj; // No change needed
        });

        setAppOutput((prev) => [
          ...prev,
          {
            message: "Trying to restart app...",
            type: "stdout",
            appId,
            timestamp: Date.now(),
          },
        ]);
        const app = await client.getApp(appId);
        setApp(app);
        await client.runApp(appId, processAppOutput);
        setPreviewErrorMessage(undefined);
      } catch (error) {
        console.error(`Error running app ${appId}:`, error);
        setPreviewErrorMessage(
          error instanceof Error
            ? { message: error.message, source: "kova-app" }
            : {
                message: error?.toString() || "Unknown error",
                source: "kova-app",
              },
        );
      } finally {
        setLoading(false);
      }
    },
    [processAppOutput],
  );

  const stopApp = useCallback(async (appId: number) => {
    if (appId === null) {
      return;
    }

    setLoading(true);
    try {
      const client = getClient();
      await client.stopApp(appId);

      setPreviewErrorMessage(undefined);
    } catch (error) {
      console.error(`Error stopping app ${appId}:`, error);
      setPreviewErrorMessage(
        error instanceof Error
          ? { message: error.message, source: "kova-app" }
          : {
              message: error?.toString() || "Unknown error",
              source: "kova-app",
            },
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const onHotModuleReload = useCallback(() => {
    setPreviewPanelKey((prevKey) => prevKey + 1);
  }, [setPreviewPanelKey]);

  const restartApp = useCallback(
    async ({
      removeNodeModules = false,
    }: { removeNodeModules?: boolean } = {}) => {
      if (appId === null) {
        return;
      }
      setLoading(true);
      try {
        const client = getClient();
        console.debug(
          "Restarting app",
          appId,
          removeNodeModules ? "with node_modules cleanup" : "",
        );

        // Clear the URL and add restart message
        setAppUrlObj({ appUrl: null, appId: null, originalUrl: null });
        setAppOutput((prev) => [
          ...prev,
          {
            message: "Restarting app...",
            type: "stdout",
            appId,
            timestamp: Date.now(),
          },
        ]);

        const app = await client.getApp(appId);
        setApp(app);
        await client.restartApp(
          appId,
          (output) => {
            // Handle HMR updates before processing
            if (
              output.message.includes("hmr update") &&
              output.message.includes("[vite]")
            ) {
              onHotModuleReload();
            }
            // Process normally (including input requests)
            processAppOutput(output);
          },
          removeNodeModules,
        );
      } catch (error) {
        console.error(`Error restarting app ${appId}:`, error);
        setPreviewErrorMessage(
          error instanceof Error
            ? { message: error.message, source: "kova-app" }
            : {
                message: error?.toString() || "Unknown error",
                source: "kova-app",
              },
        );
      } finally {
        setPreviewPanelKey((prevKey) => prevKey + 1);
        setLoading(false);
      }
    },
    [
      appId,
      setApp,
      setAppOutput,
      setAppUrlObj,
      setPreviewPanelKey,
      processAppOutput,
      onHotModuleReload,
    ],
  );

  const refreshAppIframe = useCallback(async () => {
    setPreviewPanelKey((prevKey) => prevKey + 1);
  }, [setPreviewPanelKey]);

  return {
    loading,
    runApp,
    stopApp,
    restartApp,
    app,
    refreshAppIframe,
  };
}
