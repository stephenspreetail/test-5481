/**
 * ToolStatus component - Shows current tool being executed
 */

import React from "react";
import { Box, Text } from "ink";

export interface ToolStatusProps {
  currentTool: string | null;
  isLoading: boolean;
  error: string | null;
}

export function ToolStatus({
  currentTool,
  isLoading,
  error,
}: ToolStatusProps): React.ReactElement | null {
  if (error) {
    return (
      <Box marginBottom={1}>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (!isLoading && !currentTool) {
    return null;
  }

  return (
    <Box marginBottom={1}>
      {isLoading && !currentTool && (
        <Text color="yellow">Thinking...</Text>
      )}
      {currentTool && (
        <Box>
          <Text color="yellow">Running: </Text>
          <Text color="cyan" bold>
            {currentTool}
          </Text>
        </Box>
      )}
    </Box>
  );
}
