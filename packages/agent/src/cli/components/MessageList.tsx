/**
 * MessageList component - Displays chat messages
 */

import React from "react";
import { Box, Text } from "ink";
import type { Message, ToolCall } from "../hooks/useAgent.js";

export interface MessageListProps {
  messages: Message[];
}

function ToolCallDisplay({ toolCall }: { toolCall: ToolCall }): React.ReactElement {
  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text color="yellow">
        {">"} {toolCall.name}
      </Text>
      {toolCall.result !== undefined && (
        <Text color="cyan">
          {typeof toolCall.result === "string"
            ? toolCall.result.slice(0, 100) + (toolCall.result.length > 100 ? "..." : "")
            : "[result]"}
        </Text>
      )}
    </Box>
  );
}

function MessageItem({ message }: { message: Message }): React.ReactElement {
  const isUser = message.role === "user";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={isUser ? "green" : "cyan"} bold>
          {isUser ? "You" : "Kova"}
        </Text>
        <Text color="magenta">
          {" "}
          {message.timestamp.toLocaleTimeString()}
        </Text>
        {message.isStreaming && (
          <Text color="yellow"> (streaming...)</Text>
        )}
      </Box>
      <Box marginLeft={2}>
        <Text wrap="wrap">{message.content || (message.isStreaming ? "..." : "")}</Text>
      </Box>
      {message.toolCalls && message.toolCalls.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {message.toolCalls.map((toolCall, index) => (
            <ToolCallDisplay key={index} toolCall={toolCall} />
          ))}
        </Box>
      )}
    </Box>
  );
}

export function MessageList({ messages }: MessageListProps): React.ReactElement {
  if (messages.length === 0) {
    return (
      <Box marginBottom={1}>
        <Text color="cyan">
          No messages yet. Start a conversation!
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </Box>
  );
}
