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

  useEffect(() => {
    runAppRef.current = runApp;
  }, [runApp]);
  useEffect(() => {
    stopAppRef.current = stopApp;
  }, [stopApp]);

  const messageCount = appOutput.length;
  const latestMessage =
    messageCount > 0 ? appOutput[messageCount - 1]?.message : undefined;

  useEffect(() => {
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
    // NOTE: We intentionally do NOT stop the container on unmount.
    // The container has an idle timeout that handles cleanup.
    // Stopping on unmount caused a race condition where navigating
    // between pages killed the container while a chat stream was active.
    return () => {
      console.log(
        "[PreviewPanel] CLEANUP running - selectedAppId:",
        selectedAppId,
        "currentRef:",
        runningAppIdRef.current,
        "(container left running for idle timeout)",
      );
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
