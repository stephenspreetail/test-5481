import { cn } from "@/lib/utils";
import { Database, FileSpreadsheet, Image, ImageIcon, Upload, X } from "lucide-react";
import React, { useRef, useState } from "react";
import { Button } from "./ui/button";

export interface WorkflowType {
  id: string;
  title: string;
  description: string;
  icon: "FileSpreadsheet" | "Database" | "Image";
  acceptedFiles?: string[];
  comingSoon?: boolean;
}

interface WorkflowTypeCardProps {
  workflow: WorkflowType;
  isSelected: boolean;
  onSelect: (workflowId: string) => void;
  onCreateApp: (file: File, workflowType: string) => void;
}

const IconMap = {
  FileSpreadsheet,
  Database,
  Image,
};

export const WorkflowTypeCard: React.FC<WorkflowTypeCardProps> = ({
  workflow,
  isSelected,
  onSelect,
  onCreateApp,
}) => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const Icon = IconMap[workflow.icon];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (isValidFile(file)) {
        setUploadedFile(file);
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (isValidFile(file)) {
        setUploadedFile(file);
      }
      e.target.value = "";
    }
  };

  const isValidFile = (file: File): boolean => {
    if (!workflow.acceptedFiles) return true;
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    return workflow.acceptedFiles.includes(ext);
  };

  const handleCardClick = () => {
    if (workflow.comingSoon) return;
    onSelect(workflow.id);
  };

  const handleDropzoneClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleCreateApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (uploadedFile) {
      onCreateApp(uploadedFile, workflow.id);
    }
  };

  const handleRemoveFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setUploadedFile(null);
  };

  const handleClearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    setUploadedFile(null);
    onSelect("");
  };

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        "bg-card rounded-xl shadow-sm overflow-hidden",
        "transform transition-all duration-300 ease-in-out",
        "relative",
        workflow.comingSoon
          ? "opacity-60 cursor-not-allowed"
          : "cursor-pointer group",
        isSelected
          ? "ring-2 ring-teal-500 dark:ring-teal-400 shadow-xl"
          : !workflow.comingSoon && "hover:shadow-lg hover:-translate-y-1"
      )}
    >
      {/* Header section */}
      <div className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div
            className={cn(
              "p-3 rounded-lg",
              isSelected
                ? "bg-teal-100 dark:bg-teal-900"
                : "bg-teal-50 dark:bg-teal-900/30"
            )}
          >
            <Icon
              className={cn(
                "w-6 h-6",
                isSelected
                  ? "text-teal-600 dark:text-teal-400"
                  : "text-teal-700 dark:text-teal-500"
              )}
            />
          </div>
          {workflow.comingSoon && (
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-400">
              Coming Soon
            </span>
          )}
          {isSelected && !workflow.comingSoon && (
            <button
              onClick={handleClearSelection}
              className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>

        <h3
          className={cn(
            "text-lg font-semibold mb-2",
            isSelected
              ? "text-teal-600 dark:text-teal-400"
              : "text-gray-900 dark:text-white"
          )}
        >
          {workflow.title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {workflow.description}
        </p>
      </div>

      {/* Expanded upload section */}
      {isSelected && !workflow.comingSoon && (
        <div className="px-6 pb-6 border-t border-gray-100 dark:border-gray-700 pt-4">
          {!uploadedFile ? (
            <div
              onClick={handleDropzoneClick}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
                isDragActive
                  ? "border-teal-500 bg-teal-50 dark:bg-teal-900/20"
                  : "border-gray-300 dark:border-gray-600 hover:border-teal-400"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={workflow.acceptedFiles?.join(",")}
                onChange={handleFileInputChange}
                className="hidden"
              />
              <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isDragActive
                  ? "Drop the file here..."
                  : workflow.id === "image-forge"
                    ? "Drop your image file here, or click to select"
                    : "Drop your Excel file here, or click to select"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Accepts {workflow.acceptedFiles?.join(", ")} files
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-gray-50 dark:bg-card rounded-lg p-3">
                <div className="flex items-center gap-3">
                  {workflow.id === "image-forge" ? (
                    <ImageIcon className="w-5 h-5 text-purple-600" />
                  ) : (
                    <FileSpreadsheet className="w-5 h-5 text-green-600" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {uploadedFile.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(uploadedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleRemoveFile}
                  className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              <Button
                onClick={handleCreateApp}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold"
              >
                Create App
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
