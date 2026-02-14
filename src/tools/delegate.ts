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

export function createDelegateParallelTool(config: DelegateToolConfig): Tool {
  return {
    name: 'delegate_parallel',
    description: 'Delegate multiple independent tasks in parallel. Use when subtasks do not depend on each other.',
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              task: { type: 'string' },
              summary: { type: 'string' }
            },
            required: ['task']
          },
          description: 'List of tasks to delegate in parallel (max 10)'
        }
      },
      required: ['tasks']
    },
    maxDepth: config.maxDepth - 1,
    costMultiplier: 3,
    execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
      // Note: The actual execution logic for parallel delegation is complex and currently handled
      // inside VoltClawAgent.executeDelegateParallel directly.
      // This tool definition is mainly for schema purposes if used outside the agent context.
      // However, for consistency, we could expose an onDelegateParallel hook.
      // For now, the agent handles it internally by intercepting the tool name.
      return { error: 'Parallel delegation should be handled by the agent core' };
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
