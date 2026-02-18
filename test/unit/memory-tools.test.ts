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
    clear: vi.fn(),
    consolidateMemories: vi.fn().mockResolvedValue(undefined)
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

  it('memory_consolidate should summarize if enough memories exist', async () => {
    // Override searchMemories to return multiple items
    const manyMemories = Array.from({ length: 10 }, (_, i) => ({
      id: `mem-${i}`,
      content: `memory ${i}`,
      type: 'working',
      importance: 5,
      timestamp: Date.now()
    }));

    mockStore.searchMemories = vi.fn().mockResolvedValue(manyMemories);

    const tool = toolMap.get('memory_consolidate')!;

    const mockAgent = {
      query: vi.fn().mockResolvedValue('Summary of memories')
    };

    const result = await tool.execute({}, mockAgent as any, {} as any, 'user');

    expect(mockAgent.query).toHaveBeenCalled();
    expect(mockStore.createMemory).toHaveBeenCalledWith(expect.objectContaining({
      content: 'Summary of memories',
      type: 'long_term',
      tags: ['summary', 'consolidation']
    }));
    // @ts-ignore
    expect(result.processed).toBe(10);
  });
});
