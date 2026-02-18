
export function createRLMGlobals(agent: any, session: any, internalSessionId: string, contextKeys: string[], resolveRLMRef: (r: any) => Promise<any>, RLM_CALL_TIMEOUT_MS: number, CONTEXT_SIZE_THRESHOLD: number, replContexts: Map<string, any>) {
    const ctxObj: any = {};

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
                 entries.sort((a: any, b: any) => {
                     const idxA = (a.metadata as any)?.chunkIndex ?? 0;
                     const idxB = (b.metadata as any)?.chunkIndex ?? 0;
                     return idxA - idxB;
                 });
                 return entries.map((e: any) => e.content).join('');
             }
         }
         return null;
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
        }, session, 'unknown');

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
         }, session, 'unknown');

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

    return ctxObj;
}
