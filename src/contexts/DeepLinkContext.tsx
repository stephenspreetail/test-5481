import React, { createContext, useContext, type ReactNode } from "react";

// No-op deep link context for web-only mode
// Deep links (e.g., kova://) only work in Electron desktop apps

interface DeepLinkData {
  type: string;
  timestamp: number;
}

interface DeepLinkContextType {
  lastDeepLink: DeepLinkData | null;
  clearLastDeepLink: () => void;
}

const DeepLinkContext = createContext<DeepLinkContextType>({
  lastDeepLink: null,
  clearLastDeepLink: () => {},
});

export function DeepLinkProvider({ children }: { children: ReactNode }) {
  // No-op implementation - deep links don't work in web mode
  return (
    <DeepLinkContext.Provider
      value={{
        lastDeepLink: null,
        clearLastDeepLink: () => {},
      }}
    >
      {children}
    </DeepLinkContext.Provider>
  );
}

export function useDeepLink() {
  return useContext(DeepLinkContext);
}
