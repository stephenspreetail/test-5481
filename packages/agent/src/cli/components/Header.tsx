/**
 * Header component - Shows app title and project info
 */

import React from "react";
import { Box, Text } from "ink";

export interface HeaderProps {
  projectName?: string;
  sessionId?: string | null;
}

export function Header({ projectName, sessionId }: HeaderProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="cyan">
          Kova Agent
        </Text>
        {projectName && (
          <Text color="gray"> - {projectName}</Text>
        )}
      </Box>
      {sessionId && (
        <Text color="gray" dimColor>
          Session: {sessionId.slice(0, 8)}...
        </Text>
      )}
      <Text color="gray" dimColor>
        Press Enter to send. Esc Esc to clear. Ctrl+C or /exit to quit.
      </Text>
      <Box marginTop={1}>
        <Text color="gray">{"─".repeat(60)}</Text>
      </Box>
    </Box>
  );
}
