import { getClient } from "@/client/api/client_factory";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLoadApp } from "@/hooks/useLoadApp";
import { useSettings } from "@/hooks/useSettings";
import {
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  Github,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface GitHubConnectorProps {
  appId: number | null;
  folderName: string;
  expanded?: boolean;
}

interface GitHubRepo {
  name: string;
  full_name: string;
  private: boolean;
}

interface GitHubBranch {
  name: string;
  commit: { sha: string };
}

interface ConnectedGitHubConnectorProps {
  appId: number;
  app: any;
  refreshApp: () => void;
  triggerAutoSync?: boolean;
  onAutoSyncComplete?: () => void;
}

export interface UnconnectedGitHubConnectorProps {
  appId: number | null;
  folderName: string;
  settings: any;
  refreshSettings: () => void;
  handleRepoSetupComplete: () => void;
  expanded?: boolean;
}

function ConnectedGitHubConnector({
  appId,
  app,
  refreshApp,
  triggerAutoSync,
  onAutoSyncComplete,
}: ConnectedGitHubConnectorProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<boolean>(false);
  const [showForceDialog, setShowForceDialog] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const autoSyncTriggeredRef = useRef(false);

  const handleDisconnectRepo = async () => {
    setIsDisconnecting(true);
    setDisconnectError(null);
    try {
      await getClient().disconnectGithubRepo(appId);
      refreshApp();
    } catch (err: any) {
      setDisconnectError(err.message || "Failed to disconnect repository.");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleSyncToGithub = useCallback(
    async (force: boolean = false) => {
      setIsSyncing(true);
      setSyncError(null);
      setSyncSuccess(false);
      setShowForceDialog(false);

      try {
        const result = await getClient().syncGithubRepo(appId);
        if (result.success) {
          setSyncSuccess(true);
        } else {
          setSyncError("Failed to sync to GitHub.");
        }
      } catch (err: any) {
        setSyncError(err.message || "Failed to sync to GitHub.");
      } finally {
        setIsSyncing(false);
      }
    },
    [appId],
  );

  // Auto-sync when triggerAutoSync prop is true
  useEffect(() => {
    if (triggerAutoSync && !autoSyncTriggeredRef.current) {
      autoSyncTriggeredRef.current = true;
      handleSyncToGithub(false).finally(() => {
        onAutoSyncComplete?.();
      });
    } else if (!triggerAutoSync) {
      autoSyncTriggeredRef.current = false;
    }
  }, [triggerAutoSync]);

  return (
    <div className="w-full" data-testid="github-connected-repo">
      <p>Connected to GitHub Repo:</p>
      <a
        onClick={(e) => {
          e.preventDefault();
          getClient().openExternalUrl(
            `https://github.com/${app.githubOrg}/${app.githubRepo}`,
          );
        }}
        className="cursor-pointer text-blue-600 hover:underline dark:text-blue-400"
        target="_blank"
        rel="noopener noreferrer"
      >
        {app.githubOrg}/{app.githubRepo}
      </a>
      {app.githubBranch && (
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
          Branch: <span className="font-mono">{app.githubBranch}</span>
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <Button onClick={() => handleSyncToGithub(false)} disabled={isSyncing}>
          {isSyncing ? (
            <>
              <svg
                className="animate-spin h-5 w-5 mr-2 inline"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                style={{ display: "inline" }}
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Syncing...
            </>
          ) : (
            "Sync to GitHub"
          )}
        </Button>
        <Button
          onClick={handleDisconnectRepo}
          disabled={isDisconnecting}
          variant="outline"
        >
          {isDisconnecting ? "Disconnecting..." : "Disconnect from repo"}
        </Button>
      </div>
      {syncError && (
        <div className="mt-2">
          <p className="text-red-600">
            {syncError}{" "}
            <a
              onClick={(e) => {
                e.preventDefault();
                getClient().openExternalUrl(
                  "https://spreetail-engineering-playbook.tk.dev/docs/integrations/github#troubleshooting",
                );
              }}
              className="cursor-pointer text-blue-600 hover:underline dark:text-blue-400"
              target="_blank"
              rel="noopener noreferrer"
            >
              See troubleshooting guide
            </a>
          </p>
          {(syncError.includes("rejected") ||
            syncError.includes("non-fast-forward")) && (
            <Button
              onClick={() => setShowForceDialog(true)}
              variant="outline"
              size="sm"
              className="mt-2 text-orange-600 border-orange-600 hover:bg-orange-50"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Force Push (Dangerous)
            </Button>
          )}
        </div>
      )}
      {syncSuccess && (
        <p className="text-green-600 mt-2">Successfully pushed to GitHub!</p>
      )}
      {disconnectError && (
        <p className="text-red-600 mt-2">{disconnectError}</p>
      )}

      {/* Force Push Warning Dialog */}
      <Dialog open={showForceDialog} onOpenChange={setShowForceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Force Push Warning
            </DialogTitle>
            <DialogDescription>
              <div className="space-y-3">
                <p>
                  You are about to perform a <strong>force push</strong> to your
                  GitHub repository.
                </p>
                <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-md border border-orange-200 dark:border-orange-800">
                  <p className="text-sm text-orange-800 dark:text-orange-200">
                    <strong>
                      This is dangerous and non-reversible and will:
                    </strong>
                  </p>
                  <ul className="text-sm text-orange-700 dark:text-orange-300 list-disc list-inside mt-2 space-y-1">
                    <li>Overwrite the remote repository history</li>
                    <li>
                      Permanently delete commits that exist on the remote but
                      not locally
                    </li>
                  </ul>
                </div>
                <p className="text-sm">
                  Only proceed if you're certain this is what you want to do.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForceDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleSyncToGithub(true)}
              disabled={isSyncing}
            >
              {isSyncing ? "Force Pushing..." : "Force Push"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function UnconnectedGitHubConnector({
  appId,
  folderName,
  settings,
  refreshSettings,
  handleRepoSetupComplete,
  expanded,
}: UnconnectedGitHubConnectorProps) {
  // GitHub integration requires OAuth setup which is not yet implemented in web mode
  // Show a message directing users to configure GitHub access

  if (!settings?.githubAccessToken) {
    return (
      <div className="mt-1 w-full" data-testid="github-unconnected-repo">
        <div className="p-4 border rounded-md bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <Github className="h-5 w-5" />
            <span className="font-medium">GitHub Integration</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            GitHub integration requires authentication. Configure your GitHub
            access token in settings to connect repositories.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              getClient().openExternalUrl("https://github.com/settings/tokens");
            }}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Create GitHub Token
          </Button>
        </div>
      </div>
    );
  }

  // If GitHub is connected, show the repo setup UI
  return (
    <div className="w-full" data-testid="github-setup-repo">
      <div className="p-4 border rounded-md bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          GitHub repository setup is available. Use the settings panel to
          configure your repository connection.
        </p>
      </div>
    </div>
  );
}

export function GitHubConnector({
  appId,
  folderName,
  expanded,
}: GitHubConnectorProps) {
  const { app, refreshApp } = useLoadApp(appId);
  const { settings, refreshSettings } = useSettings();
  const [pendingAutoSync, setPendingAutoSync] = useState(false);

  const handleRepoSetupComplete = useCallback(() => {
    setPendingAutoSync(true);
    refreshApp();
  }, [refreshApp]);

  const handleAutoSyncComplete = useCallback(() => {
    setPendingAutoSync(false);
  }, []);

  if (app?.githubOrg && app?.githubRepo && appId) {
    return (
      <ConnectedGitHubConnector
        appId={appId}
        app={app}
        refreshApp={refreshApp}
        triggerAutoSync={pendingAutoSync}
        onAutoSyncComplete={handleAutoSyncComplete}
      />
    );
  } else {
    return (
      <UnconnectedGitHubConnector
        appId={appId}
        folderName={folderName}
        settings={settings}
        refreshSettings={refreshSettings}
        handleRepoSetupComplete={handleRepoSetupComplete}
        expanded={expanded}
      />
    );
  }
}
