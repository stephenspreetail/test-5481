import { getClient } from "@/client/api/client_factory";
import { type Template, localTemplatesData } from "@/shared/templates";
import { useQuery } from "@tanstack/react-query";

export function useTemplates() {
  const query = useQuery({
    queryKey: ["templates"],
    queryFn: async (): Promise<Template[]> => {
      const client = getClient();
      return client.getTemplates();
    },
    initialData: localTemplatesData,
    meta: {
      showErrorToast: true,
    },
  });

  return {
    templates: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
