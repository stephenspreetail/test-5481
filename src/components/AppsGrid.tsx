import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLoadApps } from "@/hooks/useLoadApps";
import { App } from "@/types";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { useSetAtom } from "jotai";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

export function AppsGrid() {
  const navigate = useNavigate();
  const { apps, loading, error } = useLoadApps();
  const [searchQuery, setSearchQuery] = useState("");
  const setSelectedAppId = useSetAtom(selectedAppIdAtom);
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);

  // Filter and sort apps: most recent edit first
  const filteredApps = useMemo(() => {
    let result = [...apps];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((app) => app.name.toLowerCase().includes(query));
    }

    // Sort by most recent chat activity descending (most recent first)
    result.sort((a, b) => {
      const aTime = new Date(a.mostRecentChatActivity || a.updatedAt).getTime();
      const bTime = new Date(b.mostRecentChatActivity || b.updatedAt).getTime();
      return bTime - aTime;
    });

    return result;
  }, [apps, searchQuery]);

  // Calculate total chat count across all apps
  const totalChats = useMemo(() => {
    return apps.reduce((sum, app) => sum + (app.chatCount || 0), 0);
  }, [apps]);

  const handleAppClick = (appId: number) => {
    setSelectedAppId(appId);
    setSelectedChatId(null);
    navigate({
      to: "/app-details",
      search: { appId },
    });
  };

  const handleChatClick = (chatId: number) => {
    navigate({
      to: "/chat",
      search: { id: chatId },
    });
  };

  const handleNewApp = () => {
    navigate({ to: "/", search: { newApp: true } });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading apps...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive">Error loading apps</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto px-8 pt-[8vh]">
      <div className="max-w-2xl mx-auto">
        {/* Header with title and new app button */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Your Apps</h1>
          <Button onClick={handleNewApp} className="gap-2">
            <Plus size={16} />
            <span>New app</span>
          </Button>
        </div>

        {/* Search bar - full width */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search your apps..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 w-full h-12"
          />
        </div>

        {/* Status line */}
        <div className="text-xs text-muted-foreground mt-2 mb-6 pl-4">
          {totalChats} {totalChats === 1 ? "chat" : "chats"} with Kova
        </div>

        {/* Apps grid */}
        {filteredApps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            {searchQuery ? (
              <p>No apps match your search</p>
            ) : (
              <p>No apps yet</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredApps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                onClick={() => handleAppClick(app.id)}
                onChatClick={handleChatClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AppCard({
  app,
  onClick,
  onChatClick,
}: {
  app: App;
  onClick: () => void;
  onChatClick: (chatId: number) => void;
}) {
  return (
    <div
      className="cursor-pointer rounded-2xl bg-card p-5 min-h-[180px] flex flex-col transition-all hover:shadow-md"
      onClick={onClick}
    >
      {/* App name */}
      <h3 className="font-medium text-foreground text-lg mb-3">{app.name}</h3>

      {/* Recent chats */}
      {app.recentChats && app.recentChats.length > 0 && (
        <div className="flex-1 mb-3">
          <p className="text-xs text-muted-foreground mb-2">
            Recent chats ({app.chatCount || 0}):
          </p>
          <ul className="space-y-1">
            {app.recentChats.map((chat) => (
              <li
                key={chat.id}
                className="text-sm text-foreground hover:text-primary truncate cursor-pointer flex items-center gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onChatClick(chat.id);
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                {chat.title || "Untitled Chat"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer with updated date */}
      <div className="mt-auto pt-2 border-t border-gray-300/50">
        <div className="text-xs text-muted-foreground">
          Updated{" "}
          {formatDistanceToNow(
            new Date(app.mostRecentChatActivity || app.updatedAt),
            { addSuffix: true }
          )}
        </div>
      </div>
    </div>
  );
}
