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
}

const RecursionChain = ({ context }: { context: AgentContext }) => {
    // A visual representation of the agent's current position in the recursion tree
    // e.g. [Root] > [Research] > [Summary]
    // Since we don't have the full tree state here (only active subtasks), we can visualize active subs.

    if (context.activeSubtasks.length === 0) return null;

    return (
        <Box>
            <Text dimColor>Context: </Text>
            {context.activeSubtasks.map((st, i) => (
                <Text key={st.id} color="yellow">
                     {i > 0 ? ' > ' : ''}[{st.task.slice(0, 20)}{st.task.length > 20 ? '...' : ''}]
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
  const memText = context.lastMemoryAccess ? `Mem:${context.lastMemoryAccess.slice(0, 6)}` : '';

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginY={0}>
        <Box justifyContent="space-between">
            <Box gap={2}>
                <Text color="blue" bold>D:{context.depth}</Text>
                {memText && <Text color="yellow">{memText}</Text>}
                {context.estCostUSD > 0.01 && <Text dimColor>${context.estCostUSD.toFixed(3)}</Text>}
            </Box>
            {isThinking && <Text color="green" dimColor>Thinking...</Text>}
        </Box>
        <RecursionChain context={context} />
    </Box>
  );
};
