import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

export const InputPrompt = ({
  onSubmit,
  isThinking
}: {
  onSubmit: (input: string) => void;
  isThinking: boolean;
}) => {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useInput((input, key) => {
    if (isThinking) return;

    if (key.upArrow) {
      if (history.length > 0) {
          if (historyIndex < history.length - 1) {
              const newIndex = historyIndex + 1;
              setHistoryIndex(newIndex);
              setValue(history[history.length - 1 - newIndex]);
          } else if (historyIndex === -1 && history.length > 0) {
              // Start from latest
              setHistoryIndex(0);
              setValue(history[history.length - 1]);
          }
      }
    }

    if (key.downArrow) {
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setValue(history[history.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setValue('');
      }
    }
  }, { isActive: !isThinking });

  // If thinking, we still render the TextInput but keep it visually disabled or hidden
  // unmounting causes focus loss issues when remounting
  return (
    <Box>
        {isThinking ? (
            <Text dimColor>› Processing...</Text>
        ) : (
            <>
                <Text color="green">› </Text>
                <TextInput
                    value={value}
                    onChange={setValue}
                    focus={!isThinking}
                    onSubmit={(val) => {
                        const trimmed = val.trim();
                        if (trimmed) {
                            setHistory(prev => {
                                if (prev.length > 0 && prev[prev.length - 1] === trimmed) return prev;
                                return [...prev, trimmed];
                            });
                            setHistoryIndex(-1);
                            onSubmit(trimmed);
                            setValue('');
                        }
                    }}
                />
            </>
        )}
    </Box>
  );
};
