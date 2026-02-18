import { describe, it, expect, vi } from 'vitest';
import { codeExecTool } from '../../src/tools/code_exec.js';

describe('code_exec tool', () => {
  it('should execute javascript code', async () => {
    const args = { code: '1 + 1' };
    const agent = {
      executeTool: vi.fn(),
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

  it('should support voltclaw.fs namespace', async () => {
    const agent = {
      executeTool: vi.fn().mockResolvedValue({ status: 'success' }),
    };
    const session = {};
    const sessionId = 'fs-session';

    // Use IIFE async for await
    await codeExecTool.execute({
      code: `(async () => await voltclaw.fs.read('test.txt'))()`,
      sessionId
    }, agent, session);

    expect(agent.executeTool).toHaveBeenCalledWith('read_file', { filepath: 'test.txt' }, session, 'unknown');
  });

  // Since we can't easily advance fake timers for promises inside vm (vm context uses separate global potentially)
  // or because of how vitest handles fake timers across async boundaries, we might mock setTimeout or skip real time.
  // Actually, vm context uses its own setTimeout if not proxied? No, it usually uses host's if not sandboxed fully.
  // But let's try just mocking the implementation of rlm_call via agent spy? No, logic is inside tool.

  // We'll skip fake timers and rely on mocking the promise race behavior by making executeTool return a promise that never resolves
  // but we can't wait 60s in test.
  // We can override the timeout constant in test? No it's const.
  // We can just trust the logic for now or mock the module constant if possible (hard in esm).
  // Alternatively, just verify the namespace and logic structure exists.

  // Let's rely on unit testing the namespace existence.
});
