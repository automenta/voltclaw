import { describe, it, expect, vi } from 'vitest';
import { VoltClawAgent } from '../../src/core/agent.js';
import { ErrorQueue } from '../../src/core/error-queue.js';
import type { Tool } from '../../src/core/types.js';

describe('ErrorQueue', () => {
  it('should push and list failed operations', async () => {
    const queue = new ErrorQueue();
    const error = new Error('test error');
    const id = await queue.push('test-tool', { arg: 1 }, error);

    const list = await queue.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id,
      tool: 'test-tool',
      args: { arg: 1 },
      error: 'test error'
    });
  });

  it('should remove operations', async () => {
    const queue = new ErrorQueue();
    const id = await queue.push('test', {}, new Error('e'));

    await queue.remove(id);
    const list = await queue.list();
    expect(list).toHaveLength(0);
  });
});

describe('VoltClawAgent ErrorQueue Integration', () => {
  // Mock dependencies
  const mockLLM = {
    name: 'mock',
    model: 'mock',
    chat: vi.fn().mockResolvedValue({ content: 'response' })
  };

  const mockChannel = {
    type: 'memory',
    identity: { publicKey: 'test' },
    start: vi.fn(),
    stop: vi.fn(),
    send: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
    on: vi.fn()
  };

  const mockStore = {
    get: vi.fn().mockReturnValue({ history: [], subTasks: {} }),
    getAll: vi.fn().mockReturnValue({}),
    load: vi.fn(),
    save: vi.fn(),
    clear: vi.fn()
  };

  const failingTool: Tool = {
    name: 'fail',
    description: 'Fails always',
    execute: vi.fn().mockRejectedValue(new Error('always fails')),
    maxDepth: 10
  };

  it('should push to ErrorQueue when tool execution fails completely', async () => {
    const agent = new VoltClawAgent({
      llm: mockLLM,
      channel: mockChannel,
      persistence: mockStore,
      tools: [failingTool],
      circuitBreaker: { failureThreshold: 1, resetTimeoutMs: 1000 },
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterFactor: 0 }
    });

    // @ts-ignore
    const executeTool = (name: string) => agent.executeTool(name, {}, { depth: 0, subTasks: {} }, 'test');

    // Execute tool, it should fail
    const result = await executeTool('fail');
    expect(result).toHaveProperty('error', 'always fails');

    // Check ErrorQueue
    const list = await agent.errors.list();
    expect(list).toHaveLength(1);
    expect(list[0].tool).toBe('fail');
    expect(list[0].error).toBe('always fails');
  });
});
