import type { Tool, MemoryEntry } from '../core/types.js';
import type { MemoryManager } from '../memory/manager.js';

export function createMemoryTools(manager: MemoryManager): Tool[] {
  return [
    {
      name: 'memory_store',
      description: 'Store a new memory in the long-term storage.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The content of the memory' },
          type: { type: 'string', enum: ['working', 'long_term', 'episodic'], description: 'Type of memory' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags for retrieval' },
          importance: { type: 'number', description: 'Importance score (1-10)' }
        },
        required: ['content']
      },
      execute: async (args) => {
        const id = await manager.storeMemory(
          args.content as string,
          (args.type as MemoryEntry['type']) ?? 'working',
          (args.tags as string[]) ?? [],
          (args.importance as number) ?? 1
        );
        return { status: 'stored', id };
      }
    },
    {
      name: 'memory_recall',
      description: 'Retrieve memories by semantic search or tags.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text to search for' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
          limit: { type: 'number', description: 'Max results' }
        }
      },
      execute: async (args) => {
        const results = await manager.recall({
          content: args.query as string | undefined,
          tags: args.tags as string[] | undefined,
          limit: (args.limit as number) ?? 5
        });
        return { status: 'found', count: results.length, results };
      }
    },
    {
      name: 'memory_forget',
      description: 'Remove a specific memory by ID.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The ID of the memory to remove' }
        },
        required: ['id']
      },
      execute: async (args) => {
        await manager.forget(args.id as string);
        return { status: 'removed', id: args.id };
      }
    },
    {
      name: 'memory_export',
      description: 'Export all memories for backup or transfer.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      },
      execute: async () => {
        const memories = await manager.export();
        return { status: 'exported', count: memories.length, memories };
      }
    },
    {
      name: 'memory_consolidate',
      description: 'Trigger memory optimization and cleanup.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      },
      execute: async () => {
        await manager.consolidate();
        return { status: 'consolidated' };
      }
    }
  ];
}
