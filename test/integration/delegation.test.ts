import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestHarness, MockLLM } from '../../src/testing/index.js';

describe('Delegation Integration', () => {
  let harness: TestHarness;

  afterEach(async () => {
    await harness?.stop();
  });

  it('delegates task and returns result', async () => {
    harness = new TestHarness({
      llm: new MockLLM({
        handler: async (messages) => {
            const last = messages[messages.length - 1];
            const content = last.content || '';

            if (content.includes('Analyze the request')) {
                 return {
                    content: 'I will delegate this task.',
                    toolCalls: [
                        {
                            id: 'call_1',
                            name: 'delegate',
                            arguments: { task: 'Calculate 2+2', summary: 'Math task' }
                        }
                    ]
                };
            }

            // Subtask handling
            if (content === 'Begin.') {
                const system = messages.find(m => m.role === 'system');
                if (system && system.content?.includes('Calculate 2+2')) {
                    return 'The result is 4.';
                }
            }

            if (content.includes('Synthesize')) {
                return 'Final answer is 4.';
            }

            if (content.includes('"result":"The result is 4."')) {
                return 'Final answer is 4.';
            }

            return 'Mock response';
        }
      })
    });

    await harness.start();

    // Trigger delegation
    const response = await harness.agent.query('Analyze the request');

    // The response should be the final synthesized answer
    expect(response).toContain('Final answer is 4');

    // Check if delegation occurred
    const session = harness.agent['store'].get('self', true);
    expect(session.delegationCount).toBe(1);

    // Verify subtask result
    const subtasks = Object.values(session.subTasks);
    expect(subtasks.length).toBe(1);
    expect(subtasks[0].result).toBe('The result is 4.');
    expect(subtasks[0].arrived).toBe(true);
  });

  it('handles delegation timeout', async () => {
    harness = new TestHarness({
      delegation: { timeoutMs: 100 }, // Short timeout
      llm: new MockLLM({
        handler: async (messages) => {
            const last = messages[messages.length - 1];
            const content = last.content || '';

            if (content.includes('Task to timeout')) {
                return {
                    content: 'Delegating...',
                    toolCalls: [{
                        id: 'call_2',
                        name: 'delegate',
                        arguments: { task: 'Slow task' }
                    }]
                };
            }

            if (content === 'Begin.') {
                // Simulate slow subtask
                await new Promise(r => setTimeout(r, 200));
                return 'Too late';
            }

            // If the agent receives a timeout error from the tool, it might try to apologize or something
            // We just return something simple
            return 'I timed out.';
        }
      })
    });

    await harness.start();

    const response = await harness.agent.query('Task to timeout');

    const session = harness.agent['store'].get('self', true);
    const subtasks = Object.values(session.subTasks);

    expect(subtasks.length).toBe(1);
    // Wait for a bit to ensure timeout callback ran if race condition exists
    await new Promise(r => setTimeout(r, 50));

    expect(subtasks[0].error).toBeDefined();
    expect(subtasks[0].error).toContain('Timeout');
  });
});
