import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { getClient } from "@/client/api/client_factory";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useChats } from "@/hooks/useChats";
import { useCheckName } from "@/hooks/useCheckName";
import { useDebounce } from "@/hooks/useDebounce";
import { invalidateAppQuery } from "@/hooks/useLoadApp";
import { useLoadApps } from "@/hooks/useLoadApps";
import { showError } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { useSetAtom } from "jotai";
import {
  ArrowLeft,
  Copy,
  MessageCircle,
  MoreVertical,
  Pencil,
  PlusCircle,
  Search,
} from "lucide-react";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export default function AppDetailsPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/app-details" as const });
  const { apps: appsList, refreshApps } = useLoadApps();
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [newAppName, setNewAppName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [isCopyDialogOpen, setIsCopyDialogOpen] = useState(false);
  const [newCopyAppName, setNewCopyAppName] = useState("");

  const queryClient = useQueryClient();
  const setSelectedAppId = useSetAtom(selectedAppIdAtom);

  const debouncedNewCopyAppName = useDebounce(newCopyAppName, 150);
  const { data: checkNameResult, isLoading: isCheckingName } = useCheckName(
    debouncedNewCopyAppName,
  );
  const nameExists = checkNameResult?.exists ?? false;

  // Get the appId from search params and find the corresponding app
  const appId = search.appId ? Number(search.appId) : null;
  const selectedApp = appId ? appsList.find((app) => app.id === appId) : null;

  // Sync selectedAppId atom when landing on this page (handles direct nav, refresh, app card clicks)
  useEffect(() => {
    if (appId !== null) {
      setSelectedAppId(appId);
    }
  }, [appId, setSelectedAppId]);

  const { data: previewUrlData } = useQuery({
    queryKey: ["preview-url", appId],
    queryFn: () => getClient().getPreviewUrl(appId!),
    enabled: !!appId,
    staleTime: Infinity,
  });
  const previewUrl = previewUrlData?.previewUrl;

  // Chats for this app
  const { chats, loading: chatsLoading, refreshChats } = useChats(appId);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  // Filter and sort chats
  const filteredChats = useMemo(() => {
    let result = [...chats];

    if (chatSearchQuery.trim()) {
      const query = chatSearchQuery.toLowerCase();
      result = result.filter((chat) =>
        (chat.title || "New Chat").toLowerCase().includes(query),
      );
    }

    // Sort by createdAt descending (most recent first)
    result.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return result;
  }, [chats, chatSearchQuery]);

  const handleNewChat = async () => {
    if (!appId) return;
    try {
      setIsCreatingChat(true);
      const chatId = await getClient().createChat(appId);
      await refreshChats();
      navigate({ to: "/chat", search: { id: chatId } });
    } catch (error) {
      showError(error);
    } finally {
      setIsCreatingChat(false);
    }
  };

  const handleChatClick = (chatId: number) => {
    navigate({ to: "/chat", search: { id: chatId } });
  };

  const handleArchiveApp = async () => {
    if (!appId) return;

    try {
      setIsArchiving(true);
      await getClient().deleteApp(appId);
      setIsArchiveDialogOpen(false);
      await refreshApps();
      navigate({ to: "/", search: {} });
    } catch (error) {
      setIsArchiveDialogOpen(false);
      showError(error);
    } finally {
      setIsArchiving(false);
    }
  };

  const handleOpenRenameDialog = () => {
    if (selectedApp) {
      setNewAppName(selectedApp.name);
      setIsRenameDialogOpen(true);
    }
  };

  const handleRenameApp = async () => {
    if (!appId || !newAppName.trim()) return;

    try {
      setIsRenaming(true);
      await getClient().renameApp({ appId, appName: newAppName });
      setIsRenameDialogOpen(false);
      await refreshApps();
    } catch (error) {
      console.error("Failed to rename app:", error);
      showError(error);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleAppNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewCopyAppName(e.target.value);
  };

  const handleOpenCopyDialog = () => {
    if (selectedApp) {
      setNewCopyAppName(`${selectedApp.name}-copy`);
      setIsCopyDialogOpen(true);
    }
  };

  const copyAppMutation = useMutation({
    mutationFn: async ({ withHistory }: { withHistory: boolean }) => {
      if (!appId || !newCopyAppName.trim()) {
        throw new Error("Invalid app ID or name for copying.");
      }
      return getClient().copyApp({
        appId,
        newAppName: newCopyAppName,
        withHistory,
      });
    },
    onSuccess: async (data) => {
      const appId = data.app.id;
      setSelectedAppId(appId);
      await invalidateAppQuery(queryClient, { appId });
      await refreshApps();
      await getClient().createChat(appId);
      setIsCopyDialogOpen(false);
      navigate({ to: "/app-details", search: { appId } });
    },
    onError: (error) => {
      showError(error);
    },
  });

  if (!selectedApp) {
    return (
      <div className="relative min-h-screen p-8">
        <div className="flex flex-col items-center justify-center h-full">
          <h2 className="text-xl font-bold">App not found</h2>
        </div>
      </div>
    );
  }


  return (
    <div
      className="relative min-h-screen p-4 w-full"
      data-testid="app-details-page"
    >
      {/* App Info Section */}
      <div className="w-full max-w-2xl mx-auto mt-10 p-6 bg-card rounded-2xl shadow-sm relative text-gray-900 dark:text-gray-100">
        <div className="flex items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {selectedApp.name}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="ml-1 p-0.5 h-auto"
            onClick={handleOpenRenameDialog}
            data-testid="app-details-rename-app-button"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Overflow Menu in top right */}
        <div className="absolute top-4 right-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                data-testid="app-details-more-options-button"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-2" align="end">
              <div className="flex flex-col space-y-0.5">
                <Button
                  onClick={handleOpenCopyDialog}
                  variant="ghost"
                  size="sm"
                  className="h-8 justify-start text-xs"
                >
                  Copy app
                </Button>
                <Button
                  onClick={() => setIsArchiveDialogOpen(true)}
                  variant="ghost"
                  size="sm"
                  className="h-8 justify-start text-xs"
                >
                  Archive
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-6">
          <div>
            <span className="block text-gray-500 dark:text-gray-400 mb-0.5 text-xs">
              Created
            </span>
            <span className="text-gray-900 dark:text-gray-200">
              {selectedApp.createdAt.toString()}
            </span>
          </div>
          <div>
            <span className="block text-gray-500 dark:text-gray-400 mb-0.5 text-xs">
              Last Updated
            </span>
            <span className="text-gray-900 dark:text-gray-200">
              {selectedApp.updatedAt.toString()}
            </span>
          </div>
          {selectedApp.slug && (
            <div>
              <span className="block text-gray-500 dark:text-gray-400 mb-0.5 text-xs">
                Slug
              </span>
              <span className="text-sm text-gray-900 dark:text-gray-200 font-mono">
                {selectedApp.slug}
              </span>
            </div>
          )}
          {previewUrl && (
            <div className={selectedApp.slug ? "" : "col-span-2"}>
              <span className="block text-gray-500 dark:text-gray-400 mb-0.5 text-xs">
                Preview URL
              </span>
              <div className="flex items-center gap-1">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm break-all text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {previewUrl}
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-0.5 h-auto cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
                  onClick={() => navigator.clipboard.writeText(previewUrl)}
                  title="Copy URL to clipboard"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <Button
          onClick={async () => {
            if (!appId) {
              console.error("No app id found");
              return;
            }
            // Open most recent chat or create one
            if (chats.length > 0) {
              navigate({ to: "/chat", search: { id: chats[0].id } });
            } else {
              await handleNewChat();
            }
          }}
          className="cursor-pointer w-full py-5 flex justify-center items-center gap-2"
          size="lg"
        >
          Open in Chat
          <MessageCircle className="h-4 w-4" />
        </Button>
      </div>

      {/* Chats Section */}
      <div className="w-full max-w-2xl mx-auto mt-4 p-6 bg-card rounded-2xl shadow-sm text-gray-900 dark:text-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Chats
          </h3>
          <Button
            onClick={handleNewChat}
            disabled={isCreatingChat}
            size="sm"
            className="gap-2"
          >
            <PlusCircle size={14} />
            <span>New Chat</span>
          </Button>
        </div>

        {/* Chat search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
          <Input
            placeholder="Search chats..."
            value={chatSearchQuery}
            onChange={(e) => setChatSearchQuery(e.target.value)}
            className="pl-9 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
          />
        </div>

        {/* Chat list */}
        {chatsLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading chats...
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            {chatSearchQuery ? "No chats match your search" : "No chats yet"}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredChats.map((chat) => (
              <div
                key={chat.id}
                className="cursor-pointer p-3 border border-gray-200 dark:border-gray-500 rounded-lg flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={() => handleChatClick(chat.id)}
              >
                <span className="font-medium truncate text-gray-800 dark:text-white">
                  {chat.title || "New Chat"}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-300 whitespace-nowrap ml-2">
                  {formatDistanceToNow(new Date(chat.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rename Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent className="max-w-sm p-4">
          <DialogHeader className="pb-2">
            <DialogTitle>Rename App</DialogTitle>
          </DialogHeader>
          <Input
            value={newAppName}
            onChange={(e) => setNewAppName(e.target.value)}
            placeholder="Enter new app name"
            className="my-2"
            autoFocus
          />
          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              onClick={() => setIsRenameDialogOpen(false)}
              disabled={isRenaming}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                handleRenameApp();
              }}
              disabled={isRenaming || !newAppName.trim()}
              size="sm"
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy App Dialog */}
      {selectedApp && (
        <Dialog open={isCopyDialogOpen} onOpenChange={setIsCopyDialogOpen}>
          <DialogContent className="max-w-md p-4">
            <DialogHeader className="pb-2">
              <DialogTitle>Copy "{selectedApp.name}"</DialogTitle>
              <DialogDescription className="text-sm">
                <p>Create a copy of this app.</p>
                <p>
                  Note: this does not copy over the GitHub project.
                </p>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 my-2">
              <div>
                <Label htmlFor="newAppName">New app name</Label>
                <div className="relative mt-1">
                  <Input
                    id="newAppName"
                    value={newCopyAppName}
                    onChange={handleAppNameChange}
                    placeholder="Enter new app name"
                    className="pr-8"
                    disabled={copyAppMutation.isPending}
                  />
                  {isCheckingName && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>

                {nameExists && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1">
                    An app with this name already exists. Please choose another
                    name.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start p-2 h-auto relative text-sm"
                  onClick={() => copyAppMutation.mutate({ withHistory: true })}
                  disabled={
                    copyAppMutation.isPending ||
                    nameExists ||
                    !newCopyAppName.trim() ||
                    isCheckingName
                  }
                >
                  {copyAppMutation.isPending &&
                    copyAppMutation.variables?.withHistory === true && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                  <div className="absolute top-1 right-1">
                    <span className="bg-teal-100 text-teal-800 text-xs font-medium px-1.5 py-0.5 rounded dark:bg-teal-900 dark:text-teal-300 text-[10px]">
                      Recommended
                    </span>
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-xs">Copy app with history</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Copies the entire app, including the Git version history.
                    </p>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start p-2 h-auto text-sm"
                  onClick={() => copyAppMutation.mutate({ withHistory: false })}
                  disabled={
                    copyAppMutation.isPending ||
                    nameExists ||
                    !newCopyAppName.trim() ||
                    isCheckingName
                  }
                >
                  {copyAppMutation.isPending &&
                    copyAppMutation.variables?.withHistory === false && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                  <div className="text-left">
                    <p className="font-medium text-xs">
                      Copy app without history
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Useful if the current app has a Git-related issue.
                    </p>
                  </div>
                </Button>
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                onClick={() => setIsCopyDialogOpen(false)}
                disabled={copyAppMutation.isPending}
                size="sm"
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Archive Confirmation Dialog */}
      <Dialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
        <DialogContent className="max-w-sm p-4">
          <DialogHeader className="pb-2">
            <DialogTitle>Archive "{selectedApp.name}"?</DialogTitle>
            <DialogDescription className="text-xs">
              The app will be hidden and its container resources will be cleaned
              up.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsArchiveDialogOpen(false)}
              disabled={isArchiving}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchiveApp}
              disabled={isArchiving}
              className="flex items-center gap-1"
              size="sm"
            >
              {isArchiving ? (
                <>
                  <svg
                    className="animate-spin h-3 w-3 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Archiving...
                </>
              ) : (
                "Archive App"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
