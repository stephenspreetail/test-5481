import { previewModeAtom, selectedAppIdAtom } from "@/atoms/appAtoms";
import { chatInputValueAtom } from "@/atoms/chatAtoms";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useAuthCheck } from "@/hooks/useAuth";
import { useRunApp } from "@/hooks/useRunApp";
import { useSettings } from "@/hooks/useSettings";
import type { ZoomLevel } from "@/lib/schemas";
import LoginPage from "@/pages/login";
import { useAtomValue, useSetAtom } from "jotai";
import { Loader2 } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { Toaster } from "sonner";
import { ThemeProvider } from "../contexts/ThemeContext";
import { TitleBar } from "./TitleBar";

const DEFAULT_ZOOM_LEVEL: ZoomLevel = "100";

// Authenticated layout with all the hooks that make API calls
function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const { refreshAppIframe } = useRunApp();
  const previewMode = useAtomValue(previewModeAtom);
  const { settings } = useSettings();
  const setChatInput = useSetAtom(chatInputValueAtom);
  const selectedAppId = useAtomValue(selectedAppIdAtom);

  useEffect(() => {
    const zoomLevel = settings?.zoomLevel ?? DEFAULT_ZOOM_LEVEL;
    const zoomFactor = Number(zoomLevel) / 100;

    // Apply CSS zoom for web mode
    document.body.style.zoom = String(zoomFactor);

    return () => {
      document.body.style.zoom = String(Number(DEFAULT_ZOOM_LEVEL) / 100);
    };
  }, [settings?.zoomLevel]);

  // Global keyboard listener for refresh events
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+R (Windows/Linux) or Cmd+R (macOS)
      if (event.key === "r" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault(); // Prevent default browser refresh
        if (previewMode === "preview") {
          refreshAppIframe(); // Use our custom refresh function instead
        }
      }
    };

    // Add event listener to document
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup function to remove event listener
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [refreshAppIframe, previewMode]);

  useEffect(() => {
    setChatInput("");
  }, [selectedAppId]);

  return (
    <SidebarProvider>
      <TitleBar />
      <AppSidebar />
      <div
        id="layout-main-content-container"
        className="flex h-screenish w-full overflow-x-hidden mt-12 mb-4 mr-4 border-t border-l border-border rounded-lg bg-background"
      >
        {children}
      </div>
      <Toaster richColors />
    </SidebarProvider>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  // This triggers the auth check on mount
  const authState = useAuthCheck();

  return (
    <ThemeProvider>
      {authState === "checking" && (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-gray-600 dark:text-gray-400">Loading...</p>
          </div>
        </div>
      )}

      {authState === "unauthenticated" && <LoginPage />}

      {authState === "authenticated" && (
        <AuthenticatedLayout>{children}</AuthenticatedLayout>
      )}

      {/* Always show toaster for login errors */}
      {authState !== "authenticated" && <Toaster richColors />}
    </ThemeProvider>
  );
}
