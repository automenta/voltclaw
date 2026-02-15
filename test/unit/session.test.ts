import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sessionCommand } from '../../src/cli/commands/session.js';
import { FileStore } from '../../src/memory/index.js';

import { FileStore } from '../../src/memory/index.js';

// Mock dependencies
vi.mock('../../src/memory/index.js', () => {
  const mockSession = {
      history: [{ role: 'user', content: 'test msg' }],
      delegationCount: 0,
      estCostUSD: 0.001,
      actualTokensUsed: 10,
      subTasks: { 'task1': { task: 't' } }
  };

  return {
    FileStore: class {
      async load() { return Promise.resolve(); }
      async save() { return Promise.resolve(); }
      getAll() { return { 'session1': mockSession }; }
      get() { return mockSession; }
      clear() {}
      pruneAll() {}
    }
  };
});

describe('Session Command', () => {
  let consoleSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists sessions', async () => {
    await sessionCommand('list');

    // Check output contains session info
    const calls = consoleSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(calls).toContain('session1');
    expect(calls).toContain('1 messages');
    expect(calls).toContain('1 subtasks');
  });

  it('shows session details', async () => {
    await sessionCommand('show', 'session1');

    const calls = consoleSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(calls).toContain('[USER] test msg');
  });

  it('clears sessions', async () => {
    await sessionCommand('clear');

    expect(consoleSpy).toHaveBeenCalledWith('All sessions cleared.');
  });

  it('prunes sessions', async () => {
    await sessionCommand('prune');

    expect(consoleSpy).toHaveBeenCalledWith('Sessions pruned.');
  });

  it('handles unknown subcommand', async () => {
    await sessionCommand('unknown');

    expect(consoleErrorSpy).toHaveBeenCalledWith('Unknown subcommand: unknown');
  });
});
