import { describe, it, expect, vi } from 'vitest';
import { VoltClawAgent } from '../../src/core/agent.js';
import type { Tool, Session } from '../../src/core/types.js';

describe('VoltClawAgent RBAC', () => {
  const adminTool: Tool = {
    name: 'admin_only',
    description: 'Admin only',
    execute: vi.fn().mockResolvedValue({ status: 'ok' }),
    requiredRoles: ['admin']
  };

  const userTool: Tool = {
    name: 'user_tool',
    description: 'User tool',
    execute: vi.fn().mockResolvedValue({ status: 'ok' }),
    requiredRoles: ['user']
  };

  const publicTool: Tool = {
    name: 'public_tool',
    description: 'Public tool',
    execute: vi.fn().mockResolvedValue({ status: 'ok' })
  };

  const mockLLM = {
    name: 'mock',
    model: 'mock',
    chat: vi.fn().mockResolvedValue({ content: 'response' })
  };

  const mockChannel = {
    type: 'memory',
    identity: { publicKey: 'agent-pubkey' },
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

  it('should allow admin to execute admin tool', async () => {
    const agent = new VoltClawAgent({
      llm: mockLLM,
      channel: mockChannel,
      persistence: mockStore,
      tools: [adminTool],
      permissions: {
        admins: ['admin-pubkey']
      }
    });

    // @ts-ignore
    const executeTool = (name: string, from: string) => agent.executeTool(name, {}, { depth: 0, subTasks: {} }, from);

    const result = await executeTool('admin_only', 'admin-pubkey');
    expect(result).toHaveProperty('status', 'ok');
  });

  it('should deny user from executing admin tool', async () => {
    const agent = new VoltClawAgent({
      llm: mockLLM,
      channel: mockChannel,
      persistence: mockStore,
      tools: [adminTool],
      permissions: {
        admins: ['admin-pubkey']
      }
    });

    // @ts-ignore
    const executeTool = (name: string, from: string) => agent.executeTool(name, {}, { depth: 0, subTasks: {} }, from);

    const result = await executeTool('admin_only', 'user-pubkey');
    expect(result).toHaveProperty('error');
    // Error message might be wrapped or just string
    expect(String(result.error)).toContain('not authorized');
  });

  it('should allow user to execute user tool', async () => {
    const agent = new VoltClawAgent({
      llm: mockLLM,
      channel: mockChannel,
      persistence: mockStore,
      tools: [userTool],
      permissions: {
        admins: ['admin-pubkey']
      }
    });

    // @ts-ignore
    const executeTool = (name: string, from: string) => agent.executeTool(name, {}, { depth: 0, subTasks: {} }, from);

    // Default role is user
    const result = await executeTool('user_tool', 'user-pubkey');
    expect(result).toHaveProperty('status', 'ok');
  });

  it('should allow self to execute anything', async () => {
    const agent = new VoltClawAgent({
      llm: mockLLM,
      channel: mockChannel,
      persistence: mockStore,
      tools: [adminTool]
    });

    // @ts-ignore
    const executeTool = (name: string, from: string) => agent.executeTool(name, {}, { depth: 0, subTasks: {} }, from);

    // Self (agent-pubkey) is admin
    const result = await executeTool('admin_only', 'agent-pubkey');
    expect(result).toHaveProperty('status', 'ok');
  });

  it('should deny all if policy is deny_all and no roles specified', async () => {
    const agent = new VoltClawAgent({
      llm: mockLLM,
      channel: mockChannel,
      persistence: mockStore,
      tools: [publicTool],
      permissions: {
        policy: 'deny_all'
      }
    });

    // @ts-ignore
    const executeTool = (name: string, from: string) => agent.executeTool(name, {}, { depth: 0, subTasks: {} }, from);

    const result = await executeTool('public_tool', 'some-user');
    expect(result).toHaveProperty('error');
    expect(String(result.error)).toContain('not authorized');
  });
});
