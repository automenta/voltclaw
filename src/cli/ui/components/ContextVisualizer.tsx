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
  tokens?: number;
}

const ProgressBar = ({ value, max, width = 20, color = 'green' }: { value: number, max: number, width?: number, color?: string }) => {
    const safeValue = Math.min(Math.max(0, value), max);
    const filledLength = Math.floor((safeValue / max) * width);
    const emptyLength = width - filledLength;
    const filled = '█'.repeat(filledLength);
    const empty = '░'.repeat(emptyLength);
    return <Text color={color}>{filled}{empty}</Text>;
};

export const ContextVisualizer = ({
  context
}: {
  context: AgentContext;
}) => {
  const costPercent = Math.min(100, (context.estCostUSD / context.budgetUSD) * 100);
  const costColor = costPercent > 80 ? 'red' : costPercent > 50 ? 'yellow' : 'cyan';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
        <Box justifyContent="space-between">
            <Box flexDirection="column" marginRight={2}>
                <Text bold>RECURSION DEPTH</Text>
                <Box>
                    <Text color="blue">{context.depth} </Text>
                    <ProgressBar value={context.depth} max={context.maxDepth} width={10} color="blue" />
                    <Text dimColor> /{context.maxDepth}</Text>
                </Box>
            </Box>

            <Box flexDirection="column" marginRight={2}>
                <Text bold>BUDGET USAGE</Text>
                <Box>
                    <Text color={costColor}>${context.estCostUSD.toFixed(3)} </Text>
                    <ProgressBar value={context.estCostUSD} max={context.budgetUSD} width={10} color={costColor} />
                    <Text dimColor> /${context.budgetUSD}</Text>
                </Box>
            </Box>

            <Box flexDirection="column" marginRight={2}>
                <Text bold>CALLS</Text>
                <Box>
                    <Text color="magenta">{context.callCount} </Text>
                    <ProgressBar value={context.callCount} max={context.maxCalls} width={10} color="magenta" />
                    <Text dimColor> /{context.maxCalls}</Text>
                </Box>
            </Box>

            <Box flexDirection="column">
                <Text bold>MEMORY ACCESS</Text>
                <Text color="yellow" wrap="truncate-end">
                    {context.lastMemoryAccess ? `ID: ${context.lastMemoryAccess.slice(0, 8)}...` : 'Idle'}
                </Text>
            </Box>
        </Box>

        {context.activeSubtasks.length > 0 && (
            <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray">
                <Text bold underline>ACTIVE SUBTASKS ({context.activeSubtasks.length})</Text>
                {context.activeSubtasks.map((st) => (
                    <Box key={st.id} justifyContent="space-between">
                        <Text color="yellow">Type: {st.task.split(' ')[0]}...</Text>
                        <Text dimColor>ID: {st.id.slice(-6)}</Text>
                        <Text color="blue">[D:{st.depth}]</Text>
                    </Box>
                ))}
            </Box>
        )}
    </Box>
  );
};
