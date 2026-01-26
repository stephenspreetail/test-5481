/**
 * Main CLI Application - Ink-based chat interface for Kova Agent
 */

import React, { useCallback } from "react";
import { Box, useApp } from "ink";
import { Header } from "./components/Header.js";
import { MessageList } from "./components/MessageList.js";
import { Input } from "./components/Input.js";
import { ToolStatus } from "./components/ToolStatus.js";
import { useAgent } from "./hooks/useAgent.js";
import type { KovaQueryOptions } from "../core/types.js";

export interface AppProps {
  /** Agent configuration */
  config?: KovaQueryOptions;
  /** Project name to display */
  projectName?: string;
  /** Working directory for agent operations */
  cwd?: string;
  /** Initial prompt to send on startup */
  initialPrompt?: string;
}

export function App({
  config,
  projectName,
  cwd,
  initialPrompt,
}: AppProps): React.ReactElement {
  const { exit } = useApp();
  const {
    messages,
    isLoading,
    error,
    sessionId,
    currentTool,
    sendMessage,
  } = useAgent(config);

  // Ctrl+C is handled by Ink automatically for exit

  // Handle initial prompt
  React.useEffect(() => {
    if (initialPrompt) {
      const options: KovaQueryOptions = cwd ? { cwd } : {};
      sendMessage(initialPrompt, options);
    }
  }, [initialPrompt, cwd, sendMessage]);

  const handleSubmit = useCallback(
    (prompt: string) => {
      // Check for exit command
      if (prompt.toLowerCase().trim() === "/exit") {
        exit();
        return;
      }

      const options: KovaQueryOptions = cwd ? { cwd } : {};
      sendMessage(prompt, options);
    },
    [sendMessage, cwd, exit]
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Header projectName={projectName} sessionId={sessionId} />
      <MessageList messages={messages} />
      <ToolStatus
        currentTool={currentTool}
        isLoading={isLoading}
        error={error}
      />
      <Input
        onSubmit={handleSubmit}
        isDisabled={isLoading}
        placeholder={isLoading ? "Processing..." : "Type your message..."}
      />
    </Box>
  );
}
