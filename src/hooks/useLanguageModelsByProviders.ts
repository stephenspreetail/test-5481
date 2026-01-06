import { getClient } from "@/client/api/client_factory";
import type { LanguageModel } from "@/types";
import { useQuery } from "@tanstack/react-query";

/**
 * Fetches all available language models grouped by their provider IDs.
 *
 * @returns TanStack Query result object for the language models organized by provider.
 */
export function useLanguageModelsByProviders() {
  const client = getClient();

  return useQuery<Record<string, LanguageModel[]>, Error>({
    queryKey: ["language-models-by-providers"],
    queryFn: async () => {
      return client.getLanguageModelsByProviders();
    },
  });
}
