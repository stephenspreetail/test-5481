import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { isPreviewOpenAtom } from "@/atoms/viewAtoms";
import { getClient } from "@/client/api/client_factory";
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

  // When navigating directly to /chat?id=N, resolve the app from the chat
  useEffect(() => {
    if (chatId && !selectedAppId) {
      getClient()
        .getChat(chatId)
        .then((chat) => {
          if (chat?.appId) {
            setSelectedAppId(chat.appId);
          }
        })
        .catch((err) => console.error("Failed to resolve app from chat:", err));
    }
  }, [chatId, selectedAppId, setSelectedAppId]);

  useEffect(() => {
    if (!chatId && chats.length && !loading) {
      // Not a real navigation, just a redirect, when the user navigates to /chat
      // without a chatId, we redirect to the first chat
      setSelectedAppId(chats[0].appId);
      navigate({ to: "/chat", search: { id: chats[0].id }, replace: true });
    }
  }, [chatId, chats, loading, navigate]);

  useEffect(() => {
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
