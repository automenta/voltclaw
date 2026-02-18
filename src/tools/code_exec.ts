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
      const userSessionId = (args.sessionId as string) || 'default';
      // Scope the REPL session to the current agent session (e.g. subtask) to prevent collisions in RLM
      const internalSessionId = session && session.id ? `${session.id}:${userSessionId}` : userSessionId;
      const contextKeys = (args.contextKeys as string[]) || [];

      if (!replContexts.has(internalSessionId)) {
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
                  const ctx = replContexts.get(internalSessionId);
                  const msg = args.map(String).join(' ');
                  if (ctx && (ctx as any).__log_collector) {
                      (ctx as any).__log_collector.push(msg);
                  }

                  // Stream log if agent channel is available
                  if (agent && agent.channel) {
                      const payload = JSON.stringify({
                          type: 'subtask_log',
                          subId: session.id,
                          taskId: session.id,
                          message: msg,
                          level: 'info'
                      });
                      agent.channel.send(agent.channel.identity.publicKey, payload).catch(() => {});
                  }
              },
              error: (...args: any[]) => {
                  const ctx = replContexts.get(internalSessionId);
                  const msg = '[ERROR] ' + args.map(String).join(' ');
                  if (ctx && (ctx as any).__log_collector) {
                      (ctx as any).__log_collector.push(msg);
                  }

                  if (agent && agent.channel) {
                      const payload = JSON.stringify({
                          type: 'subtask_log',
                          subId: session.id,
                          taskId: session.id,
                          message: msg,
                          level: 'error'
                      });
                      agent.channel.send(agent.channel.identity.publicKey, payload).catch(() => {});
                  }
              }
          }
        };

        // RLM Global: Shared Memory
        ctxObj.rlm_shared_set = async (key: string, value: any) => {
             const rootId = session.rootId || session.id;
             if (!rootId) throw new Error('Root ID not found');

             let store;
             if (typeof agent.getStore === 'function') {
                 store = agent.getStore();
             } else {
                 // Fallback for legacy or mock agents
                 store = (agent as any).store || (agent as any).persistence;
             }

             if (!store) throw new Error('Store not available');

             const rootSession = store.get(rootId);
             if (!rootSession.sharedData) rootSession.sharedData = {};
             rootSession.sharedData[key] = value;

             if (store.save) await store.save();
             return true;
        };

        ctxObj.rlm_shared_get = async (key: string) => {
             const rootId = session.rootId || session.id;
             if (!rootId) return undefined;

             let store;
             if (typeof agent.getStore === 'function') {
                 store = agent.getStore();
             } else {
                 store = (agent as any).store || (agent as any).persistence;
             }

             if (!store) return undefined;

             const rootSession = store.get(rootId);
             return rootSession.sharedData?.[key];
        };

        ctxObj.rlm_shared_increment = async (key: string, delta: number = 1) => {
             const rootId = session.rootId || session.id;
             if (!rootId) throw new Error('Root ID not found');

             let store;
             if (typeof agent.getStore === 'function') {
                 store = agent.getStore();
             } else {
                 store = (agent as any).store || (agent as any).persistence;
             }

             if (!store) throw new Error('Store not available');

             const rootSession = store.get(rootId);
             if (!rootSession.sharedData) rootSession.sharedData = {};

             const current = Number(rootSession.sharedData[key] || 0);
             const newVal = current + delta;
             rootSession.sharedData[key] = newVal;

             if (store.save) await store.save();
             return newVal;
        };

        ctxObj.rlm_shared_push = async (key: string, value: any) => {
             const rootId = session.rootId || session.id;
             if (!rootId) throw new Error('Root ID not found');

             let store;
             if (typeof agent.getStore === 'function') {
                 store = agent.getStore();
             } else {
                 store = (agent as any).store || (agent as any).persistence;
             }

             if (!store) throw new Error('Store not available');

             const rootSession = store.get(rootId);
             if (!rootSession.sharedData) rootSession.sharedData = {};

             if (!Array.isArray(rootSession.sharedData[key])) {
                 rootSession.sharedData[key] = [];
             }
             rootSession.sharedData[key].push(value);

             if (store.save) await store.save();
             return rootSession.sharedData[key].length;
        };

        // RLM Global: Trace
        ctxObj.rlm_trace = async () => {
             const trace = [];
             let currentId = session.id;

             let store;
             if (typeof agent.getStore === 'function') {
                 store = agent.getStore();
             } else {
                 store = (agent as any).store || (agent as any).persistence;
             }

             while (currentId && store) {
                 const sess = store.get(currentId);
                 trace.push({
                     id: currentId,
                     depth: sess.depth,
                     role: sess.parentId ? 'subagent' : 'root'
                 });
                 currentId = sess.parentId;
                 if (trace.length > 50) break;
             }
             return trace;
        };

        // RLM Global: Map
        ctxObj.rlm_map = async (items: any[], mapper: (item: any, index: number) => any) => {
            if (!Array.isArray(items)) throw new Error('rlm_map expects an array');

            const tasks: any[] = [];
            for (let i = 0; i < items.length; i++) {
                const def = mapper(items[i], i);
                if (typeof def === 'string') {
                    tasks.push({ task: def });
                } else if (typeof def === 'object' && def.task) {
                    tasks.push(def);
                } else {
                    throw new Error(`Mapper returned invalid task definition at index ${i}`);
                }
            }

            return ctxObj.rlm_call_parallel(tasks);
        };

        // RLM Global: Filter
        ctxObj.rlm_filter = async (items: any[], predicate: (item: any) => any) => {
            if (!Array.isArray(items)) throw new Error('rlm_filter expects an array');

            const tasks: any[] = [];
            for (let i = 0; i < items.length; i++) {
                const def = predicate(items[i]);
                const taskObj = typeof def === 'string' ? { task: def } : def;

                // Enforce boolean schema
                taskObj.schema = { type: 'boolean' };
                // Inject item into summary if not present?
                // The user's predicate function should handle context.

                tasks.push(taskObj);
            }

            const results = await ctxObj.rlm_call_parallel(tasks);

            // Filter items where result is true
            return items.filter((_, i) => {
                const res = results[i];
                // rlm_call_parallel returns array of results.
                // Each result is the output from subtask.
                // Since we enforced boolean schema, result.result should be parsed boolean if logic works?
                // rlm_call_parallel resolves refs.
                // But handleSubtaskResult only parses JSON if schema was sent.
                // Yes, we sent schema.
                // However, rlm_call_parallel implementation:
                // returns { status: 'completed', results: [...] }
                // where results[i] is { status, result, subId... }
                // and result is string.

                // We need to parse the boolean from the string result.
                try {
                    return JSON.parse(res.result) === true;
                } catch {
                    return false;
                }
            });
        };

        // RLM Global: Reduce
        ctxObj.rlm_reduce = async (items: any[], reducer: (acc: any, item: any) => any, initialValue: any) => {
            if (!Array.isArray(items)) throw new Error('rlm_reduce expects an array');

            let acc = initialValue;
            for (let i = 0; i < items.length; i++) {
                const def = reducer(acc, items[i]);
                const task = typeof def === 'string' ? def : def.task;
                const options = typeof def === 'object' ? def : {};

                // Call single
                const res = await ctxObj.rlm_call(task, options);
                acc = res;
            }
            return acc;
        };

        ctxObj.rlm_root_id = session.rootId;

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
        ctxObj.rlm_call = async (subtask: string, keysOrOptions: string[] | { contextKeys?: string[], schema?: any } = contextKeys) => {
            let keys: string[] = [];
            let schema: any = undefined;

            if (Array.isArray(keysOrOptions)) {
                keys = keysOrOptions;
            } else if (typeof keysOrOptions === 'object') {
                keys = keysOrOptions.contextKeys || [];
                schema = keysOrOptions.schema;
            }

            let summary = '';
            if (keys && keys.length > 0) {
               const extracted: Record<string, any> = {};
               const currentCtx = replContexts.get(internalSessionId);
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
                      ['rlm_context', `session:${internalSessionId}`],
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
              summary,
              schema
            }, session, from || 'unknown');

            // Timeout logic
            let timeoutId: NodeJS.Timeout;
            const timeoutPromise = new Promise((_, reject) => {
               timeoutId = setTimeout(() => reject(new Error(`rlm_call timed out after ${RLM_CALL_TIMEOUT_MS}ms`)), RLM_CALL_TIMEOUT_MS);
            });

            try {
              const result: any = await Promise.race([callPromise, timeoutPromise]);
              clearTimeout(timeoutId!);

              // Return the inner result if available (standard success), otherwise the whole object (error/mock)
              return resolveRLMRef(result?.result ?? result);
            } catch (e) {
               clearTimeout(timeoutId!);
               throw e; // Propagate error
            }
        };

        ctxObj.rlm_call_parallel = async (tasks: Array<{ task: string, summary?: string, schema?: any }>) => {
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
        replContexts.set(internalSessionId, ctx);
      }

      const logs: string[] = [];
      const ctx = replContexts.get(internalSessionId)!;
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
          sessionId: userSessionId,
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
