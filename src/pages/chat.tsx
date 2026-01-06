import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { isPreviewOpenAtom } from "@/atoms/viewAtoms";
import { useChats } from "@/hooks/useChats";
import { cn } from "@/lib/utils";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import {
  type ImperativePanelHandle,
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import { ChatPanel } from "../components/ChatPanel";
import { PreviewPanel } from "../components/preview_panel/PreviewPanel";

export default function ChatPage() {
  let { id: chatId } = useSearch({ from: "/chat" });
  const navigate = useNavigate();
  const [isPreviewOpen, setIsPreviewOpen] = useAtom(isPreviewOpenAtom);
  const [isResizing, setIsResizing] = useState(false);
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const setSelectedAppId = useSetAtom(selectedAppIdAtom);
  const { chats, loading } = useChats(selectedAppId);

  // DIAGNOSTIC: Track ChatPage mount/unmount
  useEffect(() => {
    console.log(`📄 [ChatPage] MOUNTED - chatId: ${chatId}, PAGE_ID: ${window.__KOVA_PAGE_LOAD_ID || 'unknown'}`);
    return () => {
      console.log(`📄 [ChatPage] UNMOUNTED - chatId: ${chatId}, PAGE_ID: ${window.__KOVA_PAGE_LOAD_ID || 'unknown'}`);
    };
  }, []);

  // DIAGNOSTIC: Track chatId changes
  useEffect(() => {
    console.log(`📄 [ChatPage] chatId changed to: ${chatId}, PAGE_ID: ${window.__KOVA_PAGE_LOAD_ID || 'unknown'}`);
  }, [chatId]);

  useEffect(() => {
    if (!chatId && chats.length && !loading) {
      // Not a real navigation, just a redirect, when the user navigates to /chat
      // without a chatId, we redirect to the first chat
      console.log(`📄 [ChatPage] No chatId, redirecting to first chat: ${chats[0].id}, PAGE_ID: ${window.__KOVA_PAGE_LOAD_ID || 'unknown'}`);
      setSelectedAppId(chats[0].appId);
      navigate({ to: "/chat", search: { id: chats[0].id }, replace: true });
    }
  }, [chatId, chats, loading, navigate]);

  useEffect(() => {
    console.log(`📄 [ChatPage] isPreviewOpen changed to: ${isPreviewOpen}, expanding/collapsing panel, PAGE_ID: ${window.__KOVA_PAGE_LOAD_ID || 'unknown'}`);
    if (isPreviewOpen) {
      ref.current?.expand();
    } else {
      ref.current?.collapse();
    }
  }, [isPreviewOpen]);
  const ref = useRef<ImperativePanelHandle>(null);

  return (
    <PanelGroup autoSaveId="persistence" direction="horizontal">
      <Panel id="chat-panel" minSize={30}>
        <div className="h-full w-full">
          <ChatPanel
            chatId={chatId}
            isPreviewOpen={isPreviewOpen}
            onTogglePreview={() => {
              setIsPreviewOpen(!isPreviewOpen);
              if (isPreviewOpen) {
                ref.current?.collapse();
              } else {
                ref.current?.expand();
              }
            }}
          />
        </div>
      </Panel>

      <>
        <PanelResizeHandle
          onDragging={(e) => setIsResizing(e)}
          className="w-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors cursor-col-resize"
        />
        <Panel
          collapsible
          ref={ref}
          id="preview-panel"
          minSize={20}
          className={cn(
            !isResizing && "transition-all duration-100 ease-in-out",
          )}
        >
          <PreviewPanel />
        </Panel>
      </>
    </PanelGroup>
  );
}
