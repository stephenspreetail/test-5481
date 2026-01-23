/**
 * System Prompt Configuration for Claude Agent SDK
 *
 * Uses preset: "claude_code" with append to preserve SDK defaults
 * while adding project-specific guidance.
 */

/**
 * Minimal append for workflow analysis/planning steps.
 * Keeps it simple - the skill handles all the instructions.
 */
export const WORKFLOW_ANALYSIS_APPEND = `You are assisting with file analysis and documentation.`;

/**
 * Minimal guidance to append to the claude_code preset.
 * This adds project context without being prescriptive.
 */
export const KOVA_SYSTEM_APPEND = `You are Kova, an AI app builder creating modern web applications.

Tech stack preferences:
- React 18 with TypeScript
- Vite as the build tool
- Tailwind CSS for styling

When starting a new project, initialize with:
- package.json with React, Vite, TypeScript, Tailwind dependencies
- vite.config.ts with React plugin
- tsconfig.json for TypeScript
- Tailwind configuration files
- src/main.tsx as the entry point
- src/App.tsx as the main component

Use relative file paths from the workspace root (e.g., "src/App.tsx", not "/workspace/src/App.tsx").

Build complete, working applications. Don't ask for clarification unless truly necessary - make reasonable decisions and proceed with building.`;

/**
 * System prompt configuration object for Claude Agent SDK
 * Uses preset: "claude_code" to preserve built-in tools and safety
 */
export interface SystemPromptConfig {
  type: "preset";
  preset: "claude_code";
  append: string;
}

/**
 * Construct the system prompt config for the Claude Agent SDK
 */
export function constructSystemPromptConfig(
  customAppend?: string,
): SystemPromptConfig {
  return {
    type: "preset",
    preset: "claude_code",
    append: customAppend || KOVA_SYSTEM_APPEND,
  };
}

/**
 * Construct a minimal system prompt for workflow analysis.
 * This lets the skill guide the agent without app-building context.
 */
export function constructWorkflowAnalysisPromptConfig(): SystemPromptConfig {
  return {
    type: "preset",
    preset: "claude_code",
    append: WORKFLOW_ANALYSIS_APPEND,
  };
}

/**
 * Check if a prompt is a workflow analysis prompt
 * (e.g., "document the workflow in 'file.xlsx'" or "analyze the UI image 'file.png'")
 */
export function isWorkflowAnalysisPrompt(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase();
  return (
    lowerPrompt.startsWith("document the workflow") ||
    lowerPrompt.startsWith("analyze the ui image") ||
    lowerPrompt.includes(".xlsx") ||
    // Image file extensions for image-forge
    (lowerPrompt.includes("app planning document") && (
      lowerPrompt.includes(".png") ||
      lowerPrompt.includes(".jpg") ||
      lowerPrompt.includes(".jpeg") ||
      lowerPrompt.includes(".gif") ||
      lowerPrompt.includes(".webp")
    ))
  );
}
