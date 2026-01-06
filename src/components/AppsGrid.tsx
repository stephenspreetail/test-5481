import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLoadApps } from "@/hooks/useLoadApps";
import { App } from "@/types";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

export function AppsGrid() {
  const navigate = useNavigate();
  const { apps, loading, error } = useLoadApps();
  const [searchQuery, setSearchQuery] = useState("");

  // Filter and sort apps: most recent edit first
  const filteredApps = useMemo(() => {
    let result = [...apps];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((app) => app.name.toLowerCase().includes(query));
    }

    // Sort by updatedAt descending (most recent first)
    result.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return result;
  }, [apps, searchQuery]);

  const handleAppClick = (appId: number) => {
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
          <Button onClick={handleNewApp} variant="outline" className="gap-2">
            <Plus size={16} />
            <span>New App</span>
          </Button>
        </div>

        {/* Search bar - full width */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search apps..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 w-full h-12"
          />
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

function AppCard({ app, onClick, onChatClick }: { app: App; onClick: () => void; onChatClick: (chatId: number) => void }) {
  return (
    <div
      className="cursor-pointer rounded-2xl bg-[#dce4ed] p-5 min-h-[180px] flex flex-col transition-all hover:shadow-md"
      onClick={onClick}
    >
      {/* App name */}
      <h3 className="font-medium text-foreground text-lg mb-2">{app.name}</h3>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
        <span>{app.chatCount || 0} chats</span>
        <span>{app.messageCount || 0} messages</span>
      </div>

      {/* Recent chats */}
      {app.recentChats && app.recentChats.length > 0 && (
        <div className="flex-1 mb-3">
          <p className="text-xs text-muted-foreground mb-1">Recent chats:</p>
          <div className="space-y-1">
            {app.recentChats.map((chat) => (
              <div
                key={chat.id}
                className="text-sm text-foreground hover:text-primary truncate cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onChatClick(chat.id);
                }}
              >
                {chat.title || "Untitled Chat"}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer with dates */}
      <div className="mt-auto pt-2 border-t border-gray-300/50">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Created {formatDistanceToNow(new Date(app.createdAt), { addSuffix: true })}</span>
          <span>Updated {formatDistanceToNow(new Date(app.updatedAt), { addSuffix: true })}</span>
        </div>
      </div>
    </div>
  );
}
