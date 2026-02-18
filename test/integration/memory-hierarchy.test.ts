import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SQLiteStore } from '../../src/memory/sqlite.js';
import { MemoryManager } from '../../src/memory/manager.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Memory Hierarchy Integration', () => {
  const dbPath = path.join(__dirname, 'test-hierarchy.db');

  beforeEach(() => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('should store and retrieve memories with levels', async () => {
    const store = new SQLiteStore({ path: dbPath });
    const manager = new MemoryManager(store);
    await store.load();

    await manager.storeMemory('level 1 memory', 'working', [], 1, 1);
    await manager.storeMemory('level 2 memory', 'working', [], 1, 2);

    const level1 = await store.searchMemories!({ level: 1 });
    expect(level1).toHaveLength(1);
    expect(level1[0].content).toBe('level 1 memory');

    const level2 = await store.searchMemories!({ level: 2 });
    expect(level2).toHaveLength(1);
    expect(level2[0].content).toBe('level 2 memory');
  });

  it('should update lastAccess on recall', async () => {
    const store = new SQLiteStore({ path: dbPath });
    const manager = new MemoryManager(store);
    await store.load();

    const t0 = Date.now();
    vi.setSystemTime(t0);

    const id = await manager.storeMemory('test memory', 'working', [], 1, 1);

    // Advance time by 1 hour
    const t1 = t0 + 3600 * 1000;
    vi.setSystemTime(t1);

    await manager.recall('test');

    // Wait for async update (recall does not await the update promise)
    await new Promise(resolve => setTimeout(resolve, 100));

    const memories = await store.searchMemories!({ content: 'test' });
    expect(memories[0].lastAccess).toBe(t1);
  });

  it('should consolidate memories: demote Level 1 > 24h to Level 2', async () => {
    const store = new SQLiteStore({ path: dbPath });
    const manager = new MemoryManager(store);
    await store.load();

    const t0 = Date.now();
    vi.setSystemTime(t0);

    // Created at T0
    const id = await manager.storeMemory('old recent memory', 'working', [], 1, 1);

    // Advance time by 25 hours
    const t1 = t0 + 25 * 3600 * 1000;
    vi.setSystemTime(t1);

    await manager.consolidate();

    const memory = (await store.searchMemories!({ content: 'old recent' }))[0];
    expect(memory.level).toBe(2);
  });

  it('should consolidate memories: archive Level 2 > 7d unused to Level 4', async () => {
    const store = new SQLiteStore({ path: dbPath });
    const manager = new MemoryManager(store);
    await store.load();

    const t0 = Date.now();
    vi.setSystemTime(t0);

    // Level 2, importance 1 (low)
    const id = await manager.storeMemory('unused working memory', 'working', [], 1, 2);

    // Advance time by 8 days
    const t1 = t0 + 8 * 24 * 3600 * 1000;
    vi.setSystemTime(t1);

    await manager.consolidate();

    const memory = (await store.searchMemories!({ content: 'unused working' }))[0];
    expect(memory.level).toBe(4);
  });

  it('should NOT archive important Level 2 memories', async () => {
    const store = new SQLiteStore({ path: dbPath });
    const manager = new MemoryManager(store);
    await store.load();

    const t0 = Date.now();
    vi.setSystemTime(t0);

    // Level 2, importance 5 (high)
    const id = await manager.storeMemory('important working memory', 'working', [], 5, 2);

    // Advance time by 8 days
    const t1 = t0 + 8 * 24 * 3600 * 1000;
    vi.setSystemTime(t1);

    await manager.consolidate();

    const memory = (await store.searchMemories!({ content: 'important working' }))[0];
    expect(memory.level).toBe(2); // Should stay Level 2
  });

  it('should prune Level 4 memories > 90d', async () => {
    const store = new SQLiteStore({ path: dbPath });
    const manager = new MemoryManager(store);
    await store.load();

    const t0 = Date.now();
    vi.setSystemTime(t0);

    // Level 4
    const id = await manager.storeMemory('ancient memory', 'working', [], 1, 4);

    // Advance time by 91 days
    const t1 = t0 + 91 * 24 * 3600 * 1000;
    vi.setSystemTime(t1);

    await manager.consolidate();

    const memories = await store.searchMemories!({ content: 'ancient' });
    expect(memories).toHaveLength(0);
  });
});
