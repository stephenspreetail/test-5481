import { getClient } from "@/client/api/client_factory";
import { useEffect, useState } from "react";

export function useLoadAppFile(appId: number | null | undefined, filePath: string | null | undefined) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadFile = async () => {
      // Skip if appId or filePath is missing
      if (appId == null || filePath == null) {
        setContent(null);
        setError(null);
        return;
      }

      setLoading(true);
      try {
        const client = getClient();
        const result = await client.readAppFile({ appId, filePath });

        setContent(result.content);
        setError(null);
      } catch (error) {
        console.error(
          `Error loading file ${filePath} for app ${appId}:`,
          error,
        );
        setError(error instanceof Error ? error : new Error(String(error)));
        setContent(null);
      } finally {
        setLoading(false);
      }
    };

    loadFile();
  }, [appId, filePath]);

  const refreshFile = async () => {
    if (appId == null || filePath == null) {
      return;
    }

    setLoading(true);
    try {
      const client = getClient();
      const result = await client.readAppFile({ appId, filePath });
      setContent(result.content);
      setError(null);
    } catch (error) {
      console.error(
        `Error refreshing file ${filePath} for app ${appId}:`,
        error,
      );
      setError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoading(false);
    }
  };

  return { content, loading, error, refreshFile };
}
