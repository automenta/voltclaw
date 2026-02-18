import vm from 'vm';
import { Tool } from '../core/types.js';

export interface CodeExecConfig {
  rlmTimeoutMs?: number;
  contextSizeThreshold?: number;
}

const replContexts = new Map<string, vm.Context>();

export function createCodeExecTool(config: CodeExecConfig = {}): Tool {
  const RLM_CALL_TIMEOUT_MS = config.rlmTimeoutMs ?? 60000;
  const CONTEXT_SIZE_THRESHOLD = config.contextSizeThreshold ?? 2000;

  return {
    name: 'code_exec',
    description: 'Execute JavaScript in a persistent RLM sandbox. Globals: rlm_call(task), rlm_call_parallel(tasks), load_context(id). Context survives across calls.',
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

        // Helpers
        const fs = {
            read: (path: string) => execTool('read_file', { filepath: path }),
            write: (path: string, content: string) => execTool('write_file', { filepath: path, content }),
            list: (path: string = '.') => execTool('list_files', { path }),
            stream: async function* (path: string, options: { bufferSize?: number } = {}) {
                // Primitive streaming simulation using read_file (since agent doesn't expose native streams yet)
                const result = await execTool('read_file', { filepath: path });
                if (result.error) throw new Error(result.error);

                const content = result.content as string;
                const bufferSize = options.bufferSize ?? 1024;
                let offset = 0;

                while (offset < content.length) {
                    yield content.slice(offset, offset + bufferSize);
                    offset += bufferSize;
                }
            }
        };
        const http = {
            get: (url: string) => execTool('http_get', { url }),
            post: (url: string, body: string) => execTool('http_post', { url, body }),
        };
        const memory = {
            store: (content: string, type: string) => execTool('memory_store', { content, type }),
            recall: (query: string) => execTool('memory_recall', { query }),
        };
        const llm = {
            chat: async (prompt: string, system?: string) => {
                // Direct access to LLM via agent methods if available, otherwise via tool or fallback
                // VoltClawAgent doesn't expose a 'chat' tool directly, but we can access `agent.query` if we cast `agent`.
                // However, `agent` passed here IS the VoltClawAgent instance usually.
                // But `execute` signature says `agent: any`.
                if (agent && typeof agent.query === 'function') {
                    // This creates a new top-level query or sub-context?
                    // Ideally we want a lightweight chat without full agent loop overhead if possible,
                    // but agent.query is the standard way.
                    // Or we can use `agent.llm.chat` directly?
                    // Accessing `agent.llm` requires `agent` to be `VoltClawAgent`.
                    if (agent.llm && typeof agent.llm.chat === 'function') {
                        const messages = [];
                        if (system) messages.push({ role: 'system', content: system });
                        messages.push({ role: 'user', content: prompt });
                        const res = await agent.llm.chat(messages);
                        return res.content;
                    }
                }
                throw new Error('LLM access not available');
            },
            embed: async (text: string) => {
                if (agent && agent.llm && typeof agent.llm.embed === 'function') {
                    return await agent.llm.embed(text);
                }
                throw new Error('Embedding not available');
            }
        };

        // Create a context object with all the functionality
        const ctxObj: any = {
          // Global aliases (legacy but useful)
          read_file: (args: any) => execTool('read_file', args),
          write_file: (args: any) => execTool('write_file', args),
          http_get: (args: any) => execTool('http_get', args),

          // Industrial Namespaces (Globals)
          fs,
          http,
          memory,
          llm,

          // VoltClaw Namespace (Legacy/Scoped)
          voltclaw: {
              agent, // Power user access
              fs,
              http,
              memory,
              llm
          },

          // Basic console
          console: {
              log: (...args: any[]) => {
                  const ctx = replContexts.get(sessionId);
                  if (ctx && (ctx as any).__log_collector) {
                      (ctx as any).__log_collector.push(args.map(String).join(' '));
                  }
              },
              error: (...args: any[]) => {
                  const ctx = replContexts.get(sessionId);
                  if (ctx && (ctx as any).__log_collector) {
                      (ctx as any).__log_collector.push('[ERROR] ' + args.map(String).join(' '));
                  }
              }
          }
        };

        // Helper to load context by ID easily
        ctxObj.load_context = async (id: string) => {
             if (agent.memory) {
                 const entries = await agent.memory.recall({ id });
                 if (entries && entries.length > 0) {
                     entries.sort((a, b) => {
                         const idxA = (a.metadata as any)?.chunkIndex ?? 0;
                         const idxB = (b.metadata as any)?.chunkIndex ?? 0;
                         return idxA - idxB;
                     });
                     return entries.map(e => e.content).join('');
                 }
             }
             return null;
        };

        // Helper to resolve RLM references
        const resolveRLMRef = async (result: any) => {
              let output = result;
              // Transparently resolve RLM Reference
              if (typeof output === 'string' && output.startsWith('[RLM_REF:') && agent.memory) {
                   const refId = output.slice(9, -1);
                   try {
                       const entries = await agent.memory.recall({ id: refId });
                       if (entries && entries.length > 0) {
                           entries.sort((a, b) => {
                               const idxA = (a.metadata as any)?.chunkIndex ?? 0;
                               const idxB = (b.metadata as any)?.chunkIndex ?? 0;
                               return idxA - idxB;
                           });
                           output = entries.map(e => e.content).join('');
                       }
                   } catch (e) {
                       // ignore
                   }
              }

              if (typeof output === 'string') {
                  try {
                     return JSON.parse(output);
                  } catch {
                     return output;
                  }
              }
              return output;
        };

        // Define rlm_call separately to capture 'ctxObj' (which becomes 'ctx')
        ctxObj.rlm_call = async (subtask: string, keys: string[] = contextKeys) => {
            let summary = '';
            if (keys && keys.length > 0) {
               const extracted: Record<string, any> = {};
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

              return resolveRLMRef(result?.result);
            } catch (e) {
               clearTimeout(timeoutId!);
               throw e; // Propagate error
            }
        };

        ctxObj.rlm_call_parallel = async (tasks: Array<{ task: string, summary?: string }>) => {
             const callPromise = agent.executeTool('call_parallel', {
                  tasks
             }, session, from || 'unknown');

             // Timeout logic
            let timeoutId: NodeJS.Timeout;
            const timeoutPromise = new Promise((_, reject) => {
               timeoutId = setTimeout(() => reject(new Error(`rlm_call_parallel timed out after ${RLM_CALL_TIMEOUT_MS}ms`)), RLM_CALL_TIMEOUT_MS);
            });

            try {
               const result: any = await Promise.race([callPromise, timeoutPromise]);
               clearTimeout(timeoutId!);

               if (result.status === 'completed' && Array.isArray(result.results)) {
                   // Resolve all results
                   const resolved = await Promise.all(result.results.map(async (r: any) => {
                       return {
                           ...r,
                           result: await resolveRLMRef(r.result)
                       };
                   }));
                   return resolved;
               }
               return result;
            } catch (e) {
               clearTimeout(timeoutId!);
               throw e;
            }
        };

        const ctx = vm.createContext(ctxObj);
        replContexts.set(sessionId, ctx);
      }

      const logs: string[] = [];
      const ctx = replContexts.get(sessionId)!;
      (ctx as any).__log_collector = logs;

      try {
        const result = vm.runInContext(code, ctx, {
          timeout: 30000 // 30s timeout for sync code execution
        });

        let output = result;
        if (result && typeof result.then === 'function') {
            output = await result;
        }

        return {
          output: output,
          logs: logs.length > 0 ? logs : undefined,
          sessionId,
          contextSize: Object.keys(ctx).length
        };
      } catch (e) {
        return {
          error: (e as Error).message,
          logs: logs.length > 0 ? logs : undefined
        };
      }
    }
  };
}

// Export a default instance for backward compatibility if imported directly as object
export const codeExecTool = createCodeExecTool();
