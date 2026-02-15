import { describe, it, expect, vi } from 'vitest';
import { VoltClawAgent } from '../../src/core/agent.js';
import type { AuditLog } from '../../src/core/audit.js';

// Mock sqlite to avoid native binding errors during tests
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

describe('Agent Audit Integration', () => {
  const mockAuditLog: AuditLog = {
    log: vi.fn().mockResolvedValue(undefined),
    verify: vi.fn().mockResolvedValue(true)
  };

  // Mock dependencies
  const mockLLM = {
    name: 'mock',
    model: 'mock',
    chat: vi.fn().mockResolvedValue({ content: 'response' })
  };

  const mockChannel = {
    type: 'memory',
    identity: { publicKey: 'test-agent' },
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

  const mockTool = {
    name: 'test_tool',
    description: 'test',
    execute: vi.fn().mockResolvedValue({ result: 'ok' })
  };

  it('should log start and stop', async () => {
    // We can't easily mock the internal creation of FileAuditLog without module mocking
    // So we'll use a real agent with a temporary path and check calls via spy if we could,
    // or just checking if it doesn't crash.
    // For unit testing here, let's cast agent to any to inject our mock audit log

    const agent = new VoltClawAgent({
      llm: mockLLM,
      channel: mockChannel,
      persistence: mockStore,
      tools: [mockTool]
    });

    // Inject mock audit log
    (agent as any).auditLog = mockAuditLog;

    await agent.start();
    expect(mockAuditLog.log).toHaveBeenCalledWith('system', 'start', {});

    await agent.stop();
    expect(mockAuditLog.log).toHaveBeenCalledWith('system', 'stop', {});
  });

  it('should log tool execution', async () => {
    const agent = new VoltClawAgent({
      llm: mockLLM,
      channel: mockChannel,
      persistence: mockStore,
      tools: [mockTool]
    });
    (agent as any).auditLog = mockAuditLog;

    // @ts-ignore calling private/protected method for test
    await agent.executeTool('test_tool', { foo: 'bar' }, { depth: 0, subTasks: {} }, 'user1');

    expect(mockAuditLog.log).toHaveBeenCalledWith('user1', 'tool_execute', { tool: 'test_tool', args: { foo: 'bar' } });
    expect(mockAuditLog.log).toHaveBeenCalledWith('user1', 'tool_result', { tool: 'test_tool', result: { result: 'ok' } });
  });
});
