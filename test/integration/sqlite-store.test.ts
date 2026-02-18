import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStore } from '../../src/memory/sqlite.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('SQLiteStore Integration', () => {
  const dbPath = path.join(__dirname, 'test-integration.db');

  beforeEach(() => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('should create and retrieve memories', async () => {
    const store = new SQLiteStore({ path: dbPath });
    await store.load();

    const id = await store.createMemory({
      content: 'test content',
      type: 'working',
      tags: ['tag1', 'tag2'],
      importance: 5,
      metadata: { source: 'test' }
    });

    expect(id).toBeDefined();

    const memories = await store.searchMemories!({ content: 'test' });
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe('test content');
    expect(memories[0].tags).toEqual(['tag1', 'tag2']);
    expect(memories[0].importance).toBe(5);
    expect(memories[0].metadata).toEqual({ source: 'test' });
  });

  it('should search memories by tag', async () => {
    const store = new SQLiteStore({ path: dbPath });
    await store.load();

    await store.createMemory({
      content: 'memory 1',
      type: 'working',
      tags: ['apple', 'fruit'],
      importance: 1
    });

    await store.createMemory({
      content: 'memory 2',
      type: 'working',
      tags: ['banana', 'fruit'],
      importance: 1
    });

    await store.createMemory({
      content: 'memory 3',
      type: 'working',
      tags: ['carrot', 'vegetable'],
      importance: 1
    });

    const results = await store.searchMemories!({ tags: ['fruit'] });
    expect(results).toHaveLength(2);
    expect(results.map(m => m.content)).toContain('memory 1');
    expect(results.map(m => m.content)).toContain('memory 2');
    expect(results.map(m => m.content)).not.toContain('memory 3');

    const appleResults = await store.searchMemories!({ tags: ['apple'] });
    expect(appleResults).toHaveLength(1);
    expect(appleResults[0].content).toBe('memory 1');

    // Test partial match behavior
    await store.createMemory({
      content: 'pineapple',
      type: 'working',
      tags: ['pineapple'],
      importance: 1
    });

    // "apple" matches "pineapple" with simple LIKE, but we fixed it
    const looseResults = await store.searchMemories!({ tags: ['apple'] });
    expect(looseResults).toHaveLength(1); // Should only match "apple", not "pineapple"
    expect(looseResults[0].content).toBe('memory 1');
  });

  it('should search memories by content', async () => {
    const store = new SQLiteStore({ path: dbPath });
    await store.load();

    await store.createMemory({ content: 'hello world', type: 'working' });
    await store.createMemory({ content: 'goodbye world', type: 'working' });

    const results = await store.searchMemories!({ content: 'hello' });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('hello world');
  });

  it('should remove memories', async () => {
    const store = new SQLiteStore({ path: dbPath });
    await store.load();

    const id = await store.createMemory({ content: 'to be deleted', type: 'working' });
    await store.removeMemory!(id);

    const results = await store.searchMemories!({ content: 'deleted' });
    expect(results).toHaveLength(0);
  });

  it('should export memories', async () => {
    const store = new SQLiteStore({ path: dbPath });
    await store.load();

    await store.createMemory({ content: 'mem1', type: 'working' });
    await store.createMemory({ content: 'mem2', type: 'working' });

    const exported = await store.exportMemories!();
    expect(exported).toHaveLength(2);
  });
});
