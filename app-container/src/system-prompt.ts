/**
 * System Prompt Configuration for the App Container
 *
 * Uses preset: "claude_code" to get the default Claude Code system prompt.
 * Skills and MCP servers are provided by the Claude Plugin (not the system prompt).
 */

import type { SystemPromptConfig } from "./types.js";

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
 * Extend the default prompt with additional instructions.
 * Used by the app-container to add container-specific guidance.
 */
export function extendPrompt(
  additionalInstructions: string
): SystemPromptConfig {
  return {
    type: "preset",
    preset: "claude_code",
    append: additionalInstructions,
  };
}
