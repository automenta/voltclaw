import React from 'react';
import { Box, Text, Static } from 'ink';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool?: string;
  timestamp: number;
}

export const MessageList = ({
  messages,
  streamingContent
}: {
  messages: ChatMessage[];
  streamingContent?: string;
}) => {
  return (
    <Box flexDirection="column">
      <Static items={messages}>
        {(msg) => (
          <Box key={msg.id} flexDirection="column" marginBottom={1}>
            <Text bold color={msg.role === 'user' ? 'blue' : msg.role === 'tool' ? 'yellow' : 'magenta'}>
              {msg.role === 'user' ? 'You' : msg.role === 'tool' ? `Tool (${msg.tool})` : 'VoltClaw'}:
            </Text>
            <Text>{msg.content}</Text>
          </Box>
        )}
      </Static>
      {streamingContent && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="magenta">VoltClaw:</Text>
          <Text>{streamingContent}</Text>
        </Box>
      )}
    </Box>
  );
};
