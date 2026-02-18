import { describe, it, expect, vi } from 'vitest';
import { createCodeExecTool } from '../../src/tools/code_exec.js';

describe('code_exec tool enhanced', () => {
  const codeExecTool = createCodeExecTool();

  it('should support streaming via fs.stream', async () => {
    const agent = {
      executeTool: vi.fn().mockImplementation((name, args) => {
          if (name === 'read_file') return { content: 'Line1\nLine2\nLine3' };
          return {};
      }),
    };
    const session = {};
    const sessionId = 'stream-session';

    const result = await codeExecTool.execute({
      code: `
        (async () => {
            const chunks = [];
            for await (const chunk of fs.stream('test.txt', { bufferSize: 6 })) {
                chunks.push(chunk);
            }
            return chunks;
        })()
      `,
      sessionId
    }, agent, session);

    expect(result.output).toEqual(['Line1\n', 'Line2\n', 'Line3']);
    expect(agent.executeTool).toHaveBeenCalledWith('read_file', { filepath: 'test.txt' }, session, 'unknown');
  });

  it('should support direct llm access', async () => {
    const agent = {
      executeTool: vi.fn(),
      query: vi.fn(), // Needed for existence check
      llm: {
          chat: vi.fn().mockResolvedValue({ content: 'Hello World' }),
          embed: vi.fn().mockResolvedValue([0.1, 0.2])
      }
    };
    const session = {};
    const sessionId = 'llm-session';

    const result = await codeExecTool.execute({
      code: `
        (async () => {
            const reply = await llm.chat('Hi');
            const vec = await llm.embed('text');
            return { reply, vec };
        })()
      `,
      sessionId
    }, agent, session);

    expect(result.output).toEqual({
        reply: 'Hello World',
        vec: [0.1, 0.2]
    });

    expect(agent.llm.chat).toHaveBeenCalledWith([
        { role: 'user', content: 'Hi' }
    ]);
  });
});
