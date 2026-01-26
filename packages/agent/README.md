# @kova/agent

Standalone Kova AI Agent package for autonomous software development tasks. A thin wrapper around Claude Agent SDK with Spreetail-specific defaults.

## Installation

```bash
npm install @kova/agent
```

## Quick Start

```typescript
import { kovaQuery } from '@kova/agent';

// Stream a query - yields raw SDK messages
for await (const message of kovaQuery("Create a hello world React app", { cwd: '/path/to/project' })) {
  // Handle raw SDK messages
  if (message.type === 'assistant' && message.message) {
    for (const block of message.message.content) {
      if (block.type === 'text') {
        console.log(block.text);
      }
    }
  }
}
```

## Features

- **kovaQuery()**: Thin wrapper around Claude Agent SDK with Spreetail defaults
- **Streaming Support**: Real-time streaming of raw SDK messages
- **Skills**: Bundled skills (xlsx, data-platform, xlsx-workflow-docs)
- **MCP Servers**: Data catalog MCP server for metadata search
- **Project Management**: XDG-compliant project storage and organization
- **Tool Presets**: Pre-configured tool sets for different use cases
- **System Prompts**: Configurable prompts with preset + append pattern
- **CLI**: Interactive terminal UI for standalone usage

## API Reference

### kovaQuery

The main export - executes a query with Spreetail defaults:

```typescript
import { kovaQuery, type KovaQueryOptions } from '@kova/agent';

const options: KovaQueryOptions = {
  cwd: '/path/to/project',     // Working directory (required for file ops)
  sessionId?: string,          // Resume a previous session
  allowedTools?: string[],     // Override default tools
  systemPrompt?: SystemPromptConfig | string,
  maxTurns?: number,           // Max turns per query
  apiKey?: string,             // Override ANTHROPIC_API_KEY env var
  mcpServers?: Record<string, McpServerConfig>,  // Additional MCP servers
};

// Yields raw SDKMessage events from Claude Agent SDK
for await (const message of kovaQuery(prompt, options)) {
  // message.type can be: 'system', 'assistant', 'user', 'result'
  if (message.type === 'assistant' && message.message) {
    for (const block of message.message.content) {
      if (block.type === 'text') console.log(block.text);
      if (block.type === 'tool_use') console.log('Tool:', block.name);
    }
  }
}
```

### Project Management

```typescript
import { ProjectManager } from '@kova/agent';

const manager = new ProjectManager();

// Create project
const project = await manager.createProject('my-app');

// List projects
const projects = await manager.listProjects();

// Open project
const project = await manager.openProject('my-app');

// Delete project
await manager.deleteProject('my-app');
```

### Tool Presets

```typescript
import { TOOL_PRESETS, getToolsForPreset } from '@kova/agent';

// Available presets:
// - readOnly: Read, Glob, Grep
// - codeEdit: Read, Write, Edit, Glob, Grep, Bash, Skill
// - all: All available tools
// - webEnabled: Read, Glob, Grep, WebSearch, WebFetch
// - fullDev: All code + web tools
```

### System Prompts

```typescript
import {
  constructSystemPromptConfig,
  constructKovaPlatformPromptConfig,
  SYSTEM_PROMPT_PRESETS
} from '@kova/agent';

// Use preset + append pattern
const config = constructSystemPromptConfig("Custom instructions...");
// Returns: { type: 'preset', preset: 'claude_code', append: '...' }
```

## Project Locations

By default, projects are stored in XDG-compliant locations:

- **Config**: `~/.config/kova/`
- **Data**: `~/.local/share/kova/`
- **Projects**: `~/.local/share/kova/projects/`

Override with environment variables:
- `KOVA_CONFIG_DIR`
- `KOVA_DATA_DIR`
- `KOVA_PROJECTS_DIR`

## CLI

The CLI provides an interactive terminal UI for using the agent outside the web platform:

```bash
# From repository root (loads .env automatically)
npm run agent                          # Start chat (auto-creates new project)
npm run agent -- --project my-app      # Open or create named project
npm run agent -- --cwd ~/projects/foo  # Work in specific directory
npm run agent -- --prompt "Build X"    # Send initial message

# Project management
npm run agent -- projects list         # List all projects
npm run agent -- projects create foo   # Create new project
npm run agent -- projects delete foo   # Delete a project

# Direct usage (after npm link or global install)
kova-agent --help
```

Projects are stored in XDG-compliant locations (see below).

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Test
npm test
```

## License

UNLICENSED - Spreetail Internal
