import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, Static } from 'ink';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool?: string;
  timestamp: number;
}

const ToolOutput = ({ content, tool }: { content: string, tool?: string }) => {
    // Try to prettify JSON output
    let displayContent = content;
    try {
        const parsed = JSON.parse(content);
        displayContent = JSON.stringify(parsed, null, 2);
    } catch {
        // Not JSON, keep as is
    }

    return (
        <Box borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column" marginY={1}>
            <Text bold color="yellow">🛠 TOOL OUTPUT ({tool})</Text>
            <Text dimColor wrap="wrap">{displayContent.length > 500 ? displayContent.slice(0, 500) + '...' : displayContent}</Text>
        </Box>
    );
};

export const MessageList = ({
  messages,
  streamingContent
}: {
  messages: ChatMessage[];
  streamingContent?: string;
}) => {
  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Static items={messages}>
        {(msg) => (
          <Box key={msg.id} flexDirection="column" marginBottom={0}>
            <Box>
                <Text dimColor>{new Date(msg.timestamp).toLocaleTimeString()} </Text>
                <Text bold color={msg.role === 'user' ? 'green' : msg.role === 'tool' ? 'yellow' : 'magenta'}>
                  {msg.role === 'user' ? '› ' : msg.role === 'tool' ? '' : '› '}
                </Text>
                {msg.role !== 'tool' && <Text>{msg.content}</Text>}
            </Box>

            {msg.role === 'tool' && (
                <ToolOutput content={msg.content} tool={msg.tool} />
            )}
          </Box>
        )}
      </Static>
      {streamingContent && (
        <Box flexDirection="column" marginBottom={0}>
          <Text bold color="magenta">› </Text>
          <Text>{streamingContent}</Text>
        </Box>
      )}
    </Box>
  );
};
