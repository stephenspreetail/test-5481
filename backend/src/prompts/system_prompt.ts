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
 * Append for workflow documentation tasks.
 */
export const WORKFLOW_ANALYSIS_APPEND = `You are assisting with file analysis and documentation.`;

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
 * Check if a prompt is a workflow analysis prompt
 */
export function isWorkflowAnalysisPrompt(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase();
  return (
    lowerPrompt.startsWith("document the workflow") ||
    lowerPrompt.startsWith("analyze the ui image") ||
    lowerPrompt.includes(".xlsx") ||
    (lowerPrompt.includes("app planning document") &&
      (lowerPrompt.includes(".png") ||
        lowerPrompt.includes(".jpg") ||
        lowerPrompt.includes(".jpeg") ||
        lowerPrompt.includes(".gif") ||
        lowerPrompt.includes(".webp")))
  );
}

/**
 * Construct a system prompt for workflow analysis.
 */
export function constructWorkflowAnalysisPromptConfig(): SystemPromptConfig {
  return {
    type: "preset",
    preset: "claude_code",
    append: WORKFLOW_ANALYSIS_APPEND,
  };
}
