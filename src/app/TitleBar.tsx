import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { ActionHeader } from "@/components/preview_panel/ActionHeader";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useLocation } from "@tanstack/react-router";
import { useAtom } from "jotai";

export const TitleBar = () => {
  const [selectedAppId] = useAtom(selectedAppIdAtom);
  const { apps } = useLoadApps();
  const location = useLocation();

  // Get selected app
  const selectedApp = apps.find((app) => app.id === selectedAppId);

  // Show ActionHeader on chat and app-details pages
  const showActionHeader =
    location.pathname === "/chat" ||
    location.pathname.startsWith("/app-details");

  return (
    <div className="@container z-10 h-11 bg-(--sidebar) absolute top-0 right-0 left-[var(--sidebar-width)] flex items-center transition-[left] duration-200 ease-linear peer-data-[state=collapsed]:left-[var(--sidebar-width-icon)]">
      {/* Spacer to push content to center/right */}
      <div className="flex-1" />

      {/* Selected app indicator - centered with subtle inset style */}
      {selectedApp && (
        <span
          data-testid="title-bar-app-name"
          className="text-xs max-w-64 truncate font-medium text-muted-foreground bg-black/5 dark:bg-white/5 px-3 py-1 rounded-md shadow-inner"
        >
          App: {selectedApp.name}
        </span>
      )}

      {/* Preview Header */}
      {showActionHeader ? (
        <div className="flex-1 flex justify-end">
          <ActionHeader />
        </div>
      ) : (
        <div className="flex-1" />
      )}
    </div>
  );
};
