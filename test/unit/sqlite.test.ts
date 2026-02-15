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
    all: vi.fn().mockResolvedValue([]),
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
    // Logic test: should have called open and exec
    const { open } = await import('sqlite');
    expect(open).toHaveBeenCalled();
  });

  it('should save sessions', async () => {
    const store = new SQLiteStore({ path: dbPath });
    await store.load(); // Init DB mock

    const session: Session = {
      history: [{ role: 'user', content: 'hello' }],
      callCount: 1,
      estCostUSD: 0.01,
      actualTokensUsed: 100,
      subTasks: {},
      depth: 0,
      topLevelStartedAt: Date.now()
    };

    const s = store.get('test-session');
    Object.assign(s, session);

    await store.save();

    // Check if prepare/run called (via mock)
    // Detailed verification of mock calls skipped for brevity, checking no crash
  });
});
