import { previewModeAtom, selectedAppIdAtom } from "@/atoms/appAtoms";
import { chatInputValueAtom } from "@/atoms/chatAtoms";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useRunApp } from "@/hooks/useRunApp";
import { useSettings } from "@/hooks/useSettings";
import type { ZoomLevel } from "@/lib/schemas";
import { useAtomValue, useSetAtom } from "jotai";
import { type ReactNode, useEffect } from "react";
import { Toaster } from "sonner";
import { ThemeProvider } from "../contexts/ThemeContext";
import { TitleBar } from "./TitleBar";

const DEFAULT_ZOOM_LEVEL: ZoomLevel = "100";

export default function RootLayout({ children }: { children: ReactNode }) {
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
    <>
      <ThemeProvider>
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
      </ThemeProvider>
    </>
  );
}
