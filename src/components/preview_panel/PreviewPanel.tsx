import { useAtom, useAtomValue } from "jotai";
import {
  appOutputAtom,
  previewModeAtom,
  previewPanelKeyAtom,
  selectedAppIdAtom,
} from "../../atoms/appAtoms";

import { useRunApp } from "@/hooks/useRunApp";
import { ChevronDown, ChevronUp, Logs } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { CodeView } from "./CodeView";
import { ConfigurePanel } from "./ConfigurePanel";
import { Console } from "./Console";
import { PreviewIframe } from "./PreviewIframe";
import { Problems } from "./Problems";
import { PublishPanel } from "./PublishPanel";
import { SecurityPanel } from "./SecurityPanel";

interface ConsoleHeaderProps {
  isOpen: boolean;
  onToggle: () => void;
  latestMessage?: string;
}

// Console header component
const ConsoleHeader = ({
  isOpen,
  onToggle,
  latestMessage,
}: ConsoleHeaderProps) => (
  <div
    onClick={onToggle}
    className="flex items-start gap-2 px-4 py-1.5 border-t border-border cursor-pointer hover:bg-[var(--background-darkest)] transition-colors"
  >
    <Logs size={16} className="mt-0.5" />
    <div className="flex flex-col">
      <span className="text-sm font-medium">System Messages</span>
      {!isOpen && latestMessage && (
        <span className="text-xs text-gray-500 truncate max-w-[200px] md:max-w-[400px]">
          {latestMessage}
        </span>
      )}
    </div>
    <div className="flex-1" />
    {isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
  </div>
);

// Main PreviewPanel component
export function PreviewPanel() {
  const [previewMode] = useAtom(previewModeAtom);
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const { runApp, stopApp, loading, app } = useRunApp();
  const runningAppIdRef = useRef<number | null>(null);
  const key = useAtomValue(previewPanelKeyAtom);
  const appOutput = useAtomValue(appOutputAtom);

  // Use refs for callbacks to avoid triggering cleanup when functions recreate
  const runAppRef = useRef(runApp);
  const stopAppRef = useRef(stopApp);
  // Track if component is mounted to handle React StrictMode double-render
  const isMountedRef = useRef(true);
  // Track pending stop timeout for cleanup debouncing
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    runAppRef.current = runApp;
  }, [runApp]);
  useEffect(() => {
    stopAppRef.current = stopApp;
  }, [stopApp]);

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const messageCount = appOutput.length;
  const latestMessage =
    messageCount > 0 ? appOutput[messageCount - 1]?.message : undefined;

  useEffect(() => {
    // DEBUG: Verify this is the fixed version with StrictMode handling
    console.log(
      "[PreviewPanel] useEffect running - BUILD-20260104-FIX-v3 - selectedAppId:",
      selectedAppId,
      "prevRef:",
      runningAppIdRef.current,
    );

    // Cancel any pending stop from a previous cleanup (handles StrictMode double-render)
    if (stopTimeoutRef.current) {
      console.log(
        "[PreviewPanel] Cancelling pending stop (StrictMode remount detected)",
      );
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }

    const previousAppId = runningAppIdRef.current;

    // Check if the selected app ID has changed
    if (selectedAppId !== previousAppId) {
      // Stop the previously running app, if any
      if (previousAppId !== null) {
        console.debug("Stopping previous app", previousAppId);
        stopAppRef.current(previousAppId);
      }

      // Start the new app if an ID is selected
      if (selectedAppId !== null) {
        console.debug("Starting new app", selectedAppId);
        runAppRef.current(selectedAppId);
        runningAppIdRef.current = selectedAppId;
      } else {
        runningAppIdRef.current = null;
      }
    }

    // Cleanup function: Only runs on unmount now since selectedAppId is the only dep
    return () => {
      console.log(
        "[PreviewPanel] CLEANUP running - BUILD-20260104-FIX-v3 - currentRef:",
        runningAppIdRef.current,
        "selectedAppId at cleanup:",
        selectedAppId,
      );
      const currentRunningApp = runningAppIdRef.current;
      if (currentRunningApp !== null) {
        // Delay the stop to handle React StrictMode's unmount/remount cycle
        // If component remounts quickly (StrictMode), the stop will be cancelled
        console.debug(
          "Scheduling app stop (will cancel if StrictMode remount):",
          currentRunningApp,
        );
        stopTimeoutRef.current = setTimeout(() => {
          // Only stop if component is still unmounted after the delay
          if (!isMountedRef.current) {
            console.debug(
              "Component truly unmounted, stopping app",
              currentRunningApp,
            );
            stopAppRef.current(currentRunningApp);
          } else {
            console.debug(
              "Component remounted, skipping stop for app",
              currentRunningApp,
            );
          }
          stopTimeoutRef.current = null;
        }, 100); // 100ms delay to detect StrictMode remount
        // Don't clear the ref here - let the timeout or remount handle it
      }
    };
    // Only depend on selectedAppId - function refs are used to avoid cleanup on callback changes
  }, [selectedAppId]);
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="vertical">
          <Panel id="content" minSize={30}>
            <div className="h-full overflow-y-auto">
              {previewMode === "preview" ? (
                <PreviewIframe key={key} loading={loading} />
              ) : previewMode === "code" ? (
                <CodeView loading={loading} app={app} />
              ) : previewMode === "configure" ? (
                <ConfigurePanel />
              ) : previewMode === "publish" ? (
                <PublishPanel />
              ) : previewMode === "security" ? (
                <SecurityPanel />
              ) : (
                <Problems />
              )}
            </div>
          </Panel>
          {isConsoleOpen && (
            <>
              <PanelResizeHandle className="h-1 bg-border hover:bg-gray-400 transition-colors cursor-row-resize" />
              <Panel id="console" minSize={10} defaultSize={30}>
                <div className="flex flex-col h-full">
                  <ConsoleHeader
                    isOpen={true}
                    onToggle={() => setIsConsoleOpen(false)}
                    latestMessage={latestMessage}
                  />
                  <Console />
                </div>
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
      {!isConsoleOpen && (
        <ConsoleHeader
          isOpen={false}
          onToggle={() => setIsConsoleOpen(true)}
          latestMessage={latestMessage}
        />
      )}
    </div>
  );
}
