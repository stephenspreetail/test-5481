import { getClient } from "@/client/api/client_factory";
import { type UserSettings } from "@/lib/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useRef } from "react";
import { useAppVersion } from "./useAppVersion";

const TELEMETRY_CONSENT_KEY = "kovaTelemetryConsent";
const TELEMETRY_USER_ID_KEY = "kovaTelemetryUserId";

export function isTelemetryOptedIn() {
  return window.localStorage.getItem(TELEMETRY_CONSENT_KEY) === "opted_in";
}

export function getTelemetryUserId(): string | null {
  return window.localStorage.getItem(TELEMETRY_USER_ID_KEY);
}

// Query keys for cache management
export const settingsQueryKey = ["settings"] as const;
export const envVarsQueryKey = ["envVars"] as const;

export function useSettings() {
  const posthog = usePostHog();
  const queryClient = useQueryClient();
  const appVersion = useAppVersion();
  const hasLoggedInitialLoad = useRef(false);

  // Fetch settings with TanStack Query caching
  const {
    data: settings,
    isLoading: settingsLoading,
    error: settingsError,
  } = useQuery({
    queryKey: settingsQueryKey,
    queryFn: async () => {
      const client = getClient();
      const userSettings = await client.getUserSettings();
      processSettingsForTelemetry(userSettings);
      return userSettings;
    },
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });

  // Fetch env vars with TanStack Query caching
  const {
    data: envVars,
    isLoading: envVarsLoading,
  } = useQuery({
    queryKey: envVarsQueryKey,
    queryFn: async () => {
      const client = getClient();
      return (client as any).getEnvVars?.() ?? {};
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Log initial load event once
  useEffect(() => {
    if (settings && appVersion && !hasLoggedInitialLoad.current) {
      posthog.capture("app:initial-load", {
        isPro: Boolean(settings.providerSettings?.auto?.apiKey?.value),
        appVersion,
      });
      hasLoggedInitialLoad.current = true;
    }
  }, [settings, appVersion, posthog]);

  // Mutation for updating settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: Partial<UserSettings>) => {
      const client = getClient();
      const updatedSettings = await client.setUserSettings(newSettings);
      processSettingsForTelemetry(updatedSettings);
      return updatedSettings;
    },
    onSuccess: (updatedSettings) => {
      // Update the cache with new data
      queryClient.setQueryData(settingsQueryKey, updatedSettings);
    },
  });

  const updateSettings = useCallback(
    async (newSettings: Partial<UserSettings>) => {
      return updateSettingsMutation.mutateAsync(newSettings);
    },
    [updateSettingsMutation.mutateAsync],
  );

  return {
    settings: settings ?? null,
    envVars: envVars ?? {},
    loading: settingsLoading || envVarsLoading,
    error: settingsError instanceof Error ? settingsError : null,
    updateSettings,
    refreshSettings: () => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      queryClient.invalidateQueries({ queryKey: envVarsQueryKey });
    },
  };
}

function processSettingsForTelemetry(settings: UserSettings) {
  if (settings.telemetryConsent) {
    window.localStorage.setItem(
      TELEMETRY_CONSENT_KEY,
      settings.telemetryConsent,
    );
  } else {
    window.localStorage.removeItem(TELEMETRY_CONSENT_KEY);
  }
  if (settings.telemetryUserId) {
    window.localStorage.setItem(
      TELEMETRY_USER_ID_KEY,
      settings.telemetryUserId,
    );
  } else {
    window.localStorage.removeItem(TELEMETRY_USER_ID_KEY);
  }
}
