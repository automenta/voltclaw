import { describe, it, expect } from 'vitest';
import { VoltClawAgent } from '../../src/core/agent.js';
import { SelfTestFramework } from '../../src/core/self-test.js';
import type { LLMProvider, ChatMessage, ChatResponse, Tool } from '../../src/core/types.js';

describe('Self-Test Integration', () => {
  const mockLLM: LLMProvider = {
    name: 'mock',
    model: 'mock',
    chat: async (messages: ChatMessage[]): Promise<ChatResponse> => {
      const content = messages[messages.length - 1].content || '';
      if (content.includes('Generate a test plan')) {
        return {
          content: JSON.stringify({
            cases: [
              {
                id: 'test-1',
                description: 'Valid call',
                input: { task: 'hello' },
                expectedOutcome: 'success'
              },
              {
                id: 'test-2',
                description: 'Invalid call',
                input: {}, // missing task
                expectedOutcome: 'failure',
                expectedError: 'required'
              }
            ]
          })
        };
      }
      return { content: 'mock response' };
    }
  };

  const mockChannel = {
    type: 'memory',
    identity: { publicKey: 'test' },
    start: async () => {},
    stop: async () => {},
    send: async () => {},
    subscribe: () => () => {},
    on: () => {}
  };

  const mockStore = {
    type: 'memory',
    get: () => ({ history: [], subTasks: {}, callCount: 0, estCostUSD: 0, actualTokensUsed: 0, depth: 0, topLevelStartedAt: 0 }),
    getAll: () => ({}),
    load: async () => {},
    save: async () => {},
    clear: () => {}
  };

  const mockTool: Tool = {
      name: 'mock_tool',
      description: 'A mock tool',
      parameters: {
          type: 'object',
          properties: {
              task: { type: 'string' }
          },
          required: ['task']
      },
      execute: async (args: any) => {
          if (!args.task) throw new Error('task required');
          return { result: 'ok' };
      }
  };

  it('should generate and run tests', async () => {
    // Create an agent with a mock tool
    const agent = new VoltClawAgent({
      llm: { ...mockLLM } as any,
      channel: mockChannel as any,
      persistence: mockStore as any,
      tools: [mockTool]
    });

    const framework = new SelfTestFramework(agent);

    const plan = await framework.generateTests('mock_tool');
    expect(plan.cases).toHaveLength(2);
    expect(plan.cases[0].tool).toBe('mock_tool');

    const report = await framework.runTests(plan);
    expect(report.total).toBe(2);
    expect(report.passed).toBe(2);
    expect(report.failed).toBe(0);
    expect(report.results[0].passed).toBe(true);
    expect(report.results[1].passed).toBe(true);
  });
});
