/**
 * System Prompt Configuration
 *
 * System prompt types and functions for the Kova agent.
 * The default prompt is the standard Claude Code preset with no custom append.
 * Skills, templates, and MCP servers are loaded via the Claude Plugin.
 */

/**
 * System prompt configuration using preset with append
 */
export interface SystemPromptConfig {
  type: "preset";
  preset: "claude_code";
  append: string;
}

/**
 * Append for Excel workflow analysis tasks.
 */
export const EXCEL_WORKFLOW_ANALYSIS_APPEND =
  `You are analyzing an Excel workbook to document its workflow structure, formulas, and data flow. Use the xlsx-workflow-docs skill for detailed analysis guidance and output format.`;

/**
 * Append for image-forge analysis tasks.
 */
export const IMAGE_FORGE_ANALYSIS_APPEND =
  `You are analyzing a UI mockup, screenshot, or wireframe to create a detailed app planning document. Use the image-forge skill for component detection, layout analysis, and output format.`;

/**
 * Append for data-platform analysis tasks.
 */
export const DATA_PLATFORM_ANALYSIS_APPEND =
  `You are analyzing data platform configuration and schema. Use the data-platform skill for discovering tables, schemas, and generating appropriate queries.`;

/**
 * Default system prompt config for Kova.
 * Uses the standard Claude Code preset with no custom append.
 * Skills, templates, and MCP servers are loaded via the Claude Plugin.
 */
export const DEFAULT_KOVA_SYSTEM_PROMPT: SystemPromptConfig = {
  type: "preset",
  preset: "claude_code",
  append: "",
};

/**
 * Known analysis prompt types and their appends.
 */
const ANALYSIS_PROMPT_APPENDS: Record<string, string> = {
  "excel-workflow": EXCEL_WORKFLOW_ANALYSIS_APPEND,
  "image-forge": IMAGE_FORGE_ANALYSIS_APPEND,
  "data-platform": DATA_PLATFORM_ANALYSIS_APPEND,
};

/**
 * Construct a system prompt config for an analysis type.
 * Returns undefined for unknown types, letting the agent use its default.
 */
export function constructAnalysisPromptConfig(
  type: string,
): SystemPromptConfig | undefined {
  const append = ANALYSIS_PROMPT_APPENDS[type];
  if (!append) return undefined;
  return { type: "preset", preset: "claude_code", append };
}
