import React, { useState, useEffect } from 'react';
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
    <Box paddingY={1} flexDirection="row" justifyContent="center">
      <Text color="green">
        <Spinner type="dots" />
      </Text>
      <Text bold color="green"> {currentTool ? ` EXECUTING: ${currentTool}` : ' THINKING...'}</Text>
      {currentTool && <Text dimColor> (Please wait)</Text>}
    </Box>
  );
};
