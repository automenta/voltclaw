import { describe, it, expect, vi } from 'vitest';
import { MemoryManager } from '../../src/memory/manager.js';
import { VoltClawAgent } from '../../src/core/agent.js';

describe('MemoryManager', () => {
  it('should store and recall memories', async () => {
    const mockStore = {
      createMemory: vi.fn().mockResolvedValue('mem-1'),
      searchMemories: vi.fn().mockResolvedValue([{ id: 'mem-1', content: 'test' }]),
      get: vi.fn(),
      getAll: vi.fn(),
      load: vi.fn(),
      save: vi.fn(),
      clear: vi.fn()
    };

    const memory = new MemoryManager(mockStore);
    await memory.storeMemory('test content');

    expect(mockStore.createMemory).toHaveBeenCalledWith(expect.objectContaining({
      content: 'test content',
      type: 'working'
    }));

    const results = await memory.recall('test');
    expect(mockStore.searchMemories).toHaveBeenCalled();
    expect(results).toHaveLength(1);
  });

  it('should handle stores without memory capability', async () => {
    const simpleStore = {
      get: vi.fn(),
      getAll: vi.fn(),
      load: vi.fn(),
      save: vi.fn(),
      clear: vi.fn()
    };

    const memory = new MemoryManager(simpleStore);

    await expect(memory.storeMemory('fail')).rejects.toThrow('Store does not support memory operations');

    const results = await memory.recall('fail');
    expect(results).toEqual([]);
  });
});
