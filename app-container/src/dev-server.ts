/**
 * Dev Server Manager
 * Spawns and manages the user's app dev server
 */

import { ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { devServerLog as log } from "./logger.js";
import type { DevServerStatus } from "./types.js";

// Get the directory where this module is located (for finding assets)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Dev Server Manager class
 */
export class DevServerManager {
  private process: ChildProcess | null = null;
  private status: DevServerStatus = "stopped";
  private workspaceDir: string;
  private port: number;
  private restartCount = 0;
  private maxRestarts = 3;
  private restartDelay = 2000; // ms
  private servingPlaceholder = false;
  private lastRestartTime = 0;
  private restartDebounceMs = 500; // Debounce rapid restart requests

  constructor(workspaceDir: string, port: number = 3000) {
    this.workspaceDir = workspaceDir;
    this.port = port;
  }

  /**
   * Get current server status
   */
  getStatus(): DevServerStatus {
    return this.status;
  }

  /**
   * Check if currently serving placeholder page
   */
  isServingPlaceholder(): boolean {
    return this.servingPlaceholder;
  }

  /**
   * Check if real content is now available and restart if so
   * Call this after agent makes changes to the workspace
   */
  async checkAndRestartIfContentAvailable(): Promise<boolean> {
    if (!this.servingPlaceholder) {
      return false; // Already serving real content
    }

    // Check if the workspace now has servable content
    const projectDir = this.findProjectDir();
    const packageJsonPath = join(projectDir, "package.json");
    const hasPackageJson = existsSync(packageJsonPath);

    const hasServableContent = hasPackageJson
      ? this.detectDevCommand(projectDir) !== null
      : this.isStaticSite(projectDir);

    if (hasServableContent) {
      log.log("Servable content detected, restarting to serve real app...");
      await this.restart();
      return true;
    }

    return false;
  }

  /**
   * Start the dev server
   * Supports framework projects with package.json OR static HTML sites
   */
  async start(): Promise<void> {
    // Find the actual project directory (might be in a subdirectory)
    let projectDir = this.findProjectDir();
    log.log(`Using project directory: ${projectDir}`);

    // Check if package.json exists in project dir
    const packageJsonPath = join(projectDir, "package.json");
    const hasPackageJson = existsSync(packageJsonPath);

    // If package.json exists, ensure node_modules is installed
    if (hasPackageJson) {
      const nodeModulesPath = join(projectDir, "node_modules");
      // Check if node_modules exists AND has content (not just an empty directory from a volume mount)
      const nodeModulesExists = existsSync(nodeModulesPath);
      const nodeModulesHasContent = nodeModulesExists && readdirSync(nodeModulesPath).length > 0;

      if (!nodeModulesHasContent) {
        log.log("node_modules empty or not found, running bun install...");
        await this.runBunInstall(projectDir);
      }
    }

    this.status = "starting";
    log.log(`Starting dev server on port ${this.port}...`);

    try {
      // Detect framework and get appropriate command
      let cmd: string;
      let args: string[];

      const devCommand = hasPackageJson
        ? this.detectDevCommand(projectDir)
        : null;

      if (devCommand) {
        cmd = devCommand.cmd;
        args = devCommand.args;
        this.servingPlaceholder = false;
      } else if (this.isStaticSite(projectDir)) {
        // Use bunx serve for static HTML sites (no package.json needed)
        log.log("Detected static HTML site, using serve");
        cmd = "bunx";
        args = ["serve", "-l", String(this.port), "-s", "."];
        this.servingPlaceholder = false;
      } else {
        // Serve placeholder page while waiting for content
        log.log("No servable content found, serving placeholder page");
        // Assets are at /app/assets, __dirname is /app/dist/src
        const assetsDir = join(__dirname, "..", "..", "assets");
        cmd = "bunx";
        args = ["serve", "-l", String(this.port), "-s", assetsDir];
        projectDir = assetsDir; // Override projectDir for serve command
        this.servingPlaceholder = true;
      }

      log.log(`Running: ${cmd} ${args.join(" ")}`);

      this.process = spawn(cmd, args, {
        cwd: projectDir,
        env: {
          ...process.env,
          PORT: String(this.port),
          // Allow Vite to accept connections from Traefik proxy (Vite 5.4.12+/6+/7+ security feature)
          // This env var adds hosts to the allowedHosts list without modifying vite.config
          // Format: comma-separated list of hosts or patterns
          __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: ".localhost,app-*",
        },
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
        detached: true, // Create process group for proper cleanup
      });

      this.process.stdout?.on("data", (data) => {
        const output = data.toString().trim();
        log.log(`stdout: ${output}`);

        // Detect when server is ready (common patterns)
        if (
          output.includes("Local:") ||
          output.includes("ready in") ||
          output.includes("listening on") ||
          output.includes("started server") ||
          output.includes("Accepting connections") || // serve
          output.includes("Serving!") // serve
        ) {
          this.status = "running";
          log.log("Server is running");

          // Only emit the "real content ready" signal if NOT serving placeholder
          // The backend uses this to know when to broadcast the preview URL
          if (!this.servingPlaceholder) {
            log.log("[kova-real-content-ready]");
          }
        }
      });

      this.process.stderr?.on("data", (data) => {
        log.error(`stderr: ${data}`);
      });

      this.process.on("close", (code) => {
        log.log(`Process exited with code ${code}`);
        this.process = null;

        if (this.status === "running" && this.restartCount < this.maxRestarts) {
          log.log(`Restarting (attempt ${this.restartCount + 1}/${this.maxRestarts})...`);
          this.restartCount++;
          setTimeout(() => this.start(), this.restartDelay);
        } else {
          this.status = code === 0 ? "stopped" : "error";
        }
      });

      this.process.on("error", (error) => {
        log.error(`Error: ${error.message}`);
        this.status = "error";
      });

      // Reset restart count on successful start
      this.restartCount = 0;
    } catch (error) {
      log.error("Failed to start:", error);
      this.status = "error";
      throw error;
    }
  }

  /**
   * Run bun install in the project directory
   */
  private async runBunInstall(projectDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const installProcess = spawn("bun", ["install"], {
        cwd: projectDir,
        stdio: "inherit",
        shell: true,
      });

      installProcess.on("close", (code) => {
        if (code === 0) {
          log.log("bun install completed");
          resolve();
        } else {
          reject(new Error(`bun install failed with code ${code}`));
        }
      });

      installProcess.on("error", reject);
    });
  }

  /**
   * Detect the framework used by the project
   * Returns the dev server command and args to use
   */
  private detectDevCommand(
    projectDir: string,
  ): { cmd: string; args: string[] } | null {
    const packageJsonPath = join(projectDir, "package.json");

    // If no package.json, this might be a static HTML site
    if (!existsSync(packageJsonPath)) {
      return null;
    }

    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Check for common frameworks
      if (allDeps.vite) {
        log.log("Detected Vite project");
        return {
          cmd: "bunx",
          args: ["vite", "--port", String(this.port), "--host", "0.0.0.0"],
        };
      }

      if (allDeps.next) {
        log.log("Detected Next.js project");
        return {
          cmd: "bunx",
          args: [
            "next",
            "dev",
            "--port",
            String(this.port),
            "--hostname",
            "0.0.0.0",
          ],
        };
      }

      if (allDeps["@angular/cli"]) {
        log.log("Detected Angular project");
        return {
          cmd: "bunx",
          args: [
            "ng",
            "serve",
            "--port",
            String(this.port),
            "--host",
            "0.0.0.0",
          ],
        };
      }

      if (allDeps["react-scripts"]) {
        log.log("Detected Create React App project");
        return {
          cmd: "bunx",
          args: ["react-scripts", "start"],
        };
      }

      // Check if there's a dev script defined
      if (pkg.scripts?.dev) {
        log.log("Found dev script, using bun run dev");
        return {
          cmd: "bun",
          args: [
            "run",
            "dev",
            "--",
            "--port",
            String(this.port),
            "--host",
            "0.0.0.0",
          ],
        };
      }

      // No framework or dev script found
      return null;
    } catch (error) {
      log.error("Error reading package.json:", error);
      return null;
    }
  }

  /**
   * Check if this is a static HTML site (has index.html but no framework)
   */
  private isStaticSite(projectDir: string): boolean {
    // Check for common entry points
    const staticFiles = ["index.html", "index.htm", "default.html"];
    return staticFiles.some((file) => existsSync(join(projectDir, file)));
  }

  /**
   * Find the actual project directory
   * The agent might create a subdirectory for the project (e.g., /workspace/my-app)
   * Returns the path to the directory containing package.json or index.html
   */
  private findProjectDir(): string {
    // First, check if workspace itself has servable content
    const packageJsonPath = join(this.workspaceDir, "package.json");
    if (existsSync(packageJsonPath)) {
      log.log("Found package.json in workspace root");
      return this.workspaceDir;
    }

    // Check for static site in root
    const staticFiles = ["index.html", "index.htm", "default.html"];
    if (staticFiles.some((file) => existsSync(join(this.workspaceDir, file)))) {
      log.log("Found static site in workspace root");
      return this.workspaceDir;
    }

    // Look for a subdirectory with package.json or index.html
    try {
      const entries = readdirSync(this.workspaceDir);
      for (const entry of entries) {
        // Skip hidden directories and common non-project dirs
        if (entry.startsWith(".") || entry === "node_modules") continue;

        const entryPath = join(this.workspaceDir, entry);
        try {
          if (statSync(entryPath).isDirectory()) {
            // Check for package.json in subdirectory
            if (existsSync(join(entryPath, "package.json"))) {
              log.log(`Found package.json in subdirectory: ${entry}`);
              return entryPath;
            }
            // Check for static site in subdirectory
            if (staticFiles.some((file) => existsSync(join(entryPath, file)))) {
              log.log(`Found static site in subdirectory: ${entry}`);
              return entryPath;
            }
          }
        } catch {
          // Ignore errors accessing individual entries
        }
      }
    } catch (error) {
      log.error("Error scanning workspace:", error);
    }

    // Default to workspace dir
    log.log("No project found, using workspace root");
    return this.workspaceDir;
  }

  /**
   * Stop the dev server
   */
  async stop(): Promise<void> {
    if (!this.process) {
      this.status = "stopped";
      return;
    }

    // Set status to "stopping" FIRST to prevent auto-restart logic in close handler
    this.status = "stopping";
    log.log("Stopping dev server...");
    const pid = this.process.pid;

    return new Promise((resolve) => {
      if (!this.process) {
        this.status = "stopped";
        resolve();
        return;
      }

      // Timeout to prevent hanging forever
      const timeout = setTimeout(() => {
        log.log("Stop timeout reached, forcing cleanup...");
        this.process = null;
        this.status = "stopped";
        resolve();
      }, 10000);

      // Force kill timer - must be cleared when process exits normally
      let forceKillTimeout: NodeJS.Timeout | null = null;

      this.process.on("close", () => {
        clearTimeout(timeout);
        if (forceKillTimeout) {
          clearTimeout(forceKillTimeout);
          forceKillTimeout = null;
        }
        this.process = null;
        this.status = "stopped";
        log.log("Server stopped");
        resolve();
      });

      // Try to kill the process tree (shell + children)
      // On Unix, negative PID kills the process group
      if (pid) {
        try {
          log.log(`Killing process tree (PID: ${pid})...`);
          process.kill(-pid, "SIGTERM");
        } catch (e) {
          // Fallback to regular kill if process group kill fails
          log.log("Process group kill failed, using regular kill");
          this.process?.kill("SIGTERM");
        }
      } else {
        this.process.kill("SIGTERM");
      }

      // Force kill after timeout (cleared above if process exits normally)
      forceKillTimeout = setTimeout(() => {
        if (this.process && pid) {
          log.log("Force killing server (SIGKILL)...");
          try {
            process.kill(-pid, "SIGKILL");
          } catch (e) {
            this.process?.kill("SIGKILL");
          }
        }
      }, 5000);
    });
  }

  /**
   * Restart the dev server
   * Includes debouncing to prevent rapid successive restarts
   */
  async restart(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRestart = now - this.lastRestartTime;

    // Debounce: if a restart was triggered recently, skip this one
    if (timeSinceLastRestart < this.restartDebounceMs) {
      log.log(
        `Restart debounced (${timeSinceLastRestart}ms since last restart, threshold: ${this.restartDebounceMs}ms)`,
      );
      return;
    }

    this.lastRestartTime = now;
    log.log("Restarting dev server...");
    await this.stop();
    await this.start();
  }
}
