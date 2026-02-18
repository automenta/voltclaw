
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
             for (const h of this.handlers) h(to, content, meta);
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

    // Setup
    const tools = await createAllTools();
    const storePath = path.join(process.cwd(), 'demo_data.json');
    if (fs.existsSync(storePath)) fs.unlinkSync(storePath);

    // --- Test 1: Persistence ---
    console.log("\n--- Test 1: Persistent REPL State ---");

    let step1 = 0;
    const llm1 = new MockLLM({
        handler: async (messages) => {
            const last = messages[messages.length - 1];
            // console.log(`[LLM] Step ${step1} received:`, last.role, last.content?.slice(0, 50));

            if (last.role === 'user' && last.content?.includes('Load the number 42')) {
                step1 = 1;
                return {
                    content: "I'll start by initializing the variable.",
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
                    content: "Now I will multiply it.",
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
                    content: "Reading back values.",
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

    // We need to simulate the 'call' tool being triggered by code_exec
    // We can spy on the 'call' event

    const llm2 = new MockLLM({
        handler: async (messages) => {
             const last = messages[messages.length - 1];
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
                                    console.log("Inside JS: calling rlm_call");
                                    // Verify rlm_call exists and calls back
                                    const res = await rlm_call('Compute fib(7)', ['n']);
                                    return "Recursion triggered: " + JSON.stringify(res);
                                })()
                             `,
                             sessionId: 'test-rec-1',
                             contextKeys: ['n']
                         }
                     }]
                 }
             }
             return { content: "Done" };
        }
    });

    const agent2 = new VoltClawAgent({
        llm: llm2,
        channel: new MockChannel(),
        persistence: new FileStore({ path: storePath }),
        tools,
        // We can hook into onCall to verify recursion
        hooks: {
            onCall: async (ctx) => {
                console.log(`[Hook] Agent triggered subtask: "${ctx.task}" at depth ${ctx.depth}`);
            }
        }
    });

    // We need to mock the 'call' tool execution or the subtask handling
    // because MockChannel echoes back, the agent will try to process the subtask.
    // The subtask processing requires LLM response.
    // We'll simplisticly verify the *attempt* to recurse.

    await agent2.start();

    // Pre-inject 'n' into session context just in case (though code_exec handles missing keys gracefully-ish)
    // Actually code_exec defines contextKeys for *extraction* from VM to pass to child.

    try {
        await agent2.query("Compute 8th Fibonacci number using RLM.");
    } catch (e) {
        // Use timeout to stop infinite recursion if mock channel echoes forever
        // But for this test, we just want to see the hook log.
        console.log("Test finished (ignoring timeouts/errors from mock loop)");
    }

    await agent2.stop();
    if (fs.existsSync(storePath)) fs.unlinkSync(storePath);
}

runDemo().catch(console.error);
