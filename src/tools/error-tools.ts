import type { VoltClawAgent } from '../core/agent.js';
import type { Tool } from '../core/types.js';

export function createErrorTools(agent: VoltClawAgent): Tool[] {
    return [
        {
            name: 'error_list',
            description: 'List failed tool operations that have been logged as errors.',
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
            name: 'error_get',
            description: 'Get details of a specific failed operation.',
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
            name: 'error_retry',
            description: 'Retry a failed tool operation.',
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

                    await agent.errors.remove(id);

                    if (result.error) {
                        return { status: 'failed_again', error: result.error, tool_output: result };
                    }

                    return { status: 'success', tool_output: result };
                } catch (error) {
                    return { error: `Retry failed: ${error instanceof Error ? error.message : String(error)}` };
                }
            }
        },
        {
            name: 'error_delete',
            description: 'Delete a failed operation from the error log.',
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
            name: 'error_clear',
            description: 'Clear all failed operations from the error log.',
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
