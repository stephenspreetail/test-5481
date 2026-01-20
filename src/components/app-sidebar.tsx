import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { dropdownOpenAtom } from "@/atoms/uiAtoms";
import { useSidebar } from "@/components/ui/sidebar"; // import useSidebar hook
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import {
  Binoculars,
  BinocularsIcon,
  BookOpen,
  HelpCircle,
  Home,
  LogOut,
  SearchCode,
  SearchX,
  Settings,
  Sparkles,
  Store,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
// @ts-ignore
import logo from "../../assets/logo.svg";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppList } from "./AppList";
import { HelpDialog } from "./HelpDialog"; // Import the new dialog
import { HubList } from "./HubList";
import { SettingsList } from "./SettingsList";

// Menu items.
const items = [
  {
    title: "Apps",
    to: "/",
    icon: Sparkles,
  },
  {
    title: "Discovery",
    to: "/discovery",
    icon: BinocularsIcon,
  },
  {
    title: "Library",
    to: "/library",
    icon: BookOpen,
  },
  {
    title: "Hub",
    to: "/hub",
    icon: Store,
  },
  {
    title: "Settings",
    to: "/settings",
    icon: Settings,
  },
];

// Selected flyout panel
type SelectedPanel = "Apps" | "Settings" | "Hub" | null;

// Determine initial panel based on route
function getInitialPanel(pathname: string): SelectedPanel {
  if (
    pathname === "/" ||
    pathname.startsWith("/app-details") ||
    pathname === "/chat"
  ) {
    return "Apps";
  }
  if (pathname.startsWith("/settings")) {
    return "Settings";
  }
  if (pathname.startsWith("/hub")) {
    return "Hub";
  }
  return null;
}

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  const isAppRoute =
    pathname === "/" ||
    pathname.startsWith("/app-details") ||
    pathname === "/chat";
  const isSettingsRoute = pathname.startsWith("/settings");
  const isHubRoute = pathname.startsWith("/hub");

  const [selectedPanel, setSelectedPanel] = useState<SelectedPanel>(() =>
    getInitialPanel(pathname)
  );
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isDropdownOpen] = useAtom(dropdownOpenAtom);
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const hasExpandedOnMount = useRef(false);
  const setSelectedAppId = useSetAtom(selectedAppIdAtom);
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);

  // Clear app selection when clicking on Apps menu
  const handleClearAppSelection = () => {
    setSelectedAppId(null);
    setSelectedChatId(null);
  };

  // Expand sidebar on initial mount if there's a panel to show
  useEffect(() => {
    if (!hasExpandedOnMount.current && selectedPanel && state === "collapsed") {
      toggleSidebar();
      hasExpandedOnMount.current = true;
    }
  }, [selectedPanel, state, toggleSidebar]);

  // Handle clicking on a menu item - switch to that panel
  const handleMenuClick = (panel: SelectedPanel) => {
    setSelectedPanel(panel);
    if (state === "collapsed") {
      toggleSidebar();
    }
  };

  // Handle toggle button - update panel state (SidebarTrigger handles the actual toggle)
  const handleToggleSidebar = () => {
    if (state === "expanded") {
      // Closing - clear the panel
      setSelectedPanel(null);
    } else {
      // Opening - default to the appropriate panel based on current route
      if (isAppRoute) {
        setSelectedPanel("Apps");
      } else if (isSettingsRoute) {
        setSelectedPanel("Settings");
      } else if (isHubRoute) {
        setSelectedPanel("Hub");
      } else {
        setSelectedPanel("Apps");
      }
    }
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="overflow-hidden flex flex-col pt-2">
        {/* Top row: Toggle + Logo - matches the layout of menu icons + flyout panel below */}
        <div className="flex items-center shrink-0">
          {/* Toggle aligned with menu icons column */}
          <div className="w-14 flex justify-center shrink-0 pl-3">
            <SidebarTrigger onClick={handleToggleSidebar} />
          </div>
          {/* Logo aligned with flyout panel */}
          <Link to="/" className="flex items-center gap-2 pl-6 hover:opacity-80 transition-opacity">
            <img src={logo} alt="Kova Logo" className="w-6 h-6" />
            <span className="text-lg font-semibold">Kova</span>
          </Link>
        </div>

        {/* Main content: Menu icons + Flyout panel */}
        <div className="flex flex-1 min-h-0">
          {/* Left Column: Menu items */}
          <div className="shrink-0">
            <AppIcons
              selectedPanel={selectedPanel}
              onPanelClick={handleMenuClick}
              onClearAppSelection={handleClearAppSelection}
            />
          </div>
          {/* Right Column: App List Section */}
          <div className="w-[240px] overflow-hidden">
            <AppList show={selectedPanel === "Apps"} />
            <SettingsList show={selectedPanel === "Settings"} />
            <HubList show={selectedPanel === "Hub"} />
          </div>
        </div>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="sm"
                  className="font-medium w-14 flex flex-col items-center gap-1 h-14 mb-2 rounded-2xl"
                >
                  <User className="!h-6 !w-6" />
                  <span className="text-xs">Account</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-56">
                {currentUser && (
                  <>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {currentUser.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => setIsHelpDialogOpen(true)}>
                  <HelpCircle className="mr-2 h-4 w-4" />
                  Help
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <HelpDialog
              isOpen={isHelpDialogOpen}
              onClose={() => setIsHelpDialogOpen(false)}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

function AppIcons({
  selectedPanel,
  onPanelClick,
  onClearAppSelection,
}: {
  selectedPanel: SelectedPanel;
  onPanelClick: (panel: SelectedPanel) => void;
  onClearAppSelection: () => void;
}) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  return (
    <SidebarGroup className="pr-0">
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            // For Apps, also highlight when on /app-details or /chat
            const isActive =
              (item.to === "/" &&
                (pathname === "/" ||
                  pathname.startsWith("/app-details") ||
                  pathname === "/chat")) ||
              (item.to !== "/" && pathname.startsWith(item.to));

            // Items with flyout panels
            const hasFlyout = item.title === "Apps" || item.title === "Settings" || item.title === "Hub";

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  size="sm"
                  className="font-medium w-14"
                >
                  <Link
                    to={item.to}
                    className={`flex flex-col items-center gap-1 h-14 mb-2 rounded-2xl ${
                      isActive ? "bg-sidebar-accent" : ""
                    }`}
                    onClick={() => {
                      // Open flyout panel for items that have one, close for others
                      if (hasFlyout) {
                        onPanelClick(item.title as SelectedPanel);
                      } else {
                        onPanelClick(null);
                      }
                      // Clear app selection when clicking Apps
                      if (item.title === "Apps") {
                        onClearAppSelection();
                      }
                    }}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <item.icon className="h-5 w-5" />
                      <span className="text-xs">{item.title}</span>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
