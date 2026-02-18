import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryTools } from '../../src/tools/memory.js';
import type { MemoryManager } from '../../src/memory/manager.js';

describe('Memory Tools', () => {
  let manager: MemoryManager;
  let tools: any[];

  beforeEach(() => {
    manager = {
      storeMemory: vi.fn(),
      recall: vi.fn(),
      forget: vi.fn(),
      export: vi.fn(),
      consolidate: vi.fn()
    } as any;
    tools = createMemoryTools(manager);
  });

  it('memory_store tool should call manager.storeMemory', async () => {
    const tool = tools.find(t => t.name === 'memory_store');
    expect(tool).toBeDefined();

    vi.mocked(manager.storeMemory).mockResolvedValue('mem-1');

    const result = await tool.execute({
      content: 'test content',
      type: 'working',
      tags: ['tag1'],
      importance: 5
    });

    expect(manager.storeMemory).toHaveBeenCalledWith(
      'test content',
      'working',
      ['tag1'],
      5
    );
    expect(result).toEqual({ status: 'stored', id: 'mem-1' });
  });

  it('memory_recall tool should call manager.recall', async () => {
    const tool = tools.find(t => t.name === 'memory_recall');
    vi.mocked(manager.recall).mockResolvedValue([{ id: '1', content: 'c' } as any]);

    const result = await tool.execute({
      query: 'search',
      limit: 10
    });

    expect(manager.recall).toHaveBeenCalledWith({
      content: 'search',
      tags: undefined,
      limit: 10
    });
    expect(result.count).toBe(1);
  });

  it('memory_stream tool should call manager.recall with offset and contextId', async () => {
    const tool = tools.find(t => t.name === 'memory_stream');
    expect(tool).toBeDefined();

    const mockMemories = [
        { id: '1', content: 'chunk1', metadata: { chunkIndex: 0 } },
        { id: '2', content: 'chunk2', metadata: { chunkIndex: 1 } }
    ];
    vi.mocked(manager.recall).mockResolvedValue(mockMemories as any);

    const result = await tool.execute({
      contextId: 'ctx-123',
      limit: 5,
      offset: 10
    });

    expect(manager.recall).toHaveBeenCalledWith({
      contextId: 'ctx-123',
      limit: 5,
      offset: 10
    });

    expect(result).toEqual({
        status: 'streamed',
        count: 2,
        contextId: 'ctx-123',
        offset: 10,
        memories: mockMemories
    });
  });
});
