import vm from 'vm';
import { Tool } from '../core/types.js';

const replContexts = new Map<string, vm.Context>();
const CONTEXT_SIZE_THRESHOLD = 2000;

export const codeExecTool: Tool = {
  name: 'code_exec',
  description: 'Execute JavaScript in a persistent RLM sandbox. Use rlm_call() for recursion. Context survives across calls.',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JS code to run' },
      sessionId: { type: 'string', description: 'REPL session (default: task ID)' },
      contextKeys: {
        type: 'array',
        items: { type: 'string' },
        description: 'Variables/files to pass to child (optional)'
      }
    },
    required: ['code']
  },
  async execute(args: Record<string, unknown>, agent: any, session: any, from?: string) {
    const code = args.code as string;
    const sessionId = (args.sessionId as string) || 'default';
    const contextKeys = (args.contextKeys as string[]) || [];

    if (!replContexts.has(sessionId)) {
      const ctx = vm.createContext({
        // Inject VoltClaw primitives
        read_file: (args: any) => agent.executeTool('read_file', args, session, from || 'unknown'),
        write_file: (args: any) => agent.executeTool('write_file', args, session, from || 'unknown'),
        http_get: (args: any) => agent.executeTool('http_get', args, session, from || 'unknown'),

        // RLM recursion
        rlm_call: async (subtask: string, keys: string[] = contextKeys) => {
          let summary = '';
          if (keys && keys.length > 0) {
             const extracted: Record<string, any> = {};
             for (const k of keys) {
                 if (k in ctx) extracted[k] = ctx[k];
             }
             try {
                const contextStr = JSON.stringify(extracted);
                if (contextStr.length > CONTEXT_SIZE_THRESHOLD && agent.memory) {
                  const memoryId = await agent.memory.storeMemory(
                    contextStr,
                    'working',
                    ['rlm_context', `session:${sessionId}`],
                    10 // High importance
                  );
                  summary = `RLM Context stored in memory. Use memory_recall(id='${memoryId}') to retrieve it.`;
                } else {
                  summary = `Context: ${contextStr}`;
                }
             } catch (e) {
                summary = `Context: [Serialization Error: ${String(e)}]`;
             }
          }

          return await agent.executeTool('call', {
            task: subtask,
            summary
          }, session, from || 'unknown');
        },

        // Power user access
        voltclaw: agent,

        // Basic console
        console: {
            log: (...args: any[]) => { /* suppressed */ },
            error: (...args: any[]) => { /* suppressed */ }
        }
      });
      replContexts.set(sessionId, ctx);
    }

    try {
      const result = vm.runInContext(code, replContexts.get(sessionId)!, {
        timeout: 30000 // 30s timeout to prevent infinite loops
      });

      let output = result;
      if (result && typeof result.then === 'function') {
          output = await result;
      }

      return {
        output: output,
        sessionId,
        contextSize: Object.keys(replContexts.get(sessionId)!).length
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
};
