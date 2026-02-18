import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryManager } from '../../src/memory/manager.js';
import type { LLMProvider, Store, MemoryEntry } from '../../src/core/types.js';

describe('MemoryManager with Embeddings', () => {
  const mockStore = {
    createMemory: vi.fn().mockResolvedValue('mem-1'),
    searchMemories: vi.fn().mockResolvedValue([{ id: 'mem-1', content: 'test', embedding: [1, 0] }]),
    get: vi.fn(),
    getAll: vi.fn(),
    load: vi.fn(),
    save: vi.fn(),
    clear: vi.fn()
  } as unknown as Store;

  const mockLLM = {
    name: 'mock',
    model: 'mock-model',
    embed: vi.fn().mockResolvedValue([1, 0, 0]),
    chat: vi.fn()
  } as unknown as LLMProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset implementations if needed, but resolved values are fine to stay
  });

  it('should generate embedding when storing memory', async () => {
    const manager = new MemoryManager(mockStore, mockLLM);
    await manager.storeMemory('test content');

    expect(mockLLM.embed).toHaveBeenCalledWith('test content');
    expect(mockStore.createMemory).toHaveBeenCalledWith(expect.objectContaining({
      content: 'test content',
      embedding: [1, 0, 0]
    }));
  });

  it('should generate embedding when recalling with query string', async () => {
    const manager = new MemoryManager(mockStore, mockLLM);
    await manager.recall('test query');

    expect(mockLLM.embed).toHaveBeenCalledWith('test query');
    expect(mockStore.searchMemories).toHaveBeenCalledWith(expect.objectContaining({
      content: 'test query',
      embedding: [1, 0, 0]
    }));
  });

  it('should fallback gracefully if embedding fails', async () => {
    const errorLLM = {
      ...mockLLM,
      embed: vi.fn().mockRejectedValue(new Error('Embedding failed'))
    };
    const manager = new MemoryManager(mockStore, errorLLM);

    // Store
    await manager.storeMemory('test');
    expect(mockStore.createMemory).toHaveBeenCalledWith(expect.objectContaining({
      content: 'test',
      embedding: undefined
    }));

    // Recall
    await manager.recall('query');
    expect(mockStore.searchMemories).toHaveBeenCalledWith(expect.objectContaining({
      content: 'query'
    }));

    // Check that embedding is missing or undefined
    const callArgs = vi.mocked(mockStore.searchMemories).mock.calls[0][0];
    expect(callArgs.embedding).toBeUndefined();
  });
});
