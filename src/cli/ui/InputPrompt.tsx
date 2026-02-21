import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

export const InputPrompt = ({
  onSubmit,
  isThinking
}: {
  onSubmit: (input: string) => void;
  isThinking: boolean;
}) => {
  const [value, setValue] = useState('');

  if (isThinking) {
    return null;
  }

  return (
    <Box>
      <Text color="green">❯ </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={(val) => {
            if (val.trim()) {
                onSubmit(val);
                setValue('');
            }
        }}
      />
    </Box>
  );
};
