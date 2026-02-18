import { describe, it, expect, vi } from 'vitest';
import { codeExecTool } from '../../src/tools/code_exec.js';

describe('code_exec tool', () => {
  it('should execute javascript code', async () => {
    const args = { code: '1 + 1' };
    const agent = {
      executeTool: vi.fn(),
      memory: {
        storeMemory: vi.fn()
      }
    };
    const session = {};

    const result = await codeExecTool.execute(args, agent, session);
    expect(result).toEqual({
      output: 2,
      sessionId: 'default',
      contextSize: expect.any(Number)
    });
  });

  it('should maintain state across calls with same sessionId', async () => {
    const agent = {
      executeTool: vi.fn(),
      memory: {
        storeMemory: vi.fn()
      }
    };
    const session = {};
    const sessionId = 'test-session';

    // First call
    await codeExecTool.execute({
      code: 'var x = 10;',
      sessionId
    }, agent, session);

    // Second call
    const result = await codeExecTool.execute({
      code: 'x + 5',
      sessionId
    }, agent, session);

    expect(result).toEqual({
      output: 15,
      sessionId,
      contextSize: expect.any(Number)
    });
  });

  it('should pass context as string when small', async () => {
    const agent = {
      executeTool: vi.fn().mockImplementation((name, args) => {
          if (name === 'call') return { status: 'called', args };
          return {};
      }),
      memory: {
        storeMemory: vi.fn().mockResolvedValue('memory-id')
      }
    };
    const session = {};
    const sessionId = 'rlm-session-small';

    // Setup context
    await codeExecTool.execute({
      code: 'var data = { a: 1, b: 2 };',
      sessionId
    }, agent, session);

    // Call rlm_call
    const result = await codeExecTool.execute({
      code: `(async () => await rlm_call('subtask', ['data']))()`,
      sessionId
    }, agent, session);

    expect(result.output).toEqual({
        status: 'called',
        args: {
            task: 'subtask',
            summary: 'Context: {"data":{"a":1,"b":2}}'
        }
    });

    expect(agent.memory.storeMemory).not.toHaveBeenCalled();
  });

  it('should offload context to memory when large', async () => {
    const agent = {
      executeTool: vi.fn().mockImplementation((name, args) => {
          if (name === 'call') return { status: 'called', args };
          return {};
      }),
      memory: {
        storeMemory: vi.fn().mockResolvedValue('test-memory-id')
      }
    };
    const session = {};
    const sessionId = 'rlm-session-large';

    // Setup large context > 2000 chars
    const largeString = 'A'.repeat(2500);
    await codeExecTool.execute({
      code: `var largeData = { text: "${largeString}" };`,
      sessionId
    }, agent, session);

    // Call rlm_call
    const result = await codeExecTool.execute({
      code: `(async () => await rlm_call('subtask', ['largeData']))()`,
      sessionId
    }, agent, session);

    expect(agent.memory.storeMemory).toHaveBeenCalledWith(
        expect.stringContaining(largeString),
        'working',
        ['rlm_context', `session:${sessionId}`],
        10
    );

    expect(result.output).toEqual({
        status: 'called',
        args: {
            task: 'subtask',
            summary: "RLM Context stored in memory. Use memory_recall(id='test-memory-id') to retrieve it."
        }
    });
  });
});
