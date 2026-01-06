import { Button } from "@/components/ui/button";
import { useEffect } from "react";

import { Label } from "@/components/ui/label";

import { getClient } from "@/client/api/client_factory";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeepLink } from "@/contexts/DeepLinkContext";
import { useLoadApp } from "@/hooks/useLoadApp";
import { useSettings } from "@/hooks/useSettings";
import { useSupabase } from "@/hooks/useSupabase";
import { toast } from "sonner";

// @ts-ignore
import connectSupabaseDark from "../../assets/supabase/connect-supabase-dark.svg";
// @ts-ignore
import connectSupabaseLight from "../../assets/supabase/connect-supabase-light.svg";
// @ts-ignore
import supabaseLogoDark from "../../assets/supabase/supabase-logo-wordmark--dark.svg";
// @ts-ignore
import supabaseLogoLight from "../../assets/supabase/supabase-logo-wordmark--light.svg";

import { useTheme } from "@/contexts/ThemeContext";
import { ExternalLink } from "lucide-react";

export function SupabaseConnector({ appId }: { appId: number }) {
  const { settings, refreshSettings } = useSettings();
  const { app, refreshApp } = useLoadApp(appId);
  const { lastDeepLink, clearLastDeepLink } = useDeepLink();
  const { isDarkMode } = useTheme();
  useEffect(() => {
    const handleDeepLink = async () => {
      if (lastDeepLink?.type === "supabase-oauth-return") {
        await refreshSettings();
        await refreshApp();
        clearLastDeepLink();
      }
    };
    handleDeepLink();
  }, [lastDeepLink?.timestamp]);
  const {
    projects,
    loading,
    error,
    loadProjects,
    branches,
    loadBranches,
    setAppProject,
    unsetAppProject,
  } = useSupabase();
  const currentProjectId = app?.supabaseProjectId;

  useEffect(() => {
    // Load projects when the component mounts and user is connected
    if (settings?.supabase?.accessToken) {
      loadProjects();
    }
  }, [settings?.supabase?.accessToken, loadProjects]);

  const handleProjectSelect = async (projectId: string) => {
    try {
      await setAppProject({ projectId, appId });
      toast.success("Project connected to app successfully");
      await refreshApp();
    } catch (error) {
      toast.error("Failed to connect project to app: " + error);
    }
  };

  const projectIdForBranches =
    app?.supabaseParentProjectId || app?.supabaseProjectId;
  useEffect(() => {
    if (projectIdForBranches) {
      loadBranches(projectIdForBranches);
    }
  }, [projectIdForBranches, loadBranches]);

  const handleUnsetProject = async () => {
    try {
      await unsetAppProject(appId);
      toast.success("Project disconnected from app successfully");
      await refreshApp();
    } catch (error) {
      console.error("Failed to disconnect project:", error);
      toast.error("Failed to disconnect project from app");
    }
  };

  if (settings?.supabase?.accessToken) {
    if (app?.supabaseProjectName) {
      return (
        <Card className="mt-1">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Supabase Project{" "}
              <Button
                variant="outline"
                onClick={() => {
                  getClient().openExternalUrl(
                    `https://supabase.com/dashboard/project/${app.supabaseProjectId}`,
                  );
                }}
                className="ml-2 px-2 py-1"
                style={{ display: "inline-flex", alignItems: "center" }}
                asChild
              >
                <div className="flex items-center gap-2">
                  <img
                    src={isDarkMode ? supabaseLogoDark : supabaseLogoLight}
                    alt="Supabase Logo"
                    style={{ height: 20, width: "auto", marginRight: 4 }}
                  />
                  <ExternalLink className="h-4 w-4" />
                </div>
              </Button>
            </CardTitle>
            <CardDescription>
              This app is connected to project: {app.supabaseProjectName}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="supabase-branch-select">Database Branch</Label>
                <Select
                  value={app.supabaseProjectId || ""}
                  onValueChange={async (supabaseBranchProjectId) => {
                    try {
                      const branch = branches.find(
                        (b) => b.projectRef === supabaseBranchProjectId,
                      );
                      if (!branch) {
                        throw new Error("Branch not found");
                      }
                      await setAppProject({
                        projectId: branch.projectRef,
                        parentProjectId: branch.parentProjectRef,
                        appId,
                      });
                      toast.success("Branch selected");
                      await refreshApp();
                    } catch (error) {
                      toast.error("Failed to set branch: " + error);
                    }
                  }}
                  disabled={loading}
                >
                  <SelectTrigger
                    id="supabase-branch-select"
                    data-testid="supabase-branch-select"
                  >
                    <SelectValue placeholder="Select a branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem
                        key={branch.projectRef}
                        value={branch.projectRef}
                      >
                        {branch.name}
                        {branch.isDefault && " (Default)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button variant="destructive" onClick={handleUnsetProject}>
                Disconnect Project
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className="mt-1">
        <CardHeader>
          <CardTitle>Supabase Projects</CardTitle>
          <CardDescription>
            Select a Supabase project to connect to this app
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <div className="text-red-500">
              Error loading projects: {error.message}
              <Button
                variant="outline"
                className="mt-2"
                onClick={() => loadProjects()}
              >
                Retry
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {projects.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No projects found in your Supabase account.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="project-select">Project</Label>
                    <Select
                      value={currentProjectId || ""}
                      onValueChange={handleProjectSelect}
                    >
                      <SelectTrigger id="project-select">
                        <SelectValue placeholder="Select a project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name || project.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {currentProjectId && (
                    <div className="text-sm text-gray-500">
                      This app is connected to project:{" "}
                      {projects.find((p) => p.id === currentProjectId)?.name ||
                        currentProjectId}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex items-center justify-center">
      <img
        onClick={async () => {
          if (settings?.isTestMode) {
            await getClient().fakeHandleSupabaseConnect({
              appId,
              fakeProjectId: "fake-project-id",
            });
          } else {
            await getClient().openExternalUrl(
              "https://supabase-oauth.TODO-URL/api/connect-supabase/login",
            );
          }
        }}
        src={isDarkMode ? connectSupabaseDark : connectSupabaseLight}
        alt="Connect to Supabase"
        className="h-10 cursor-pointer"
        data-testid="connect-supabase-button"
      />
    </div>
  );
}
