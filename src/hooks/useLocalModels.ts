import {
  localModelsAtom,
  localModelsErrorAtom,
  localModelsLoadingAtom,
} from "@/atoms/localModelsAtoms";
import { getClient } from "@/client/api/client_factory";
import { useAtom } from "jotai";
import { useCallback } from "react";

export function useLocalModels() {
  const [models, setModels] = useAtom(localModelsAtom);
  const [loading, setLoading] = useAtom(localModelsLoadingAtom);
  const [error, setError] = useAtom(localModelsErrorAtom);

  const client = getClient();

  /**
   * Load local models from Ollama
   */
  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const modelList = await client.listLocalOllamaModels();
      setModels(modelList);
      setError(null);

      return modelList;
    } catch (error) {
      console.error("Error loading local Ollama models:", error);
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
