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

export const ContextVisualizer = ({
  context
}: {
  context: AgentContext;
}) => {
  const depthBar = '█'.repeat(context.depth) + '░'.repeat(Math.max(0, context.maxDepth - context.depth));
  const costPercent = Math.min(100, (context.estCostUSD / context.budgetUSD) * 100);
  const costColor = costPercent > 80 ? 'red' : costPercent > 50 ? 'yellow' : 'green';

  return (
    <Box flexDirection="column" marginY={1}>
      <Box gap={2}>
        <Text>Rec: <Text color="cyan">[{depthBar}]</Text></Text>
        <Text>Bud: <Text color={costColor}>${context.estCostUSD.toFixed(3)}</Text></Text>
        <Text>Call: {context.callCount}/{context.maxCalls}</Text>
        <Text>Mem: {context.lastMemoryAccess || 'None'}</Text>
      </Box>
      {context.activeSubtasks.length > 0 && (
        <Box>
          <Text dimColor>Subs: </Text>
          {context.activeSubtasks.map((st, i) => (
            <Text key={st.id} color="yellow">{i > 0 ? ', ' : ''}{st.task.slice(0, 15)}..</Text>
          ))}
        </Box>
      )}
    </Box>
  );
};
