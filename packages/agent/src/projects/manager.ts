/**
 * Project Manager - CRUD operations for Kova projects
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Project,
  ProjectMetadata,
  ProjectHistory,
  CreateProjectOptions,
  ListProjectsOptions,
} from "./types.js";
import {
  getProjectsDir,
  getProjectPath,
  getProjectKovaPath,
  getProjectMetadataPath,
  getProjectHistoryPath,
  validateProjectName,
  sanitizeProjectName,
} from "./paths.js";

/**
 * Helper to check if a path exists
 */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * ProjectManager handles all project operations
 */
export class ProjectManager {
  /**
   * Get the projects directory
   */
  getProjectsDir(): string {
    return getProjectsDir();
  }

  /**
   * Get the path to a specific project
   */
  getProjectPath(name: string): string {
    return getProjectPath(name);
  }

  /**
   * Create a new project
   */
  async createProject(
    nameOrOptions: string | CreateProjectOptions,
    template?: string
  ): Promise<Project> {
    const options: CreateProjectOptions =
      typeof nameOrOptions === "string"
        ? { name: nameOrOptions, template }
        : nameOrOptions;

    // Validate or sanitize name
    const validation = validateProjectName(options.name);
    const name = validation.valid
      ? options.name
      : sanitizeProjectName(options.name);

    // Check if project already exists
    const projectPath = options.customPath || getProjectPath(name);
    if (await pathExists(projectPath)) {
      throw new Error(`Project already exists: ${name}`);
    }

    // Create directories
    const kovaPath = path.join(projectPath, ".kova");
    await fs.mkdir(kovaPath, { recursive: true });

    // Create metadata
    const now = new Date().toISOString();
    const metadata: ProjectMetadata = {
      id: randomUUID(),
      name,
      createdAt: now,
      lastAccessedAt: now,
      template: options.template,
      description: options.description,
      tags: options.tags,
    };

    // Write metadata
    const metadataPath = path.join(kovaPath, "project.json");
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    // Create empty history
    const history: ProjectHistory = { sessions: [] };
    const historyPath = path.join(kovaPath, "history.json");
    await fs.writeFile(historyPath, JSON.stringify(history, null, 2));

    // Create .gitignore for .kova directory
    const gitignorePath = path.join(kovaPath, ".gitignore");
    await fs.writeFile(gitignorePath, "# Kova session data\nhistory.json\n");

    return {
      metadata,
      path: projectPath,
      kovaPath,
    };
  }

  /**
   * Open an existing project
   */
  async openProject(nameOrId: string): Promise<Project> {
    // First, try by name
    let projectPath = getProjectPath(nameOrId);
    let metadataPath = getProjectMetadataPath(nameOrId);

    // Check if project exists by name
    if (!(await pathExists(metadataPath))) {
      // Try to find by ID
      const projects = await this.listProjects();
      const project = projects.find((p) => p.id === nameOrId);
      if (project) {
        projectPath = getProjectPath(project.name);
        metadataPath = getProjectMetadataPath(project.name);
      } else {
        throw new Error(`Project not found: ${nameOrId}`);
      }
    }

    // Read metadata
    const metadata: ProjectMetadata = JSON.parse(
      await fs.readFile(metadataPath, "utf-8")
    );

    // Update last accessed time
    metadata.lastAccessedAt = new Date().toISOString();
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    return {
      metadata,
      path: projectPath,
      kovaPath: getProjectKovaPath(metadata.name),
    };
  }

