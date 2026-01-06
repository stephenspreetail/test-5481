import { getClient } from "@/client/api/client_factory";
import type { LanguageModel } from "@/types";
import { useQuery } from "@tanstack/react-query";

/**
 * Fetches the list of available language models for a specific provider.
 *
 * @param providerId The ID of the language model provider.
 * @returns TanStack Query result object for the language models.
 */
export function useLanguageModelsForProvider(providerId: string | undefined) {
  const client = getClient();

  return useQuery<
    LanguageModel[],
    Error // Specify Error type for better error handling
  >({
    queryKey: ["language-models", providerId],
    queryFn: async () => {
      if (!providerId) {
        // Avoid calling API if providerId is not set
        // Return an empty array as it's a query, not an error state
        return [];
      }
      return client.getLanguageModels({ providerId });
    },
    enabled: !!providerId,
  });
}
