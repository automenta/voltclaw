
import { describe, it, expect } from 'vitest';
import { VoltClawAgent } from '../../src/core/agent.js';
import { createMockLLM } from '../../src/testing/mock-llm.js';

describe('VoltClawAgent Streaming', () => {
  it('should stream response content', async () => {
    const llm = createMockLLM({
      responses: {
        'hello': 'Hello world! How are you?'
      }
    });

    const agent = new VoltClawAgent({
      llm,
      channel: {
          type: 'memory',
          identity: { publicKey: 'test' },
          start: async () => {},
          stop: async () => {},
          send: async () => {},
          subscribe: () => () => {},
          on: () => {}
      },
      persistence: {
          get: () => ({ history: [], subTasks: {}, callCount: 0, estCostUSD: 0, actualTokensUsed: 0, depth: 0, topLevelStartedAt: 0 }),
          getAll: () => ({}),
          load: async () => {},
          save: async () => {},
          clear: () => {}
      }
    });

    const chunks: string[] = [];
    for await (const chunk of agent.queryStream('hello')) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toContain('Hello world! How are you?');
  });

  it('should handle tool calls during streaming', async () => {
    let step = 0;
    const llm = createMockLLM({
        handler: async (messages) => {
            if (step === 0) {
                step++;
                return {
                    content: '',
                    toolCalls: [{
                        id: 'call_1',
                        name: 'get_time',
                        arguments: {}
                    }]
                };
            } else {
                return { content: 'The time is 12:00.' };
            }
        }
    });

    const agent = new VoltClawAgent({
      llm,
      channel: { type: 'memory', identity: { publicKey: 'test' }, start: async () => {}, stop: async () => {}, send: async () => {}, subscribe: () => () => {}, on: () => {} },
      persistence: { get: () => ({ history: [], subTasks: {}, callCount: 0, estCostUSD: 0, actualTokensUsed: 0, depth: 0, topLevelStartedAt: 0 }), getAll: () => ({}), load: async () => {}, save: async () => {}, clear: () => {} },
      tools: [{
          name: 'get_time',
          description: 'Get time',
          execute: async () => ({ result: '12:00' })
      }]
    });

    const chunks: string[] = [];
    for await (const chunk of agent.queryStream('What time is it?')) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toContain('The time is 12:00.');
  });
});
