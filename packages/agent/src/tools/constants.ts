/**
 * Tool constants and presets for the Kova Agent
 */

/**
 * Available tools in the Claude Agent SDK
 */
export const AVAILABLE_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "Task",
  "Skill",
] as const;

export type AgentTool = (typeof AVAILABLE_TOOLS)[number];

/**
 * Tool presets for different use cases
 */
export const TOOL_PRESETS = {
  /** Read-only tools for analysis */
  readOnly: ["Read", "Glob", "Grep"] as AgentTool[],

  /** Tools for code editing (default) */
  codeEdit: [
    "Read",
    "Write",
    "Edit",
    "Glob",
    "Grep",
    "Bash",
    "Skill",
  ] as AgentTool[],

  /** All available tools */
  all: [...AVAILABLE_TOOLS] as AgentTool[],

  /** Web-enabled tools for research */
  webEnabled: [
    "Read",
    "Glob",
    "Grep",
    "WebSearch",
    "WebFetch",
  ] as AgentTool[],

  /** Full development tools including web access */
  fullDev: [
    "Read",
    "Write",
    "Edit",
    "Bash",
    "Glob",
    "Grep",
    "WebSearch",
    "WebFetch",
    "Skill",
  ] as AgentTool[],
} as const;

export type ToolPreset = keyof typeof TOOL_PRESETS;

/**
 * Default tools for code editing operations
 */
export const DEFAULT_TOOLS: AgentTool[] = TOOL_PRESETS.codeEdit;
