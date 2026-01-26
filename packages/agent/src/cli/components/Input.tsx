/**
 * Input component - User text input
 */

import React, { useState, useRef } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

export interface InputProps {
  onSubmit: (value: string) => void;
  isDisabled?: boolean;
  placeholder?: string;
}

/** Time window for double-escape detection (ms) */
const DOUBLE_ESCAPE_WINDOW = 300;

export function Input({
  onSubmit,
  isDisabled = false,
  placeholder = "Type your message...",
}: InputProps): React.ReactElement {
  const [value, setValue] = useState("");
  const lastEscapeRef = useRef<number>(0);

  // Handle double-escape to clear input
  useInput((_input, key) => {
    if (key.escape && !isDisabled) {
      const now = Date.now();
      if (now - lastEscapeRef.current < DOUBLE_ESCAPE_WINDOW) {
        // Double escape - clear the input
        setValue("");
        lastEscapeRef.current = 0;
      } else {
        lastEscapeRef.current = now;
      }
    }
  });

  const handleSubmit = (text: string) => {
    if (text.trim() && !isDisabled) {
      onSubmit(text.trim());
      setValue("");
    }
  };

  return (
    <Box>
      <Text color="green" bold>
        {">"}{" "}
      </Text>
      {isDisabled ? (
        <Text color="gray" dimColor>
          {placeholder}
        </Text>
      ) : (
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder={placeholder}
        />
      )}
    </Box>
  );
}
