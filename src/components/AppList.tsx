import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { Input } from "@/components/ui/input";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { useAddAppToFavorite } from "@/hooks/useAddAppToFavorite";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AppItem } from "./appItem";

const FAVORITES_INITIAL = 5;
const RECENTS_INITIAL = 15;
const LOAD_MORE_INCREMENT = 5;

export function AppList({ show }: { show?: boolean }) {
  const navigate = useNavigate();
  const [selectedAppId, setSelectedAppId] = useAtom(selectedAppIdAtom);
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const { apps, loading, error } = useLoadApps();
  const { toggleFavorite, isLoading: isFavoriteLoading } =
    useAddAppToFavorite();
  const [searchQuery, setSearchQuery] = useState("");
  const [favoritesVisible, setFavoritesVisible] = useState(FAVORITES_INITIAL);
  const [recentsVisible, setRecentsVisible] = useState(RECENTS_INITIAL);

  const filteredApps = useMemo(() => {
    if (!searchQuery.trim()) return apps;
    const query = searchQuery.toLowerCase();
    return apps.filter((app) => app.name.toLowerCase().includes(query));
  }, [apps, searchQuery]);

  const favoriteApps = useMemo(
    () =>
      filteredApps
        .filter((app) => app.isFavorite)
        .sort((a, b) => {
          const aTime = new Date(a.mostRecentChatActivity || a.updatedAt).getTime();
          const bTime = new Date(b.mostRecentChatActivity || b.updatedAt).getTime();
          return bTime - aTime;
        }),
    [filteredApps],
  );

  const nonFavoriteApps = useMemo(
    () =>
      filteredApps
        .filter((app) => !app.isFavorite)
        .sort((a, b) => {
          const aTime = new Date(a.mostRecentChatActivity || a.updatedAt).getTime();
          const bTime = new Date(b.mostRecentChatActivity || b.updatedAt).getTime();
          return bTime - aTime;
        }),
    [filteredApps],
  );

  if (!show) {
    return null;
  }

  const handleAppClick = (id: number) => {
    setSelectedAppId(id);
    setSelectedChatId(null);
    navigate({
      to: "/app-details",
      search: { appId: id },
    });
  };

  const handleToggleFavorite = (appId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(appId);
  };

  return (
    <SidebarGroup
      className="overflow-y-auto h-[calc(100vh-112px)] pt-2"
      data-testid="app-list-container"
    >
      <SidebarGroupContent>
        <div className="flex flex-col space-y-2">
          {/* Search input */}
          <div className="relative mx-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search your apps..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="search-apps-input"
            />
          </div>

          {/* Status line */}
          <div className="pl-5 text-xs text-muted-foreground">
            {apps.length} {apps.length === 1 ? "app" : "apps"}
          </div>

          {loading ? (
            <div className="py-2 px-4 text-sm text-muted-foreground">
              Loading apps...
            </div>
          ) : error ? (
            <div className="py-2 px-4 text-sm text-red-500">
              Error loading apps
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="py-2 px-4 text-sm text-muted-foreground">
              {searchQuery ? "No apps match your search" : "No apps found"}
            </div>
          ) : (
            <SidebarMenu className="space-y-1" data-testid="app-list">
              {favoriteApps.length > 0 && (
                <>
                  <SidebarGroupLabel>Favorites</SidebarGroupLabel>
                  {favoriteApps.slice(0, favoritesVisible).map((app) => (
                    <AppItem
                      key={app.id}
                      app={app}
                      handleAppClick={handleAppClick}
                      selectedAppId={selectedAppId}
                      handleToggleFavorite={handleToggleFavorite}
                      isFavoriteLoading={isFavoriteLoading}
                    />
                  ))}
                  {favoriteApps.length > favoritesVisible && (
                    <button
                      onClick={() => setFavoritesVisible((prev) => prev + LOAD_MORE_INCREMENT)}
                      className="w-full text-left px-4 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      View more...
                    </button>
                  )}
                </>
              )}
              {nonFavoriteApps.length > 0 && (
                <>
                  <SidebarGroupLabel>Recents</SidebarGroupLabel>
                  {nonFavoriteApps.slice(0, recentsVisible).map((app) => (
                    <AppItem
                      key={app.id}
                      app={app}
                      handleAppClick={handleAppClick}
                      selectedAppId={selectedAppId}
                      handleToggleFavorite={handleToggleFavorite}
                      isFavoriteLoading={isFavoriteLoading}
                    />
                  ))}
                  {nonFavoriteApps.length > recentsVisible && (
                    <button
                      onClick={() => navigate({ to: "/" })}
                      className="w-full text-left px-4 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      View all apps...
                    </button>
                  )}
                </>
              )}
            </SidebarMenu>
          )}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
