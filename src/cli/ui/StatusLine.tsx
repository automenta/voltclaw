import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export const StatusLine = ({
  isThinking,
  currentTool
}: {
  isThinking: boolean;
  currentTool?: string;
}) => {
  if (!isThinking && !currentTool) {
    return null;
  }

  return (
    <Box marginY={1}>
      <Text color="green">
        <Spinner type="dots" />
      </Text>
      <Text> {currentTool ? `Executing tool: ${currentTool}...` : 'Thinking...'}</Text>
    </Box>
  );
};
