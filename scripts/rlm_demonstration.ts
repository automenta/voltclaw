
import { VoltClawAgent } from '../src/core/agent.js';
import { MockLLM } from '../src/testing/mock-llm.js';
import { FileStore } from '../src/memory/index.js';
import { createAllTools } from '../src/tools/index.js';
import { Channel, MessageHandler, Unsubscribe } from '../src/core/types.js';
import fs from 'fs';
import path from 'path';

// --- Mocks ---

class MockChannel implements Channel {
    readonly type = 'mock';
    readonly identity = { publicKey: 'mock-pubkey' };
    private handlers: MessageHandler[] = [];

    async start() {}
    async stop() {}
    async send(to: string, content: string) {
        // Echo back to self for subtasks
        if (to === this.identity.publicKey) {
             const meta = { timestamp: Date.now() };
             // Use setTimeout to allow I/O breathing room
             setTimeout(() => {
                 for (const h of this.handlers) h(to, content, meta);
             }, 10);
        }
    }
    subscribe(handler: MessageHandler): Unsubscribe {
        this.handlers.push(handler);
        return () => {};
    }
    on() {}
}

async function runDemo() {
    console.log("=== VoltClaw RLM Demo ===");

    const tools = await createAllTools();
    const storePath = path.join(process.cwd(), 'demo_data.json');
    if (fs.existsSync(storePath)) fs.unlinkSync(storePath);

    // --- Test 1: Persistence ---
    console.log("\n--- Test 1: Persistent REPL State ---");

    let step1 = 0;
    const llm1 = new MockLLM({
        handler: async (messages) => {
            const last = messages[messages.length - 1];

            if (last.role === 'user' && last.content?.includes('Load the number 42')) {
                step1 = 1;
                return {
                    content: "Step 1",
                    toolCalls: [{
                        id: 'call1',
                        name: 'code_exec',
                        arguments: {
                            code: 'var magicNumber = 42; "set";',
                            sessionId: 'test-session-1'
                        }
                    }]
                };
            }

            if (last.role === 'tool' && step1 === 1) {
                step1 = 2;
                return {
                    content: "Step 2",
                    toolCalls: [{
                        id: 'call2',
                        name: 'code_exec',
                        arguments: {
                            code: 'var result = magicNumber * 10; result;',
                            sessionId: 'test-session-1'
                        }
                    }]
                };
            }

            if (last.role === 'tool' && step1 === 2) {
                step1 = 3;
                return {
                    content: "Step 3",
                    toolCalls: [{
                        id: 'call3',
                        name: 'code_exec',
                        arguments: {
                            code: '({ magic: magicNumber, res: result })',
                            sessionId: 'test-session-1'
                        }
                    }]
                };
            }

            if (last.role === 'tool' && step1 === 3) {
                return {
                    content: `Final Answer: The magic number is 42 and result is 420. JSON: ${last.content}`
                };
            }

            return { content: "Unexpected step" };
        }
    });

    const agent1 = new VoltClawAgent({
        llm: llm1,
        channel: new MockChannel(),
        persistence: new FileStore({ path: storePath }),
        tools
    });

    await agent1.start();
    const result1 = await agent1.query("Load the number 42 into a variable called magicNumber using code_exec. Then multiply it by 10. Read back both.");
    console.log("Result:", result1);
    await agent1.stop();

    // --- Test 2: Recursion from Code ---
    console.log("\n--- Test 2: Recursion via rlm_call ---");

    const llm2 = new MockLLM({
        handler: async (messages) => {
             const last = messages[messages.length - 1];
             const systemMsg = messages.find(m => m.role === 'system')?.content || '';

             // Handle subtask prompt
             if (systemMsg.includes('FOCUSED sub-agent')) {
                 return { content: "Subtask result: 13" };
             }

             if (last.role === 'user' && last.content?.includes('Fibonacci')) {
                 return {
                     content: "Starting recursion...",
                     toolCalls: [{
                         id: 'call_rec',
                         name: 'code_exec',
                         arguments: {
                             // This code calls rlm_call
                             code: `
                                (async () => {
                                    try {
                                        const res = await rlm_call('Compute fib(7)', ['n']);
                                        return "Recursion triggered. Got result: " + res;
                                    } catch (e) {
                                        return "Recursion failed: " + e.message;
                                    }
                                })()
                             `,
                             sessionId: 'test-rec-1',
                             contextKeys: ['n']
                         }
                     }]
                 }
             }

             if (last.role === 'tool') {
                 return { content: "Done: " + last.content };
             }

             return { content: "Done (fallback)" };
        }
    });

    const agent2 = new VoltClawAgent({
        llm: llm2,
        channel: new MockChannel(),
        persistence: new FileStore({ path: storePath }),
        tools
    });

    await agent2.start();

    // Use a simpler mechanism to handle timeout
    const timeout = setTimeout(() => {
        console.error("Test 2 timed out!");
        process.exit(1);
    }, 10000);

    try {
        const result2 = await agent2.query("Compute 8th Fibonacci number using RLM.");
        console.log("Result 2:", result2);
    } catch (e) {
        console.log("Test 2 finished with error:", e.message);
    } finally {
        clearTimeout(timeout);
    }

    await agent2.stop();

    // --- Test 3: Shared Memory & Trace ---
    console.log("\n--- Test 3: Shared Memory & Trace ---");

    let step3 = 0;
    const llm3 = new MockLLM({
        handler: async (messages) => {
             const last = messages[messages.length - 1];
             const systemMsg = messages.find(m => m.role === 'system')?.content || '';

             // Sub-agent Logic
             if (systemMsg.includes('FOCUSED sub-agent')) {
                 if (last.role === 'user') {
                     return {
                         content: "Checking shared memory...",
                         toolCalls: [{
                             id: 'call_share_sub',
                             name: 'code_exec',
                             arguments: {
                                 code: `
                                    (async () => {
                                        const val = await rlm_shared_get('counter');
                                        const trace = await rlm_trace();
                                        await rlm_shared_set('counter', val + 1);
                                        return { val, trace };
                                    })()
                                 `,
                                 sessionId: 'sub-session'
                             }
                         }]
                     };
                 }
                 if (last.role === 'tool') {
                     return { content: `Sub-agent done. Result: ${last.content}` };
                 }
             }

             // Root Agent Logic
             if (last.role === 'user' && last.content?.includes('Shared Memory')) {
                 step3 = 1;
                 return {
                     content: "Step 1: Init shared memory",
                     toolCalls: [{
                         id: 'call_share_1',
                         name: 'code_exec',
                         arguments: {
                             code: `
                                (async () => {
                                    await rlm_shared_set('counter', 10);
                                    return "Set counter to 10";
                                })()
                             `,
                             sessionId: 'root-session'
                         }
                     }]
                 };
             }

             if (last.role === 'tool' && step3 === 1) {
                 step3 = 2;
                 return {
                     content: "Step 2: Call sub-agent",
                     toolCalls: [{
                         id: 'call_share_2',
                         name: 'call', // Use 'call' tool directly for simplicity in mock
                         arguments: {
                             task: "Increment counter",
                             summary: "Please increment the shared counter"
                         }
                     }]
                 };
             }

             if (last.role === 'tool' && step3 === 2) {
                 step3 = 3;
                 // Sub-agent returned
                 console.log("Sub-agent result seen by root:", last.content);
                 return {
                     content: "Step 3: Read back",
                     toolCalls: [{
                         id: 'call_share_3',
                         name: 'code_exec',
                         arguments: {
                             code: `
                                (async () => {
                                    const val = await rlm_shared_get('counter');
                                    return val;
                                })()
                             `,
                             sessionId: 'root-session'
                         }
                     }]
                 };
             }

             if (last.role === 'tool' && step3 === 3) {
                 return { content: `Final Value: ${last.content}` };
             }

             return { content: "Unexpected step in Test 3" };
        }
    });

    const agent3 = new VoltClawAgent({
        llm: llm3,
        channel: new MockChannel(),
        persistence: new FileStore({ path: storePath }),
        tools
    });

    await agent3.start();
    const result3 = await agent3.query("Test Shared Memory features.");
    console.log("Result 3:", result3);
    await agent3.stop();

    // --- Test 4: Structured Output ---
    console.log("\n--- Test 4: Structured Output ---");

    const llm4 = new MockLLM({
        handler: async (messages) => {
             const systemMsg = messages.find(m => m.role === 'system')?.content || '';

             // Sub-agent Logic
             if (systemMsg.includes('FOCUSED sub-agent')) {
                 if (systemMsg.includes('OUTPUT REQUIREMENT')) {
                     return { content: JSON.stringify({ name: "Alice", age: 30 }) };
                 }
                 return { content: "Missing schema instruction" };
             }

             // Root Agent Logic
             const last = messages[messages.length - 1];
             if (last.role === 'user' && last.content?.includes('Structured Output')) {
                 return {
                     content: "Calling sub-agent with schema...",
                     toolCalls: [{
                         id: 'call_struct',
                         name: 'code_exec',
                         arguments: {
                             code: `
                                (async () => {
                                    const schema = { type: 'object', required: ['name', 'age'] };
                                    const res = await rlm_call('Get person info', { schema });
                                    return res;
                                })()
                             `,
                             sessionId: 'struct-session'
                         }
                     }]
                 };
             }

             if (last.role === 'tool') {
                 return { content: `Result: ${last.content}` };
             }

             return { content: "Unexpected step in Test 4" };
        }
    });

    const agent4 = new VoltClawAgent({
        llm: llm4,
        channel: new MockChannel(),
        persistence: new FileStore({ path: storePath }),
        tools
    });

    await agent4.start();
    const result4 = await agent4.query("Test Structured Output.");
    console.log("Result 4:", result4);
    await agent4.stop();

    // --- Test 5: Atomic Ops & Logging ---
    console.log("\n--- Test 5: Atomic Ops & Logging ---");

    const llm5 = new MockLLM({
        handler: async (messages) => {
             const systemMsg = messages.find(m => m.role === 'system')?.content || '';
             const last = messages[messages.length - 1];

             // Sub-agent Logic
             if (systemMsg.includes('FOCUSED sub-agent')) {
                 if (last.role === 'user') {
                     return {
                         content: "Simulating progress...",
                         toolCalls: [{
                             id: 'call_atomic',
                             name: 'code_exec',
                             arguments: {
                                 code: `
                                    (async () => {
                                        console.log("Starting atomic test");
                                        await rlm_shared_increment('global_counter', 5);
                                        await rlm_shared_push('global_log', 'Item 1');
                                        console.log("Mid-way progress");
                                        await rlm_shared_push('global_log', 'Item 2');
                                        console.log("Finished atomic test");
                                        return "Done";
                                    })()
                                 `,
                                 sessionId: 'atomic-session'
                             }
                         }]
                     };
                 }
                 return { content: "Sub-task completed." };
             }

             // Root Agent Logic
             if (last.role === 'user' && last.content?.includes('Atomic')) {
                 return {
                     content: "Starting atomic operations test...",
                     toolCalls: [{
                         id: 'call_atomic_root',
                         name: 'code_exec',
                         arguments: {
                             code: `
                                (async () => {
                                    await rlm_shared_set('global_counter', 0);
                                    await rlm_shared_set('global_log', []);
                                    await rlm_call('Run atomic updates');
                                    const count = await rlm_shared_get('global_counter');
                                    const log = await rlm_shared_get('global_log');
                                    return { count, log };
                                })()
                             `,
                             sessionId: 'root-atomic'
                         }
                     }]
                 };
             }

             if (last.role === 'tool') {
                 return { content: `Final Result: ${last.content}` };
             }

             return { content: "Unexpected step in Test 5" };
        }
    });

    const agent5 = new VoltClawAgent({
        llm: llm5,
        channel: new MockChannel(),
        persistence: new FileStore({ path: storePath }),
        tools,
        hooks: {
            onLog: async (ctx) => {
                console.log(`[STREAM LOG] ${ctx.level.toUpperCase()} from ${ctx.subId.slice(-8)}: ${ctx.message}`);
            }
        }
    });

    await agent5.start();
    const result5 = await agent5.query("Test Atomic Ops.");
    console.log("Result 5:", result5);
    await agent5.stop();

    if (fs.existsSync(storePath)) fs.unlinkSync(storePath);
    console.log("Demo complete.");
}

runDemo().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
});
