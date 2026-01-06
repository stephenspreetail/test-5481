import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { initializeClient } from "./client/api/client_factory";
import { getTelemetryUserId, isTelemetryOptedIn } from "./hooks/useSettings";
import { showError } from "./lib/toast";
import { router } from "./router";

// Initialize web client
initializeClient({
  baseUrl: (import.meta as any).env?.VITE_API_URL || window.location.origin,
  getAccessToken: () => localStorage.getItem("accessToken"),
  onUnauthorized: () => {
    // TODO: Implement login page and redirect
    // For now, log the error instead of redirecting to avoid loop
    console.warn(
      "Unauthorized - authentication required. Login page not yet implemented.",
    );
    // window.location.href = "/login";
  },
});

// @ts-ignore
console.log("Running in mode:", import.meta.env.MODE);

// DIAGNOSTIC: Log page load time to detect full page reloads
const PAGE_LOAD_ID = `page-load-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
console.log(
  `🔄 [PAGE_LOAD] NEW PAGE LOAD - ID: ${PAGE_LOAD_ID} - timestamp: ${new Date().toISOString()}`,
);

// DIAGNOSTIC: Track Vite HMR events
if (import.meta.hot) {
  console.log(`🔥 [VITE_HMR] HMR is enabled - PAGE_ID: ${PAGE_LOAD_ID}`);

  import.meta.hot.on("vite:beforeFullReload", () => {
    console.log(
      `🔥 [VITE_HMR] FULL RELOAD TRIGGERED by Vite - PAGE_ID: ${PAGE_LOAD_ID}`,
    );
  });

  import.meta.hot.on("vite:beforeUpdate", (payload) => {
    console.log(
      `🔥 [VITE_HMR] Hot update incoming - PAGE_ID: ${PAGE_LOAD_ID}`,
      payload,
    );
  });

  import.meta.hot.on("vite:error", (payload) => {
    console.log(`🔥 [VITE_HMR] Error - PAGE_ID: ${PAGE_LOAD_ID}`, payload);
  });
}
window.__KOVA_PAGE_LOAD_ID = PAGE_LOAD_ID;
window.__KOVA_PAGE_LOAD_TIME = Date.now();

// DIAGNOSTIC: Track beforeunload events to detect navigation away
window.addEventListener("beforeunload", (event) => {
  console.log(
    `⚠️ [PAGE_UNLOAD] Page is being unloaded - PAGE_ID: ${PAGE_LOAD_ID} - timestamp: ${new Date().toISOString()}`,
  );
});

// DIAGNOSTIC: Track visibility changes
document.addEventListener("visibilitychange", () => {
  console.log(
    `👁️ [VISIBILITY] Page visibility changed to: ${document.visibilityState} - PAGE_ID: ${PAGE_LOAD_ID}`,
  );
});

// DIAGNOSTIC: Track uncaught errors
window.addEventListener("error", (event) => {
  console.log(
    `❌ [ERROR] Uncaught error - PAGE_ID: ${PAGE_LOAD_ID}`,
    event.error,
  );
});

window.addEventListener("unhandledrejection", (event) => {
  console.log(
    `❌ [REJECTION] Unhandled promise rejection - PAGE_ID: ${PAGE_LOAD_ID}`,
    event.reason,
  );
});

// Extend window type for diagnostic properties
declare global {
  interface Window {
    __KOVA_PAGE_LOAD_ID: string;
    __KOVA_PAGE_LOAD_TIME: number;
  }
}

interface MyMeta extends Record<string, unknown> {
  showErrorToast: boolean;
}

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: MyMeta;
    mutationMeta: MyMeta;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.showErrorToast) {
        showError(error);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.showErrorToast) {
        showError(error);
      }
    },
  }),
});

const posthogClient = posthog.init(
  "phc_5Vxx0XT8Ug3eWROhP6mm4D6D2DgIIKT232q4AKxC2ab",
  {
    api_host: "https://us.i.posthog.com",
    // @ts-ignore
    debug: import.meta.env.MODE === "development",
    autocapture: false,
    capture_exceptions: true,
    capture_pageview: false,
    before_send: (event) => {
      if (!isTelemetryOptedIn()) {
        console.debug("Telemetry not opted in, skipping event");
        return null;
      }
      const telemetryUserId = getTelemetryUserId();
      if (telemetryUserId) {
        posthogClient.identify(telemetryUserId);
      }

      if (event?.properties["$ip"]) {
        event.properties["$ip"] = null;
      }

      console.debug(
        "Telemetry opted in - UUID:",
        telemetryUserId,
        "sending event",
        event,
      );
      return event;
    },
    persistence: "localStorage",
  },
);

function App() {
  useEffect(() => {
    // DIAGNOSTIC: Log all router events
    const unsubOnBeforeLoad = router.subscribe("onBeforeLoad", (navigation) => {
      console.log(
        `🧭 [ROUTER] onBeforeLoad - from: ${navigation.fromLocation?.pathname} to: ${navigation.toLocation.pathname}, PAGE_ID: ${window.__KOVA_PAGE_LOAD_ID || "unknown"}`,
      );
    });

    const unsubOnLoad = router.subscribe("onLoad", (navigation) => {
      console.log(
        `🧭 [ROUTER] onLoad - from: ${navigation.fromLocation?.pathname} to: ${navigation.toLocation.pathname}, PAGE_ID: ${window.__KOVA_PAGE_LOAD_ID || "unknown"}`,
      );
    });

    // Subscribe to navigation state changes
    const unsubscribe = router.subscribe("onResolved", (navigation) => {
      // DIAGNOSTIC: Log all navigation events
      console.log(
        `🧭 [ROUTER] onResolved - from: ${navigation.fromLocation?.pathname} to: ${navigation.toLocation.pathname}, PAGE_ID: ${window.__KOVA_PAGE_LOAD_ID || "unknown"}`,
      );

      // Capture the navigation event in PostHog
      posthog.capture("navigation", {
        toPath: navigation.toLocation.pathname,
        fromPath: navigation.fromLocation?.pathname,
      });

      // Optionally capture as a standard pageview as well
      posthog.capture("$pageview", {
        path: navigation.toLocation.pathname,
      });
    });

    // Clean up subscription when component unmounts
    return () => {
      unsubOnBeforeLoad();
      unsubOnLoad();
      unsubscribe();
    };
  }, []);

  return <RouterProvider router={router} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PostHogProvider client={posthogClient}>
        <App />
      </PostHogProvider>
    </QueryClientProvider>
  </StrictMode>,
);
