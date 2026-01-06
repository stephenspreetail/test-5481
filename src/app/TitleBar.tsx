import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { ActionHeader } from "@/components/preview_panel/ActionHeader";
import { Button } from "@/components/ui/button";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useAtom } from "jotai";
// @ts-ignore
import logo from "../../assets/logo.svg";

export const TitleBar = () => {
  const [selectedAppId] = useAtom(selectedAppIdAtom);
  const { apps } = useLoadApps();
  const { navigate } = useRouter();
  const location = useLocation();

  // Get selected app name
  const selectedApp = apps.find((app) => app.id === selectedAppId);
  const displayText = selectedApp
    ? `App: ${selectedApp.name}`
    : "(no app selected)";

  const handleAppClick = () => {
    if (selectedApp) {
      navigate({ to: "/app-details", search: { appId: selectedApp.id } });
    }
  };

  return (
    <div className="@container z-11 w-full h-11 bg-(--sidebar) absolute top-0 left-0 flex items-center">
      <div className="pl-2"></div>

      <img src={logo} alt="Kova Logo" className="w-6 h-6 mr-0.5" />
      <Button
        data-testid="title-bar-app-name-button"
        variant="outline"
        size="sm"
        className={`hidden @2xl:block text-xs max-w-38 truncate font-medium ${
          selectedApp ? "cursor-pointer" : ""
        }`}
        onClick={handleAppClick}
      >
        {displayText}
      </Button>

      {/* Preview Header */}
      {location.pathname === "/chat" && (
        <div className="flex-1 flex justify-end">
          <ActionHeader />
        </div>
      )}
    </div>
  );
};
