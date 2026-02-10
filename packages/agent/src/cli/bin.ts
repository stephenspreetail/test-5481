#!/usr/bin/env node
/**
 * CLI Entry Point for Kova Agent
 *
 * Usage:
 *   kova-agent                      # Start interactive chat
 *   kova-agent --project my-app     # Open existing project
 *   kova-agent projects list        # List projects
 *   kova-agent projects create      # Create new project
 *   kova-agent projects open        # Open project in IDE
 */

import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { ProjectManager } from "../projects/manager.js";
import {
  injectDataPlatformCredentials,
  hasDataPlatformCredentials,
  getCredentialsPath,
  createProjectEnvFile,
} from "../config/credentials.js";
import { CLI_SYSTEM_PROMPT } from "../config/system-prompt.js";

interface CLIArgs {
  command?: string;
  subCommand?: string;
  project?: string;
  help?: boolean;
  version?: boolean;
  cwd?: string;
  prompt?: string;
}

function parseArgs(argv: string[]): CLIArgs {
  const args: CLIArgs = {};
  const positional: string[] = [];

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--version" || arg === "-v") {
      args.version = true;
    } else if (arg === "--project" || arg === "-p") {
      args.project = argv[++i];
    } else if (arg === "--cwd") {
      args.cwd = argv[++i];
    } else if (arg === "--prompt") {
      args.prompt = argv[++i];
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    args.command = positional[0];
    args.subCommand = positional[1];
  }

  return args;
}

function printHelp(): void {
  console.log(`
Kova Agent - AI-powered development assistant

Usage:
  kova-agent                           Start chat (auto-creates new project)
  kova-agent --project <name>          Open or create named project
  kova-agent --cwd <path>              Work in specific directory (advanced)
  kova-agent --prompt "message"        Send initial message

  kova-agent projects list             List all projects
  kova-agent projects create <name>    Create new project
  kova-agent projects delete <name>    Delete a project

Options:
  -p, --project <name>    Open or create a project by name
  --cwd <path>            Work in specific directory (bypasses project isolation)
  --prompt <message>      Initial prompt to send
  -h, --help              Show this help
  -v, --version           Show version

Projects are stored in: ~/.local/share/kova/projects/

Data Platform Setup:
  To use data platform features (Trino queries, metadata search), create:
  ~/.config/kova/data-platform.env

  With contents:
    DATA_PLATFORM_HOST=your-galaxy-cluster.trino.galaxy.starburst.io
    DATA_PLATFORM_USER=your-service-account@company.com
    DATA_PLATFORM_PASSWORD=your-password

Examples:
  kova-agent                          # Creates project-YYYYMMDD-xxxx
  kova-agent --project my-app         # Opens/creates 'my-app' project
  kova-agent projects list            # Show all projects
`);
}

function printVersion(): void {
  // Version is read from package.json at build time
  console.log("@kova/agent v0.1.0");
}

async function handleProjectsCommand(
  subCommand: string | undefined,
  args: CLIArgs
): Promise<void> {
  const manager = new ProjectManager();

  switch (subCommand) {
    case "list": {
      const projects = await manager.listProjects();
      if (projects.length === 0) {
        console.log("No projects found.");
        console.log(`Projects directory: ${manager.getProjectsDir()}`);
      } else {
        console.log("Projects:");
        for (const project of projects) {
          const date = new Date(project.lastAccessedAt).toLocaleDateString();
          console.log(`  ${project.name} (${date})`);
        }
      }
      break;
    }

    case "create": {
      const name = args.project || process.argv[4];
      if (!name) {
        console.error("Error: Project name required");
        console.log("Usage: kova-agent projects create <name>");
        process.exit(1);
      }
      const project = await manager.createProject(name);
      console.log(`Created project: ${project.metadata.name}`);
      console.log(`Location: ${project.path}`);
      break;
    }

    case "delete": {
      const name = args.project || process.argv[4];
      if (!name) {
        console.error("Error: Project name required");
        console.log("Usage: kova-agent projects delete <name>");
        process.exit(1);
      }
      await manager.deleteProject(name);
      console.log(`Deleted project: ${name}`);
      break;
    }

    case "open": {
      const name = args.project || process.argv[4];
      if (!name) {
        console.error("Error: Project name required");
        console.log("Usage: kova-agent projects open <name>");
        process.exit(1);
      }
      const project = await manager.openProject(name);
      console.log(`Opening project: ${project.metadata.name}`);
      console.log(`Location: ${project.path}`);
      // Could launch IDE here
      break;
    }

    default:
      console.error(`Unknown projects command: ${subCommand}`);
      console.log("Available commands: list, create, delete, open");
      process.exit(1);
  }
}

