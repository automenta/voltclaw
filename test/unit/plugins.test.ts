import { describe, it, expect, vi } from 'vitest';
import { VoltClawAgent } from '../../src/core/agent.js';
import { createMockLLM } from '../../src/testing/mock-llm.js';
import type { VoltClawPlugin } from '../../src/core/plugin.js';
import type { Tool } from '../../src/core/types.js';

describe('VoltClawAgent Plugins', () => {
  it('should register tools from plugin', async () => {
    const mockTool: Tool = {
      name: 'plugin_tool',
      description: 'A tool from a plugin',
      execute: async () => ({ result: 'plugin tool executed' })
    };

    const plugin: VoltClawPlugin = {
      name: 'test-plugin',
      version: '1.0.0',
      tools: [mockTool]
    };

    const agent = new VoltClawAgent({
      llm: createMockLLM(),
      channel: { type: 'memory', identity: { publicKey: 'test' }, start: async () => {}, stop: async () => {}, send: async () => {}, subscribe: () => () => {}, on: () => {} },
      persistence: { get: () => ({ history: [], subTasks: {}, callCount: 0, estCostUSD: 0, actualTokensUsed: 0, depth: 0, topLevelStartedAt: 0 }), getAll: () => ({}), load: async () => {}, save: async () => {}, clear: () => {} },
      plugins: [plugin]
    });

    // We can't easily access private tools map, but we can try to query it or check if it's used
    // Let's use `query` with a tool call to verify it works
    const llm = createMockLLM({
        handler: async (messages) => {
            const last = messages[messages.length - 1];
            if (last.role === 'user') {
                return {
                    content: '',
                    toolCalls: [{
                        id: 'call_1',
                        name: 'plugin_tool',
                        arguments: {}
                    }]
                };
            }
            if (last.role === 'tool') {
                return { content: `Tool output: ${last.content}` };
            }
            return { content: 'done' };
        }
    });

    const agentWithMock = new VoltClawAgent({
      llm,
      channel: { type: 'memory', identity: { publicKey: 'test' }, start: async () => {}, stop: async () => {}, send: async () => {}, subscribe: () => () => {}, on: () => {} },
      persistence: { get: () => ({ history: [], subTasks: {}, callCount: 0, estCostUSD: 0, actualTokensUsed: 0, depth: 0, topLevelStartedAt: 0 }), getAll: () => ({}), load: async () => {}, save: async () => {}, clear: () => {} },
      plugins: [plugin]
    });

    const response = await agentWithMock.query('Run plugin tool');
    expect(response).toContain('plugin tool executed');
  });

  it('should call lifecycle hooks', async () => {
    const initSpy = vi.fn();
    const startSpy = vi.fn();
    const stopSpy = vi.fn();

    const plugin: VoltClawPlugin = {
      name: 'lifecycle-plugin',
      version: '1.0.0',
      init: initSpy,
      start: startSpy,
      stop: stopSpy
    };

    const agent = new VoltClawAgent({
      llm: createMockLLM(),
      channel: { type: 'memory', identity: { publicKey: 'test' }, start: async () => {}, stop: async () => {}, send: async () => {}, subscribe: () => () => {}, on: () => {} },
      persistence: { get: () => ({ history: [], subTasks: {}, callCount: 0, estCostUSD: 0, actualTokensUsed: 0, depth: 0, topLevelStartedAt: 0 }), getAll: () => ({}), load: async () => {}, save: async () => {}, clear: () => {} },
      plugins: [plugin]
    });

    await agent.start();
    expect(initSpy).toHaveBeenCalled();
    expect(startSpy).toHaveBeenCalled();

    await agent.stop();
    expect(stopSpy).toHaveBeenCalled();
  });
});
