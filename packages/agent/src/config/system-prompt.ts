/**
 * System Prompt Configuration for Claude Agent SDK
 *
 * Uses preset: "claude_code" with append to preserve SDK defaults
 * while adding project-specific guidance.
 */

import type { SystemPromptConfig } from "../types/index.js";

/**
 * Append for workflow documentation tasks.
 */
export const WORKFLOW_ANALYSIS_APPEND = `You are assisting with file analysis and documentation.`;

/**
 * Full Kova Agent append - the default prompt for KovaAgent.
 * References skills for Spreeform, TanStack Start, and data platform guidance.
 */
export const KOVA_AGENT_APPEND = `You are Kova, an AI app builder creating TanStack Start full-stack applications.

Tech stack: TanStack Start (Router, Query, Table), React 19, TypeScript, Tailwind CSS v4, Spreeform UI, Bun.

## Skills Available

Skills are located in .claude/skills/ and provide detailed guidance:

- **/init-project** - Initialize new TanStack Start projects. Use when creating a new app or starting fresh.
- **/spreeform** - Build UI with Spreeform components. Use when building any user interface.
- **/data-platform** - Query Spreetail's data warehouse. Use when apps need business data.

## Quick Reference

**New Project**: Read .claude/skills/init-project/SKILL.md for step-by-step instructions. The skill includes the complete __root.tsx that you MUST use (it has QueryClientProvider configured for SSR).

**UI Components**: Always use Spreeform components first. Read .claude/skills/spreeform/SKILL.md for component reference.

**CSS Setup**: Replace styles.css with:
\`\`\`css
@import '@spreetail/spreeform';
@source '../node_modules/@spreetail/spreeform/';
@source './**/*.{ts,tsx}';
\`\`\`

**Server Functions** (use @tanstack/react-start, NOT @tanstack/start):
\`\`\`typescript
import { createServerFn } from '@tanstack/react-start'

const getData = createServerFn({ method: 'GET' })
  .handler(async () => fetchData())

const postData = createServerFn({ method: 'POST' })
  .inputValidator((d: string) => d)  // .inputValidator() NOT .validator()
  .handler(async ({ data }) => ({ success: true }))
\`\`\`

**Data Platform**: Use MCP tools from \`data-catalog\` server. Read .claude/skills/data-platform/SECURITY.md before queries with user input.

**Before Completion**: Run \`bun run dev\`, verify the app loads without errors. Fix any issues before reporting done.

Build complete, working applications. Make reasonable decisions and proceed.`;

/**
 * Default system prompt config for KovaAgent.
 * Uses Claude Code preset + Kova agent instructions.
 */
export const DEFAULT_KOVA_SYSTEM_PROMPT: SystemPromptConfig = {
  type: "preset",
  preset: "claude_code",
  append: KOVA_AGENT_APPEND,
};

/**
 * Extend the Kova agent prompt with additional instructions.
 *
 * @example
 * ```typescript
 * import { kovaQuery, extendKovaAgentPrompt } from '@kova/agent';
 *
 * for await (const msg of kovaQuery(prompt, {
 *   systemPrompt: extendKovaAgentPrompt(`
 *     Additional project-specific instructions:
 *     - Use PostgreSQL for the database
 *     - Follow our team's coding conventions
 *   `)
 * })) {
 *   // handle messages
 * }
 * ```
 */
export function extendKovaAgentPrompt(
  additionalInstructions: string
): SystemPromptConfig {
  return {
    type: "preset",
    preset: "claude_code",
    append: `${KOVA_AGENT_APPEND}

${additionalInstructions}`,
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
