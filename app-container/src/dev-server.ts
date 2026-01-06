/**
 * Dev Server Manager
 * Spawns and manages the user's app dev server
 *
 * Note: On Windows bind mounts, symlinks in node_modules/.bin don't work,
 * so we use npx to run dev servers directly instead of relying on npm run dev.
 */

import { ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DevServerStatus } from "./types.js";

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
   * Start the dev server
   * Supports framework projects with package.json OR static HTML sites
   */
  async start(): Promise<void> {
    // Find the actual project directory (might be in a subdirectory)
    const projectDir = this.findProjectDir();
    console.log(`[DevServer] Using project directory: ${projectDir}`);

    // Check if package.json exists in project dir
    const packageJsonPath = join(projectDir, "package.json");
    const hasPackageJson = existsSync(packageJsonPath);

    // If package.json exists, ensure node_modules is installed
    if (hasPackageJson) {
      const nodeModulesPath = join(projectDir, "node_modules");
      if (!existsSync(nodeModulesPath)) {
        console.log("[DevServer] node_modules not found, running npm install...");
        await this.runNpmInstall(projectDir);
      }
    }

    this.status = "starting";
    console.log(`[DevServer] Starting dev server on port ${this.port}...`);

    try {
      // Detect framework and get appropriate command
      // Using npx instead of npm run dev to avoid .bin symlink issues on Windows bind mounts
      let cmd: string;
      let args: string[];

      const devCommand = hasPackageJson ? this.detectDevCommand(projectDir) : null;

      if (devCommand) {
        cmd = devCommand.cmd;
        args = devCommand.args;
      } else if (this.isStaticSite(projectDir)) {
        // Use npx serve for static HTML sites (no package.json needed)
        console.log("[DevServer] Detected static HTML site, using serve");
        cmd = "npx";
        args = ["serve", "-l", String(this.port), "-s", "."];
      } else {
        console.log("[DevServer] No servable content found");
        this.status = "stopped";
        return;
      }

      console.log(`[DevServer] Running: ${cmd} ${args.join(" ")}`);

      this.process = spawn(cmd, args, {
        cwd: projectDir,
        env: {
          ...process.env,
          PORT: String(this.port),
        },
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      });

      this.process.stdout?.on("data", (data) => {
        const output = data.toString();
        console.log(`[DevServer] ${output}`);

        // Detect when server is ready (common patterns)
        if (
          output.includes("Local:") ||
          output.includes("ready in") ||
          output.includes("listening on") ||
          output.includes("started server") ||
          output.includes("Accepting connections") ||  // serve
          output.includes("Serving!")  // serve
        ) {
          this.status = "running";
          console.log("[DevServer] Server is running");
        }
      });

      this.process.stderr?.on("data", (data) => {
        console.error(`[DevServer] stderr: ${data}`);
      });

      this.process.on("close", (code) => {
        console.log(`[DevServer] Process exited with code ${code}`);
        this.process = null;

        if (this.status === "running" && this.restartCount < this.maxRestarts) {
          console.log(`[DevServer] Restarting (attempt ${this.restartCount + 1}/${this.maxRestarts})...`);
          this.restartCount++;
          setTimeout(() => this.start(), this.restartDelay);
        } else {
          this.status = code === 0 ? "stopped" : "error";
        }
      });

      this.process.on("error", (error) => {
        console.error(`[DevServer] Error: ${error.message}`);
        this.status = "error";
      });

      // Reset restart count on successful start
      this.restartCount = 0;
    } catch (error) {
      console.error("[DevServer] Failed to start:", error);
      this.status = "error";
      throw error;
    }
  }

  /**
   * Run npm install in the project directory
   * Uses --no-bin-links to work around Windows bind mount symlink issues
   */
  private async runNpmInstall(projectDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use --no-bin-links because Windows bind mounts don't support symlinks
      const installProcess = spawn("npm", ["install", "--no-bin-links"], {
        cwd: projectDir,
        stdio: "inherit",
        shell: true,
      });

      installProcess.on("close", (code) => {
        if (code === 0) {
          console.log("[DevServer] npm install completed");
          resolve();
        } else {
          reject(new Error(`npm install failed with code ${code}`));
        }
      });

      installProcess.on("error", reject);
    });
  }

  /**
   * Detect the framework used by the project
   * Returns the dev server command and args to use
   */
  private detectDevCommand(projectDir: string): { cmd: string; args: string[] } | null {
    const packageJsonPath = join(projectDir, "package.json");

    // If no package.json, this might be a static HTML site
    if (!existsSync(packageJsonPath)) {
      return null;
    }

    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Check for common frameworks and use npx to run them directly
      // This avoids relying on .bin symlinks which don't work on Windows bind mounts
      if (allDeps.vite) {
        console.log("[DevServer] Detected Vite project");
        // Run vite directly via node to avoid .bin symlink issues on Windows bind mounts
        return {
          cmd: "node",
          args: ["node_modules/vite/bin/vite.js", "--port", String(this.port), "--host", "0.0.0.0"],
        };
      }

      if (allDeps.next) {
        console.log("[DevServer] Detected Next.js project");
        // Run next directly via node to avoid .bin symlink issues
        return {
          cmd: "node",
          args: ["node_modules/next/dist/bin/next", "dev", "--port", String(this.port), "--hostname", "0.0.0.0"],
        };
      }

      if (allDeps["@angular/cli"]) {
        console.log("[DevServer] Detected Angular project");
        // Run ng directly via node to avoid .bin symlink issues
        return {
          cmd: "node",
          args: ["node_modules/@angular/cli/bin/ng.js", "serve", "--port", String(this.port), "--host", "0.0.0.0"],
        };
      }

      if (allDeps["react-scripts"]) {
        console.log("[DevServer] Detected Create React App project");
        // Run react-scripts directly via node to avoid .bin symlink issues
        return {
          cmd: "node",
          args: ["node_modules/react-scripts/bin/react-scripts.js", "start"],
        };
      }

      // Check if there's a dev script defined
      if (pkg.scripts?.dev) {
        console.log("[DevServer] Found dev script, using npm run dev");
        return {
          cmd: "npm",
          args: ["run", "dev", "--", "--port", String(this.port), "--host", "0.0.0.0"],
        };
      }

      // No framework or dev script found
      return null;
    } catch (error) {
      console.error("[DevServer] Error reading package.json:", error);
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
      console.log("[DevServer] Found package.json in workspace root");
      return this.workspaceDir;
    }

    // Check for static site in root
    const staticFiles = ["index.html", "index.htm", "default.html"];
    if (staticFiles.some((file) => existsSync(join(this.workspaceDir, file)))) {
      console.log("[DevServer] Found static site in workspace root");
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
              console.log(`[DevServer] Found package.json in subdirectory: ${entry}`);
              return entryPath;
            }
            // Check for static site in subdirectory
            if (staticFiles.some((file) => existsSync(join(entryPath, file)))) {
              console.log(`[DevServer] Found static site in subdirectory: ${entry}`);
              return entryPath;
            }
          }
        } catch {
          // Ignore errors accessing individual entries
        }
      }
    } catch (error) {
      console.error("[DevServer] Error scanning workspace:", error);
    }

    // Default to workspace dir
    console.log("[DevServer] No project found, using workspace root");
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

    console.log("[DevServer] Stopping dev server...");

    return new Promise((resolve) => {
      if (!this.process) {
        this.status = "stopped";
        resolve();
        return;
      }

      this.process.on("close", () => {
        this.process = null;
        this.status = "stopped";
        console.log("[DevServer] Server stopped");
        resolve();
      });

      // Send SIGTERM for graceful shutdown
      this.process.kill("SIGTERM");

      // Force kill after timeout
      setTimeout(() => {
        if (this.process) {
          console.log("[DevServer] Force killing server...");
          this.process.kill("SIGKILL");
        }
      }, 5000);
    });
  }

  /**
   * Restart the dev server
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }
}