  /**
   * List all projects
   */
  async listProjects(options?: ListProjectsOptions): Promise<ProjectMetadata[]> {
    const projectsDir = getProjectsDir();

    // Ensure directory exists
    if (!(await pathExists(projectsDir))) {
      return [];
    }

    const entries = await fs.readdir(projectsDir, { withFileTypes: true });
    const projects: ProjectMetadata[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const metadataPath = getProjectMetadataPath(entry.name);
      if (!(await pathExists(metadataPath))) continue;

      try {
        const metadata: ProjectMetadata = JSON.parse(
          await fs.readFile(metadataPath, "utf-8")
        );
        projects.push(metadata);
      } catch {
        // Skip invalid projects
        continue;
      }
    }

    // Apply filters
    let filtered = projects;

    if (options?.tags && options.tags.length > 0) {
      filtered = filtered.filter((p) =>
        options.tags!.some((tag) => p.tags?.includes(tag))
      );
    }

    if (options?.search) {
      const search = options.search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.description?.toLowerCase().includes(search)
      );
    }

    // Sort
    const sortBy = options?.sortBy || "lastAccessedAt";
    const sortDir = options?.sortDirection || "desc";

    filtered.sort((a, b) => {
      let comparison: number;
      if (sortBy === "name") {
        comparison = a.name.localeCompare(b.name);
      } else {
        comparison = a[sortBy].localeCompare(b[sortBy]);
      }
      return sortDir === "asc" ? comparison : -comparison;
    });

    return filtered;
  }

  /**
   * Delete a project
   */
  async deleteProject(nameOrId: string): Promise<void> {
    // Find the project
    const projectPath = getProjectPath(nameOrId);

    if (!(await pathExists(projectPath))) {
      // Try to find by ID
      const projects = await this.listProjects();
      const project = projects.find((p) => p.id === nameOrId);
      if (project) {
        return this.deleteProject(project.name);
      }
      throw new Error(`Project not found: ${nameOrId}`);
    }

    // Remove the directory recursively
    await fs.rm(projectPath, { recursive: true, force: true });
  }

  /**
   * Update project metadata
   */
  async updateProject(
    nameOrId: string,
    updates: Partial<Pick<ProjectMetadata, "name" | "description" | "tags">>
  ): Promise<Project> {
    const project = await this.openProject(nameOrId);

    // Apply updates
    if (updates.description !== undefined) {
      project.metadata.description = updates.description;
    }
    if (updates.tags !== undefined) {
      project.metadata.tags = updates.tags;
    }

    // Handle rename
    if (updates.name && updates.name !== project.metadata.name) {
      const validation = validateProjectName(updates.name);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const newPath = getProjectPath(updates.name);
      if (await pathExists(newPath)) {
        throw new Error(`Project already exists: ${updates.name}`);
      }

      // Move the directory
      await fs.rename(project.path, newPath);

      // Update metadata
      project.metadata.name = updates.name;
      project.path = newPath;
      project.kovaPath = getProjectKovaPath(updates.name);
    }

    // Write updated metadata
    const metadataPath = path.join(project.kovaPath, "project.json");
    await fs.writeFile(metadataPath, JSON.stringify(project.metadata, null, 2));

    return project;
  }

  /**
   * Get project history
   */
  async getProjectHistory(nameOrId: string): Promise<ProjectHistory> {
    const project = await this.openProject(nameOrId);
    const historyPath = getProjectHistoryPath(project.metadata.name);

    if (!(await pathExists(historyPath))) {
      return { sessions: [] };
    }

    return JSON.parse(await fs.readFile(historyPath, "utf-8"));
  }

  /**
   * Add a session to project history
   */
  async addSession(
    nameOrId: string,
    session: {
      sessionId: string;
      messageCount: number;
      summary?: string;
    }
  ): Promise<void> {
    const project = await this.openProject(nameOrId);
    const historyPath = getProjectHistoryPath(project.metadata.name);

    const history = await this.getProjectHistory(nameOrId);
    history.sessions.push({
      ...session,
      startedAt: new Date().toISOString(),
    });

    await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
  }

  /**
   * Check if a project exists
   */
  async projectExists(name: string): Promise<boolean> {
    const metadataPath = getProjectMetadataPath(name);
    return pathExists(metadataPath);
  }
}
