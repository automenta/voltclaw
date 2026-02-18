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
      name: 'memory_stream',
      description: 'Stream memories sequentially, useful for processing large datasets chunked in memory.',
      parameters: {
        type: 'object',
        properties: {
          contextId: { type: 'string', description: 'Context ID to stream chunks from' },
          limit: { type: 'number', description: 'Batch size (default 10)' },
          offset: { type: 'number', description: 'Offset for pagination' }
        },
        required: ['contextId']
      },
      execute: async (args) => {
        // We use recall with specific filtering for streaming
        // Assuming memory manager supports contextId filtering via 'metadata' or 'tags' usually,
        // but our semantic chunking uses `contextId` field in DB.
        // We need to expose a way to query by contextId specifically in Manager/Store.
        // For now, let's assume `recall` can filter by metadata or we add a specific method.
        // Actually, `searchMemories` implementation in sqlite.ts assumes basic filters.
        // We can't easily filter by contextId via `recall` yet without modifying Store interface.

        // Workaround: Use tags if semantic chunking adds tags?
        // Manager adds `['rlm_context', 'session:ID']` tags but not unique context ID as tag.
        // It adds `contextId` column.

        // Let's rely on a broad search for now or update Manager.
        // For simplicity in this step, we'll skip efficient DB filtering and filter in memory if needed,
        // OR better: we implemented `contextId` column in sqlite.ts!
        // But `MemoryQuery` interface in types.ts doesn't expose it.
        // We should add it to MemoryQuery.

        return { error: 'Not implemented: Requires MemoryQuery update for contextId' };
      }
    },
    {
      name: 'memory_consolidate',
      description: 'Trigger memory optimization and cleanup. Summarizes recent working memories into long-term memory.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      },
      execute: async (_args, agent) => {
        // 1. Retrieve recent working memories
        const recentMemories = await manager.recall({ type: 'working', limit: 50 });

        // Cast agent to allow calling query (avoiding circular type import)
        const voltclaw = agent as any;

        if (recentMemories.length > 5 && voltclaw && typeof voltclaw.query === 'function') {
             const memoryContent = recentMemories.map(m => `- ${m.content} (importance: ${m.importance})`).join('\n');
             const prompt = `Consolidate these working memories into a single concise long-term memory summary. Focus on key facts and high importance items.\n\nMemories:\n${memoryContent}`;

             try {
                 // Use a specialized query or just standard query.
                 // Note: querying might trigger recursive calls or tools, which is fine but we want a direct answer.
                 const summary = await voltclaw.query(prompt);

                 // Store summary
                 await manager.storeMemory(
                     summary,
                     'long_term',
                     ['summary', 'consolidation'],
                     8 // High importance for summaries
                 );
             } catch (e) {
                 // Ignore LLM errors, proceed to pruning
                 console.error('Consolidation summary failed:', e);
             }
        }

        await manager.consolidate();
        return { status: 'consolidated', processed: recentMemories.length };
      }
    }
  ];
}
