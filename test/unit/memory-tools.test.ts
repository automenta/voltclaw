import { describe, it, expect, vi } from 'vitest';
import { createMemoryTools } from '../../src/tools/memory.js';
import { MemoryManager } from '../../src/memory/manager.js';

describe('Memory Tools', () => {
  const mockStore = {
    createMemory: vi.fn().mockResolvedValue('mem-1'),
    searchMemories: vi.fn().mockResolvedValue([{ id: 'mem-1', content: 'test' }]),
    removeMemory: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    getAll: vi.fn(),
    load: vi.fn(),
    save: vi.fn(),
    clear: vi.fn()
  };

  const manager = new MemoryManager(mockStore);
  const tools = createMemoryTools(manager);
  const toolMap = new Map(tools.map(t => [t.name, t]));

  it('memory_store should call storeMemory', async () => {
    const tool = toolMap.get('memory_store')!;
    const result = await tool.execute({
      content: 'test content',
      type: 'episodic',
      tags: ['test'],
      importance: 5
    });

    expect(mockStore.createMemory).toHaveBeenCalledWith(expect.objectContaining({
      content: 'test content',
      type: 'episodic',
      importance: 5
    }));
    expect(result).toHaveProperty('status', 'stored');
    expect(result).toHaveProperty('id', 'mem-1');
  });

  it('memory_recall should call recall', async () => {
    const tool = toolMap.get('memory_recall')!;
    const result = await tool.execute({
      query: 'test',
      tags: ['tag1']
    });

    expect(mockStore.searchMemories).toHaveBeenCalledWith(expect.objectContaining({
      content: 'test',
      tags: ['tag1']
    }));
    expect(result).toHaveProperty('status', 'found');
    // @ts-ignore
    expect(result.results).toHaveLength(1);
  });

  it('memory_forget should call forget', async () => {
    const tool = toolMap.get('memory_forget')!;
    const result = await tool.execute({
      id: 'mem-1'
    });

    expect(mockStore.removeMemory).toHaveBeenCalledWith('mem-1');
    expect(result).toHaveProperty('status', 'removed');
  });
});
