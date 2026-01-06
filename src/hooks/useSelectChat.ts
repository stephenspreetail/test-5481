import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { useNavigate } from "@tanstack/react-router";
import { useSetAtom } from "jotai";

export function useSelectChat() {
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const setSelectedAppId = useSetAtom(selectedAppIdAtom);
  const navigate = useNavigate();

  return {
    selectChat: ({ chatId, appId }: { chatId: number; appId: number }) => {
      setSelectedChatId(chatId);
      setSelectedAppId(appId);
      navigate({
        to: "/chat",
        search: { id: chatId },
      });
    },
  };
}
