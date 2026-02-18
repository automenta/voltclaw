import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryManager } from '../../src/memory/manager.js';
import { MemoryLevel } from '../../src/core/types.js';
import type { Store } from '../../src/core/types.js';

describe('Memory Hierarchy', () => {
  const mockStore = {
    createMemory: vi.fn().mockResolvedValue('mem-1'),
    searchMemories: vi.fn().mockResolvedValue([]),
    updateMemoryLevel: vi.fn().mockResolvedValue(undefined),
    consolidateMemories: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    getAll: vi.fn(),
    load: vi.fn(),
    save: vi.fn(),
    clear: vi.fn()
  } as unknown as Store;

  const manager = new MemoryManager(mockStore);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should store memory with default level (Working)', async () => {
    await manager.storeMemory('test content');

    expect(mockStore.createMemory).toHaveBeenCalledWith(expect.objectContaining({
      content: 'test content',
      level: MemoryLevel.Working
    }));
  });

  it('should promote memory (decrease level index)', async () => {
    mockStore.searchMemories = vi.fn().mockResolvedValue([
      { id: 'mem-1', content: 'test', level: MemoryLevel.Working } // 2
    ]);

    await manager.promote('mem-1');

    expect(mockStore.updateMemoryLevel).toHaveBeenCalledWith('mem-1', MemoryLevel.Recent); // 1
  });

  it('should demote memory (increase level index)', async () => {
    mockStore.searchMemories = vi.fn().mockResolvedValue([
      { id: 'mem-1', content: 'test', level: MemoryLevel.Working } // 2
    ]);

    await manager.demote('mem-1');

    expect(mockStore.updateMemoryLevel).toHaveBeenCalledWith('mem-1', MemoryLevel.LongTerm); // 3
  });

  it('should not promote if already Active', async () => {
    mockStore.searchMemories = vi.fn().mockResolvedValue([
      { id: 'mem-1', content: 'test', level: MemoryLevel.Active } // 0
    ]);

    await manager.promote('mem-1');

    expect(mockStore.updateMemoryLevel).not.toHaveBeenCalled();
  });

  it('should not demote if already Archived', async () => {
    mockStore.searchMemories = vi.fn().mockResolvedValue([
      { id: 'mem-1', content: 'test', level: MemoryLevel.Archived } // 4
    ]);

    await manager.demote('mem-1');

    expect(mockStore.updateMemoryLevel).not.toHaveBeenCalled();
  });

  it('should consolidate based on age and importance', async () => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    const recentMemories = [
      { id: 'recent-old', content: 'old recent', level: MemoryLevel.Recent, timestamp: now - 2 * oneDay }
    ];

    const workingMemories = [
      { id: 'working-unimportant-old', content: 'meh', level: MemoryLevel.Working, timestamp: now - 8 * oneDay, importance: 1 }
    ];

    mockStore.searchMemories = vi.fn().mockImplementation(async (q) => {
        if (q.level === MemoryLevel.Recent) return recentMemories;
        if (q.level === MemoryLevel.Working) return workingMemories;
        return [];
    });

    await manager.consolidate();

    // recent-old -> Working (demoted due to age)
    expect(mockStore.updateMemoryLevel).toHaveBeenCalledWith('recent-old', MemoryLevel.Working);

    // working-unimportant-old -> Archived (demoted due to age + low importance)
    expect(mockStore.updateMemoryLevel).toHaveBeenCalledWith('working-unimportant-old', MemoryLevel.Archived);

    expect(mockStore.consolidateMemories).toHaveBeenCalled();
  });
});
