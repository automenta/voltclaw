import { describe, it, expect, vi } from 'vitest';
import { VoltClawAgent } from '../../src/core/agent.js';
import { DeadLetterQueue } from '../../src/core/dlq.js';
import type { Tool } from '../../src/core/types.js';

describe('DeadLetterQueue', () => {
  it('should push and list failed operations', async () => {
    const dlq = new DeadLetterQueue();
    const error = new Error('test error');
    const id = await dlq.push('test-tool', { arg: 1 }, error);

    const list = await dlq.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id,
      tool: 'test-tool',
      args: { arg: 1 },
      error: 'test error'
    });
  });

  it('should remove operations', async () => {
    const dlq = new DeadLetterQueue();
    const id = await dlq.push('test', {}, new Error('e'));

    await dlq.remove(id);
    const list = await dlq.list();
    expect(list).toHaveLength(0);
  });
});

describe('VoltClawAgent DLQ Integration', () => {
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

  it('should push to DLQ when tool execution fails completely', async () => {
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

    // Check DLQ
    const dlqList = await agent.dlq.list();
    expect(dlqList).toHaveLength(1);
    expect(dlqList[0].tool).toBe('fail');
    expect(dlqList[0].error).toBe('always fails');
  });
});
