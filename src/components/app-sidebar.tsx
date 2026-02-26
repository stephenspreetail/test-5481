import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Link, useRouterState } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import {
  HelpCircle,
  LogOut,
  Sparkles,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
// @ts-ignore
import kovaLogo from "@assets/kova-logo.svg";
// @ts-ignore
import vitaliLogo from "@assets/vitali-claude.svg";

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
import { HelpDialog } from "./HelpDialog";

// Menu items.
const items = [
  {
    title: "Apps",
    to: "/",
    icon: Sparkles,
  },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  const isAppRoute =
    pathname === "/" ||
    pathname.startsWith("/app-details") ||
    pathname === "/chat";

  const [showAppList, setShowAppList] = useState(() => isAppRoute);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const { currentUser, logout } = useAuth();
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
    if (!hasExpandedOnMount.current && showAppList && state === "collapsed") {
      toggleSidebar();
      hasExpandedOnMount.current = true;
    }
  }, [showAppList, state, toggleSidebar]);

  // Handle toggle button
  const handleToggleSidebar = () => {
    if (state === "expanded") {
      setShowAppList(false);
    } else {
      setShowAppList(true);
    }
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="overflow-hidden flex flex-col pt-2">
        {/* Top row: Toggle + Logo */}
        <div className="flex items-center shrink-0">
          <div className="w-14 flex justify-center shrink-0 pl-3">
            <SidebarTrigger onClick={handleToggleSidebar} />
          </div>
          <Link to="/" className="flex items-center gap-2 pl-6 hover:opacity-80 transition-opacity">
            <img src={kovaLogo} alt="Kova" className="h-8 w-8" />
            <img src={vitaliLogo} alt="Vitali" className="h-16" />
          </Link>
        </div>

        {/* Main content: Menu icons + Flyout panel */}
        <div className="flex flex-1 min-h-0">
          {/* Left Column: Menu items */}
          <div className="shrink-0">
            <SidebarGroup className="pr-0">
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const isActive =
                      item.to === "/" &&
                      (pathname === "/" ||
                        pathname.startsWith("/app-details") ||
                        pathname === "/chat");

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
                              setShowAppList(true);
                              if (state === "collapsed") {
                                toggleSidebar();
                              }
                              handleClearAppSelection();
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
          </div>
          {/* Right Column: App List */}
          <div className="w-[240px] overflow-hidden">
            <AppList show={showAppList} />
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
