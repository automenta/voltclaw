import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoltClawAgent } from '../../src/core/agent.js';
import type { Tool, ToolCallResult, Session } from '../../src/core/types.js';

describe('VoltClawAgent Fallbacks', () => {
  const primaryTool = {
    name: 'primary',
    description: 'Primary tool',
    execute: vi.fn(),
    maxDepth: 10
  };

  const backupTool = {
    name: 'backup',
    description: 'Backup tool',
    execute: vi.fn(),
    maxDepth: 10
  };

  // Mock LLM
  const mockLLM = {
    name: 'mock',
    model: 'mock',
    chat: vi.fn().mockResolvedValue({ content: 'response' })
  };

  // Mock channel
  const mockChannel = {
    type: 'memory',
    identity: { publicKey: 'test' },
    start: vi.fn(),
    stop: vi.fn(),
    send: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
    on: vi.fn()
  };

  // Mock store
  const mockStore = {
    get: vi.fn().mockReturnValue({
      history: [],
      subTasks: {},
      callCount: 0,
      estCostUSD: 0,
      actualTokensUsed: 0,
      topLevelStartedAt: 0,
      depth: 0
    }),
    getAll: vi.fn().mockReturnValue({}),
    load: vi.fn(),
    save: vi.fn(),
    clear: vi.fn()
  };

  it('should use fallback when circuit is open', async () => {
    // Reset mocks
    primaryTool.execute.mockReset();
    backupTool.execute.mockReset();

    primaryTool.execute.mockRejectedValue(new Error('primary failed'));
    backupTool.execute.mockResolvedValue({ status: 'success', source: 'backup' });

    const agent = new VoltClawAgent({
      llm: mockLLM,
      channel: mockChannel,
      persistence: mockStore,
      tools: [primaryTool, backupTool],
      circuitBreaker: {
        failureThreshold: 1,
        resetTimeoutMs: 1000
      },
      retry: {
        maxAttempts: 1, // Fail immediately
        baseDelayMs: 0,
        maxDelayMs: 0
      },
      fallbacks: {
        'primary': 'backup'
      }
    });

    // Access private executeTool method for unit testing
    // @ts-ignore
    const executeTool = (name: string) => agent.executeTool(name, {}, { depth: 0, subTasks: {}, history: [], callCount: 0, estCostUSD: 0, actualTokensUsed: 0, topLevelStartedAt: 0 }, 'test');

    // 1. First call fails and opens the circuit
    const result1 = await executeTool('primary');
    expect(result1).toHaveProperty('error', 'primary failed');

    // 2. Second call should trigger fallback because circuit is now OPEN
    // Wait slightly to ensure failure count is processed (sync, so fine)
    const result2 = await executeTool('primary');

    // The fallback logic:
    // CircuitBreaker sees state=OPEN.
    // Checks if fallback function provided. Yes (executeTool('backup')).
    // Calls fallback.
    // Fallback succeeds.

    expect(result2).toHaveProperty('source', 'backup');
    // Note: primaryTool.execute is called once (failed), then second time circuit is open so not called.
    expect(primaryTool.execute).toHaveBeenCalledTimes(1);
    expect(backupTool.execute).toHaveBeenCalledTimes(1);
  });
});
