import React from 'react';
import { Box, Text } from 'ink';

export interface AgentContext {
  depth: number;
  maxDepth: number;
  budgetUSD: number;
  estCostUSD: number;
  activeSubtasks: {
    id: string;
    task: string;
    depth: number;
  }[];
  lastMemoryAccess?: string;
  callCount: number;
  maxCalls: number;
  tokens?: number; // actualTokensUsed in Session
}

const RecursionChain = ({ context }: { context: AgentContext }) => {
    if (context.activeSubtasks.length === 0) {
        return <Text dimColor>Context: [Root]</Text>;
    }

    return (
        <Box>
            <Text dimColor>Context: [Root]</Text>
            {context.activeSubtasks.map((st) => (
                <Text key={st.id} color="yellow">
                     {' > '}[{st.task.slice(0, 15)}{st.task.length > 15 ? '..' : ''}]
                </Text>
            ))}
        </Box>
    );
};

export const DenseStatus = ({
  context,
  isThinking
}: {
  context: AgentContext;
  isThinking: boolean;
}) => {
  const memText = context.lastMemoryAccess ? `Mem:${context.lastMemoryAccess.slice(0, 6)}` : 'Mem:--';
  const cost = context.estCostUSD.toFixed(3);
  const calls = context.callCount;

  // Dense layout: D:0 | C:0 | $:0.000 | M:-- [Thinking...]
  return (
    <Box flexDirection="column" borderStyle="none" paddingX={0} marginY={0}>
        <Box width="100%">
            <Text color="blue" bold> D:{context.depth} </Text>
            <Text color="gray">|</Text>
            <Text color="magenta"> C:{calls} </Text>
            <Text color="gray">|</Text>
            <Text color={Number(cost) > 0.5 ? 'red' : 'green'}> $:{cost} </Text>
            <Text color="gray">|</Text>
            <Text color="yellow"> {memText} </Text>

            <Box flexGrow={1} marginLeft={2}>
                 {isThinking && <Text color="green" backgroundColor="black" bold> ⚡ THINKING... </Text>}
            </Box>
        </Box>
        <RecursionChain context={context} />
        <Text dimColor>────────────────────────────────────────────────────────────────────────────────</Text>
    </Box>
  );
};
