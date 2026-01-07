import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { ActionHeader } from "@/components/preview_panel/ActionHeader";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useLocation } from "@tanstack/react-router";
import { useAtom } from "jotai";
// @ts-ignore
import logo from "../../assets/logo.svg";

export const TitleBar = () => {
  const [selectedAppId] = useAtom(selectedAppIdAtom);
  const { apps } = useLoadApps();
  const location = useLocation();

  // Get selected app name
  const selectedApp = apps.find((app) => app.id === selectedAppId);
  const displayText = selectedApp
    ? `App: ${selectedApp.name}`
    : "(no app selected)";

  // Show ActionHeader on chat and app-details pages
  const showActionHeader =
    location.pathname === "/chat" ||
    location.pathname.startsWith("/app-details");

  return (
    <div className="@container z-11 w-full h-11 bg-(--sidebar) absolute top-0 left-0 flex items-center">
      <div className="pl-2"></div>

      <img src={logo} alt="Kova Logo" className="w-6 h-6" />

      {/* Spacer to push content to center/right */}
      <div className="flex-1" />

      {/* Selected app indicator - centered with subtle inset style */}
      <span
        data-testid="title-bar-app-name"
        className="text-xs max-w-64 truncate font-medium text-muted-foreground bg-black/5 dark:bg-white/5 px-3 py-1 rounded-md shadow-inner"
      >
        {displayText}
      </span>

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
