
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
    if (fs.existsSync(storePath)) fs.unlinkSync(storePath);
    console.log("Demo complete.");
}

runDemo().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
});
