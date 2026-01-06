import {
  lmStudioModelsAtom,
  lmStudioModelsErrorAtom,
  lmStudioModelsLoadingAtom,
} from "@/atoms/localModelsAtoms";
import { getClient } from "@/client/api/client_factory";
import { useAtom } from "jotai";
import { useCallback } from "react";

export function useLocalLMSModels() {
  const [models, setModels] = useAtom(lmStudioModelsAtom);
  const [loading, setLoading] = useAtom(lmStudioModelsLoadingAtom);
  const [error, setError] = useAtom(lmStudioModelsErrorAtom);

  const client = getClient();

  /**
   * Load local models from Ollama
   */
  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const modelList = await client.listLocalLMStudioModels();
      setModels(modelList);
      setError(null);

      return modelList;
    } catch (error) {
      console.error("Error loading local LMStudio models:", error);
      setError(error instanceof Error ? error : new Error(String(error)));
      return [];
    } finally {
      setLoading(false);
    }
  }, [client, setModels, setError, setLoading]);

  return {
    models,
    loading,
    error,
    loadModels,
  };
}
