import type { Tool, ToolCallResult } from './types.js';

export interface DelegateToolConfig {
  onDelegate: (args: {
    task: string;
    summary?: string;
    depth: number;
  }) => Promise<ToolCallResult>;
  currentDepth: number;
  maxDepth: number;
}

export function createDelegateTool(config: DelegateToolConfig): Tool {
  return {
    name: 'delegate',
    description: 'Delegate a sub-task to a child agent instance. Use for complex tasks that can be parallelized or decomposed.',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'The specific task to delegate to the child agent'
        },
        summary: {
          type: 'string',
          description: 'Optional context summary for the child agent'
        }
      },
      required: ['task']
    },
    maxDepth: config.maxDepth - 1,
    costMultiplier: 3,
    execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
      const task = String(args['task'] ?? '');
      const summary = args['summary'] !== undefined ? String(args['summary']) : undefined;

      if (!task) {
        return { error: 'Task is required for delegation' };
      }

      return config.onDelegate({
        task,
        summary,
        depth: config.currentDepth + 1
      });
    }
  };
}

export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

export const estimateTokensTool: Tool = {
  name: 'estimate_tokens',
  description: 'Estimate the number of tokens in a text string (rough approximation)',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text to estimate token count for'
      }
    },
    required: ['text']
  },
  execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    const text = String(args['text'] ?? '');
    const tokens = estimateTokens(text);
    return { tokens, characters: text.length };
  }
};
