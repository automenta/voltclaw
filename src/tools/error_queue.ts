import type { VoltClawAgent } from '../core/agent.js';
import type { Tool } from '../core/types.js';

export function createErrorQueueTools(agent: VoltClawAgent): Tool[] {
  return [
    {
      name: 'errors_list',
      description: 'List failed operations in the Error Queue.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      },
      execute: async () => {
        const items = await agent.errors.list();
        return {
          items: items.map(i => ({
            id: i.id,
            tool: i.tool,
            error: i.error,
            timestamp: i.timestamp.toISOString(),
            retryCount: i.retryCount
          })),
          count: items.length
        };
      }
    },
    {
      name: 'errors_get',
      description: 'Get details of a specific failed operation from the Error Queue.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The ID of the failed operation.'
          }
        },
        required: ['id']
      },
      execute: async (args) => {
        const id = args.id as string;
        const item = await agent.errors.get(id);
        if (!item) {
          return { error: `Error item not found: ${id}` };
        }
        return {
          item: {
            ...item,
            timestamp: item.timestamp.toISOString()
          }
        };
      }
    },
    {
      name: 'errors_retry',
      description: 'Retry a failed operation from the Error Queue.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The ID of the failed operation to retry.'
          }
        },
        required: ['id']
      },
      execute: async (args) => {
        const id = args.id as string;
        const item = await agent.errors.get(id);
        if (!item) {
          return { error: `Error item not found: ${id}` };
        }

        try {
          const result = await agent.retryTool(item.tool, item.args);

          if (result.error) {
             await agent.errors.remove(id);
             return { status: 'failed_again', error: result.error, tool_output: result };
          }

          // Success
          await agent.errors.remove(id);
          return { status: 'success', tool_output: result };

        } catch (error) {
          return { error: `Retry failed: ${error instanceof Error ? error.message : String(error)}` };
        }
      }
    },
    {
      name: 'errors_delete',
      description: 'Delete a failed operation from the Error Queue.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The ID of the failed operation to delete.'
          }
        },
        required: ['id']
      },
      execute: async (args) => {
        const id = args.id as string;
        await agent.errors.remove(id);
        return { status: 'deleted', id };
      }
    },
    {
      name: 'errors_clear',
      description: 'Clear all failed operations from the Error Queue.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      },
      execute: async () => {
        await agent.errors.clear();
        return { status: 'cleared' };
      }
    }
  ];
}