/**
 * Generate a unique project name using date and short random suffix
 */
function generateProjectName(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).substring(2, 6);
  return `project-${datePart}-${randomPart}`;
}

async function startInteractiveMode(args: CLIArgs): Promise<void> {
  let cwd: string;
  let projectName: string | undefined;
  const manager = new ProjectManager();

  if (args.cwd) {
    // Explicit --cwd flag: use that directory (power user mode)
    cwd = args.cwd;
  } else if (args.project) {
    // --project flag: open or create the named project
    try {
      const project = await manager.openProject(args.project);
      cwd = project.path;
      projectName = project.metadata.name;
    } catch {
      // Project doesn't exist, create it
      console.log(`Creating new project: ${args.project}`);
      const project = await manager.createProject(args.project);
      cwd = project.path;
      projectName = project.metadata.name;
    }
  } else {
    // No flags: auto-create a new project in the isolated projects directory
    const newName = generateProjectName();
    console.log(`Creating new project: ${newName}`);
    const project = await manager.createProject(newName);
    cwd = project.path;
    projectName = project.metadata.name;
  }

  // Always print the working directory
  console.log(`Project: ${cwd}`);
  console.log("");

  // Load data platform credentials from ~/.config/kova/data-platform.env
  // These are injected into process.env so generated apps can access them
  if (injectDataPlatformCredentials()) {
    console.log("Data platform credentials loaded");
    // Also create/update local .env in the project for standalone usage
    if (createProjectEnvFile(cwd)) {
      console.log("Synced .env file in project");
    }
  } else if (!hasDataPlatformCredentials()) {
    console.log("Note: Data platform credentials not configured");
    console.log(`  To enable data platform features, create: ${getCredentialsPath()}`);
    console.log("");
  }

  // Check for API key or Bedrock credentials
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasBedrockCreds =
    process.env.CLAUDE_CODE_USE_BEDROCK === "1" &&
    !!process.env.AWS_REGION &&
    (!!process.env.AWS_ACCESS_KEY_ID || process.env.AWS_AUTH_MODE === "pod-identity");

  if (!hasAnthropicKey && !hasBedrockCreds) {
    console.error("Error: No authentication credentials found");
    console.log("");
    console.log("Option 1: Anthropic API");
    console.log("  export ANTHROPIC_API_KEY=your-api-key");
    console.log("");
    console.log("Option 2: AWS Bedrock");
    console.log("  Linux/macOS: source ./scripts/refresh-aws-sso.sh");
    console.log("  Windows:     .\\scripts\\refresh-aws-sso.ps1");
    console.log("");
    process.exit(1);
  }

  if (hasBedrockCreds) {
    console.log("Using AWS Bedrock for authentication");
  }

  // Start the Ink app - CLI mode includes instruction to run dev server manually
  render(
    React.createElement(App, {
      config: { cwd, systemPrompt: CLI_SYSTEM_PROMPT },
      projectName,
      cwd,
      initialPrompt: args.prompt,
    })
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    return;
  }

  if (args.version) {
    printVersion();
    return;
  }

  // Handle subcommands
  if (args.command === "projects") {
    await handleProjectsCommand(args.subCommand, args);
    return;
  }

  // Default: start interactive mode
  await startInteractiveMode(args);
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
