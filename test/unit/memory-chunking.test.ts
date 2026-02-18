import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryManager } from '../../src/memory/manager.js';
import type { Store, LLMProvider } from '../../src/core/types.js';

describe('MemoryManager Chunking', () => {
  let store: Store;
  let llm: LLMProvider;
  let manager: MemoryManager;

  beforeEach(() => {
    store = {
      createMemory: vi.fn().mockImplementation(async (entry) => {
          return entry.contextId || 'memory-id';
      }),
      searchMemories: vi.fn().mockResolvedValue([]),
      updateMemory: vi.fn(),
      get: vi.fn(),
      getAll: vi.fn(),
      load: vi.fn(),
      save: vi.fn(),
      clear: vi.fn(),
      // Add other methods to satisfy interface but we don't need them
      removeMemory: vi.fn(),
      exportMemories: vi.fn(),
      consolidateMemories: vi.fn(),
      addGraphNode: vi.fn(),
      addGraphEdge: vi.fn(),
      getGraphNode: vi.fn(),
      getGraphEdges: vi.fn(),
      searchGraphNodes: vi.fn(),
      getPromptTemplate: vi.fn(),
      savePromptTemplate: vi.fn(),
      getPromptVersion: vi.fn(),
      savePromptVersion: vi.fn(),
      listPromptTemplates: vi.fn(),
    };
    llm = {
      name: 'mock',
      model: 'mock',
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      chat: vi.fn(),
    };
    manager = new MemoryManager(store, llm);
  });

  it('should store short content as a single memory', async () => {
    const content = 'This is a short memory.';
    const id = await manager.storeMemory(content);

    expect(store.createMemory).toHaveBeenCalledTimes(1);
    expect(store.createMemory).toHaveBeenCalledWith(expect.objectContaining({
      content,
      embedding: [0.1, 0.2, 0.3]
    }));
    // Since we mocked createMemory to return contextId or memory-id
    // Here contextId is undefined, so 'memory-id'
    expect(id).toBe('memory-id');
  });

  it('should chunk long content into multiple memories', async () => {
    // create content longer than 1000 chars (default max chunk size)
    const content = 'A'.repeat(1500);
    // chunkText splits at 1000.
    // 0-1000
    // next start = 1000 - 100 = 900.
    // 900-1500 (600 chars).
    // Total 2 chunks.

    const id = await manager.storeMemory(content);

    expect(store.createMemory).toHaveBeenCalledTimes(2);

    // Check first call
    expect(store.createMemory).toHaveBeenNthCalledWith(1, expect.objectContaining({
      content: expect.stringMatching(/^A+$/),
      metadata: expect.objectContaining({
        chunkIndex: 0,
        totalChunks: 2
      })
    }));

    // Check contextId is same for both
    const call1 = vi.mocked(store.createMemory).mock.calls[0][0] as any;
    const call2 = vi.mocked(store.createMemory).mock.calls[1][0] as any;

    expect(call1.contextId).toBeDefined();
    expect(call1.contextId).toBe(call2.contextId);
    expect(id).toBe(call1.contextId);
  });

  it('should respect sentence boundaries when chunking', async () => {
    // 1000 chars is default max chunk.
    // construct text: 900 chars + ". " + 200 chars.
    // 1102 total.
    // Split should happen at ". ".

    const part1 = 'A'.repeat(900);
    const part2 = 'B'.repeat(200);
    const content = `${part1}. ${part2}`;

    await manager.storeMemory(content);

    expect(store.createMemory).toHaveBeenCalledTimes(2);

    const call1Args = vi.mocked(store.createMemory).mock.calls[0][0] as any;
    const call2Args = vi.mocked(store.createMemory).mock.calls[1][0] as any;

    // First chunk should end with ". "
    expect(call1Args.content).toBe(`${part1}. `);

    // Second chunk should overlap.
    // End index of chunk 1 was 902.
    // Next start = 902 - 100 = 802.
    // So chunk 2 should start at 802 (index in original string).
    // Original string char at 802 is 'A'.
    // It should contain remaining 'A's and then ". " and 'B's.

    expect(call2Args.content).toContain(part2);
    // Overlap verification:
    // 902 - 802 = 100 chars overlap.
    // part1 length 900. 802 to 900 is 98 chars. + ". " is 2 chars. Total 100 chars of part1 + punctuation.
    expect(call2Args.content.startsWith('A'.repeat(98))).toBe(true);
  });
});
