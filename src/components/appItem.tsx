import { Button } from "@/components/ui/button";
import { SidebarMenuItem } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { App } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { Star } from "lucide-react";

type AppItemProps = {
  app: App;
  handleAppClick: (id: number) => void;
  selectedAppId: number | null;
  handleToggleFavorite: (appId: number, e: React.MouseEvent) => void;
  isFavoriteLoading: boolean;
};

export function AppItem({
  app,
  handleAppClick,
  selectedAppId,
  handleToggleFavorite,
  isFavoriteLoading,
}: AppItemProps) {
  return (
    <SidebarMenuItem className="mb-1 relative">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex w-[190px] items-center">
              <Button
                variant="ghost"
                onClick={() => handleAppClick(app.id)}
                className={`justify-start w-full text-left py-3 rounded-xl cursor-pointer ${
                  selectedAppId === app.id
                    ? "bg-card shadow-sm text-foreground"
                    : ""
                }`}
                data-testid={`app-list-item-${app.name}`}
              >
                <div className="flex flex-col w-4/5">
                  <span className="truncate text-foreground">{app.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(
                      new Date(app.mostRecentChatActivity || app.updatedAt),
                      { addSuffix: true }
                    )}
                  </span>
                </div>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => handleToggleFavorite(app.id, e)}
                disabled={isFavoriteLoading}
                className="absolute top-1 right-1 p-1 mx-1 h-6 w-6 z-10 rounded-lg"
                key={app.id}
                data-testid="favorite-button"
              >
                <Star
                  size={12}
                  className={
                    app.isFavorite
                      ? "fill-primary text-primary"
                      : selectedAppId === app.id
                        ? "hover:fill-primary hover:text-primary"
                        : "hover:fill-primary hover:stroke-primary hover:text-primary"
                  }
                />
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{app.name}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </SidebarMenuItem>
  );
}
