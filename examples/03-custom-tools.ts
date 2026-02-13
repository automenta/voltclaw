import { VoltClawAgent } from 'voltclaw';
import type { Tool } from '@voltclaw/tools';
import { MemoryStore } from '@voltclaw/memory';
import { MockLLM } from '@voltclaw/testing';

const calculatorTool: Tool = {
  name: 'calculate',
  description: 'Perform basic arithmetic calculations',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression to evaluate (e.g., "2+2")'
      }
    },
    required: ['expression']
  },
  execute: async (args) => {
    const expr = String(args['expression']);
    try {
      const result = Function('"use strict"; return (' + expr + ')')();
      return { result };
    } catch {
      return { error: 'Invalid expression' };
    }
  }
};

const agent = new VoltClawAgent({
  llm: new MockLLM({ defaultResponse: 'Done' }),
  persistence: new MemoryStore(),
  tools: [calculatorTool]
});
