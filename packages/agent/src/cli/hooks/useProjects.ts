/**
 * useProjects hook - React hook for managing projects
 */

import { useState, useCallback, useEffect } from "react";
import { ProjectManager } from "../../projects/manager.js";
import type { Project, ProjectMetadata } from "../../projects/types.js";

export interface UseProjectsState {
  projects: ProjectMetadata[];
  currentProject: Project | null;
  isLoading: boolean;
  error: string | null;
}

export interface UseProjectsReturn extends UseProjectsState {
  loadProjects: () => Promise<void>;
  createProject: (name: string, template?: string) => Promise<Project>;
  openProject: (nameOrId: string) => Promise<Project>;
  deleteProject: (nameOrId: string) => Promise<void>;
  getProjectPath: (nameOrId: string) => string | null;
}

/**
 * React hook for managing Kova projects
 */
export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const manager = new ProjectManager();

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const projectList = await manager.listProjects();
      setProjects(projectList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createProject = useCallback(
    async (name: string, template?: string): Promise<Project> => {
      setIsLoading(true);
      setError(null);
      try {
        const project = await manager.createProject(name, template);
        setCurrentProject(project);
        await loadProjects();
        return project;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create project";
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [loadProjects]
  );

  const openProject = useCallback(
    async (nameOrId: string): Promise<Project> => {
      setIsLoading(true);
      setError(null);
      try {
        const project = await manager.openProject(nameOrId);
        setCurrentProject(project);
        return project;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to open project";
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const deleteProject = useCallback(
    async (nameOrId: string): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        await manager.deleteProject(nameOrId);
        if (currentProject?.metadata.name === nameOrId || currentProject?.metadata.id === nameOrId) {
          setCurrentProject(null);
        }
        await loadProjects();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to delete project";
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [currentProject, loadProjects]
  );

  const getProjectPath = useCallback(
    (nameOrId: string): string | null => {
      const project = projects.find(
        (p) => p.name === nameOrId || p.id === nameOrId
      );
      if (project) {
        return manager.getProjectPath(project.name);
      }
      return null;
    },
    [projects]
  );

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return {
    projects,
    currentProject,
    isLoading,
    error,
    loadProjects,
    createProject,
    openProject,
    deleteProject,
    getProjectPath,
  };
}
