import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { getClient } from "@/client/api/client_factory";
import { CreateAppDialog } from "@/components/CreateAppDialog";
import { NeonConnector } from "@/components/NeonConnector";
import { TemplateCard } from "@/components/TemplateCard";
import {
  WorkflowTypeCard,
  type WorkflowType,
} from "@/components/WorkflowTypeCard";
import { useSettings } from "@/hooks/useSettings";
import { useTemplates } from "@/hooks/useTemplates";
import { useNavigate } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import React, { useState } from "react";

const WORKFLOW_TYPES: WorkflowType[] = [
  {
    id: "excel-workflow",
    title: "Excel Workflow",
    description:
      "Upload a workflow-style Excel workbook with Parameters \u2192 Raw Data \u2192 Processing \u2192 Output sheets and generate an app that mimics its functionality.",
    icon: "FileSpreadsheet",
    acceptedFiles: [".xlsx", ".xls"],
  },
  {
    id: "data-platform",
    title: "Data Platform Integration",
    description:
      "Connect to databases and APIs to build data-driven applications with live data sources.",
    icon: "Database",
    comingSoon: true,
  },
];

const HubPage: React.FC = () => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const [isCreatingWorkflowApp, setIsCreatingWorkflowApp] = useState(false);
  const { templates, isLoading } = useTemplates();
  const { settings, updateSettings } = useSettings();
  const selectedTemplateId = settings?.selectedTemplateId;
  const navigate = useNavigate();
  const setSelectedAppId = useSetAtom(selectedAppIdAtom);
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);

  const handleTemplateSelect = (templateId: string) => {
    updateSettings({ selectedTemplateId: templateId });
  };

  const handleCreateApp = () => {
    setIsCreateDialogOpen(true);
  };

  const handleWorkflowSelect = (workflowId: string) => {
    setSelectedWorkflowId(workflowId);
  };

  const handleCreateWorkflowApp = async (file: File, workflowType: string) => {
    if (isCreatingWorkflowApp) return;
    setIsCreatingWorkflowApp(true);

    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

      // Call the workflow app creation endpoint
      const client = getClient();
      const result = await client.createWorkflowApp({
        workflowType: workflowType as "excel-workflow" | "data-platform",
        file: base64,
        fileName: file.name,
      });

      // Set the selected app and chat IDs
      setSelectedAppId(result.appId);
      setSelectedChatId(result.chatId);

      // Store the workflow info in sessionStorage for the chat page
      sessionStorage.setItem(
        "pending-workflow-prompt",
        JSON.stringify({
          chatId: result.chatId,
          prompt: result.initialPrompt,
          workflowType: workflowType,
          workflowDocFilename: result.workflowDocFilename,
        })
      );

      // Navigate to the chat page
      navigate({
        to: "/chat",
        search: { id: result.chatId },
      });
    } catch (error) {
      console.error("Failed to create workflow app:", error);
      // TODO: Show error toast
    } finally {
      setIsCreatingWorkflowApp(false);
    }
  };
  // Separate templates into official and community
  const officialTemplates =
    templates?.filter((template) => template.isOfficial) || [];
  const communityTemplates =
    templates?.filter((template) => !template.isOfficial) || [];

  return (
    <div className="min-h-screen px-8 py-4">
      <div className="max-w-5xl mx-auto pb-12">
        <header className="mb-8 text-left">
          <h1 className="text-3xl font-bold mb-2">
            Pick your default template
          </h1>
          <p className="text-md text-gray-600 dark:text-gray-400">
            Choose a starting point for your new project.
            {isLoading && " Loading additional templates..."}
          </p>
        </header>

        {/* How I Work Section */}
        <section id="how-i-work" className="mb-12">
          <h2 className="text-2xl font-bold text-black dark:text-white mb-2">
            How I Work
          </h2>
          <p className="text-md text-gray-600 dark:text-gray-400 mb-6">
            Transform your existing workflows into web applications.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {WORKFLOW_TYPES.map((workflow) => (
              <WorkflowTypeCard
                key={workflow.id}
                workflow={workflow}
                isSelected={selectedWorkflowId === workflow.id}
                onSelect={handleWorkflowSelect}
                onCreateApp={handleCreateWorkflowApp}
              />
            ))}
          </div>
        </section>

        {/* Official Templates Section */}
        {officialTemplates.length > 0 && (
          <section id="official-templates" className="mb-12">
            <h2 className="text-2xl font-bold text-black dark:text-white mb-6">
              Official templates
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {officialTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isSelected={template.id === selectedTemplateId}
                  onSelect={handleTemplateSelect}
                  onCreateApp={handleCreateApp}
                />
              ))}
            </div>
          </section>
        )}

        {/* Community Templates Section */}
        {communityTemplates.length > 0 && (
          <section id="community-templates" className="mb-12">
            <h2 className="text-2xl font-bold text-black dark:text-white mb-6">
              Community templates
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {communityTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isSelected={template.id === selectedTemplateId}
                  onSelect={handleTemplateSelect}
                  onCreateApp={handleCreateApp}
                />
              ))}
            </div>
          </section>
        )}

        <BackendSection />
      </div>

      <CreateAppDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        template={templates.find((t) => t.id === settings?.selectedTemplateId)}
      />
    </div>
  );
};

function BackendSection() {
  return (
    <section id="backend-services" className="mb-12">
      <h2 className="text-2xl font-bold text-black dark:text-white mb-2">
        Backend Services
      </h2>
      <p className="text-md text-gray-600 dark:text-gray-400 mb-6">
        Connect to backend services for your projects.
      </p>

      <div className="grid grid-cols-1 gap-6">
        <NeonConnector />
      </div>
    </section>
  );
}

export default HubPage;
