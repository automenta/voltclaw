import vm from 'vm';
import { Tool } from '../core/types.js';

const replContexts = new Map<string, vm.Context>();
const CONTEXT_SIZE_THRESHOLD = 2000;
const RLM_CALL_TIMEOUT_MS = 60000;

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
      const execTool = (name: string, args: any) => agent.executeTool(name, args, session, from || 'unknown');

      // Create a context object with all the functionality
      const ctxObj: any = {
        // Global aliases (legacy but useful)
        read_file: (args: any) => execTool('read_file', args),
        write_file: (args: any) => execTool('write_file', args),
        http_get: (args: any) => execTool('http_get', args),

        // Industrial Namespace
        voltclaw: {
            agent, // Power user access
            fs: {
                read: (path: string) => execTool('read_file', { filepath: path }),
                write: (path: string, content: string) => execTool('write_file', { filepath: path, content }),
                list: (path: string = '.') => execTool('list_files', { path }),
                // delete: (path: string) => execTool('delete_file', { filepath: path }), // Assuming tool exists or will exist
            },
            http: {
                get: (url: string) => execTool('http_get', { url }),
                post: (url: string, body: string) => execTool('http_post', { url, body }),
            },
            memory: {
                store: (content: string, type: string) => execTool('memory_store', { content, type }),
                recall: (query: string) => execTool('memory_recall', { query }),
            }
        },

        // Basic console
        console: {
            log: (...args: any[]) => { /* suppressed */ },
            error: (...args: any[]) => { /* suppressed */ }
        }
      };

      // Define rlm_call separately to capture 'ctxObj' (which becomes 'ctx')
      ctxObj.rlm_call = async (subtask: string, keys: string[] = contextKeys) => {
          let summary = '';
          if (keys && keys.length > 0) {
             const extracted: Record<string, any> = {};
             // We access the context object directly here. Since ctxObj IS the context object (mostly),
             // we can iterate keys on it. But wait, `vm.createContext(ctxObj)` makes a proxy.
             // Inside the sandbox, `this` refers to global context.
             // However, `ctxObj` here is the init object. Variables defined via `var` inside `vm.runInContext`
             // are set on the context object.

             // BUT: `ctxObj` reference here is stale regarding newly defined vars unless we use the context reference.
             // The context reference is stored in `replContexts`.
             const currentCtx = replContexts.get(sessionId);
             if (currentCtx) {
                 for (const k of keys) {
                     if (k in currentCtx) extracted[k] = currentCtx[k];
                 }
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

          const callPromise = agent.executeTool('call', {
            task: subtask,
            summary
          }, session, from || 'unknown');

          // Timeout logic
          let timeoutId: NodeJS.Timeout;
          const timeoutPromise = new Promise((_, reject) => {
             timeoutId = setTimeout(() => reject(new Error(`rlm_call timed out after ${RLM_CALL_TIMEOUT_MS}ms`)), RLM_CALL_TIMEOUT_MS);
          });

          try {
            const result: any = await Promise.race([callPromise, timeoutPromise]);
            clearTimeout(timeoutId!);

            if (result && typeof result.result === 'string') {
                try {
                   return JSON.parse(result.result);
                } catch {
                   return result.result;
                }
            }
            return result;
          } catch (e) {
             clearTimeout(timeoutId!);
             throw e; // Propagate error
          }
      };

      const ctx = vm.createContext(ctxObj);
      replContexts.set(sessionId, ctx);
    }

    try {
      const result = vm.runInContext(code, replContexts.get(sessionId)!, {
        timeout: 30000 // 30s timeout for sync code execution
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
