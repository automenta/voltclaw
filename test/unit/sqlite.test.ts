import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SQLiteStore } from '../../src/memory/sqlite.js';
import fs from 'fs';
import path from 'path';
import type { Session } from '../../src/core/types.js';

// Mock sqlite
vi.mock('sqlite', () => ({
  open: vi.fn().mockResolvedValue({
    exec: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockResolvedValue({
      run: vi.fn().mockResolvedValue(undefined),
      finalize: vi.fn().mockResolvedValue(undefined),
    }),
    run: vi.fn().mockResolvedValue(undefined),
    all: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) return Promise.resolve({ count: 1001 }); // Trigger consolidate
        if (sql.includes('memories')) return Promise.resolve([{ id: '1', content: 'test' }]);
        return Promise.resolve([]);
    }),
    get: vi.fn().mockResolvedValue({ count: 1001 }), // For consolidate count check
  }),
}));

vi.mock('sqlite3', () => ({
  default: {
    Database: vi.fn(),
  },
}));

describe('SQLiteStore', () => {
  const dbPath = path.join(process.cwd(), 'test-voltclaw.db');

  it('should load sessions', async () => {
    const store = new SQLiteStore({ path: dbPath });
    await store.load();
    const { open } = await import('sqlite');
    expect(open).toHaveBeenCalled();
  });

  it('should export memories', async () => {
    const store = new SQLiteStore({ path: dbPath });
    const memories = await store.exportMemories();
    expect(memories).toHaveLength(1);
    expect(memories[0].id).toBe('1');
  });

  it('should consolidate memories', async () => {
    const store = new SQLiteStore({ path: dbPath });
    await store.consolidateMemories();
    // Implementation details mocked, checking no crash
  });
});
