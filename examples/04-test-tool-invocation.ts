import { VoltClawAgent } from '../src/index.js';
import { MemoryStore } from '../src/memory/memory-store.js';

/**
 * Example demonstrating the improved prompt system that prevents tool hallucination.
 * 
 * BEFORE the fix:
 * - Agent would respond: "I have a tool called 'write_file'..."
 * - No actual tool invocation
 * 
 * AFTER the fix:
 * - Agent invokes write_file tool via function calling
 * - Then responds with natural language confirmation
 */

async function main() {
    // Initialize agent with local LLM (requires Ollama running)
    const agent = new VoltClawAgent({
        llm: {
            provider: 'ollama',
            model: 'qwen2.5-coder:7b', // or 'llama3.2', 'mistral', etc.
            baseUrl: 'http://localhost:11434'
        },
        channel: {
            type: 'memory' // In-memory channel for direct queries
        },
        persistence: new MemoryStore()
    });

    await agent.start();

    console.log('=== Testing Tool Invocation (No Hallucination) ===\n');

    // Test 1: Simple file creation
    console.log('Test 1: Create a file');
    console.log('Prompt: "Create a file called test.txt with the content: Hello, World!"');
    console.log('Expected: Tool invocation, not description\n');

    try {
        const response1 = await agent.query(
            'Create a file called test.txt with the content: Hello, World!'
        );
        console.log('Response:', response1);
    } catch (error) {
        console.error('Error:', error);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Test 2: Information gathering
    console.log('Test 2: List directory contents');
    console.log('Prompt: "What files are in the current directory?"');
    console.log('Expected: list_files tool call, then natural language summary\n');

    try {
        const response2 = await agent.query(
            'What files are in the current directory?'
        );
        console.log('Response:', response2);
    } catch (error) {
        console.error('Error:', error);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Test 3: Multi-step task
    console.log('Test 3: Multiple file operations');
    console.log('Prompt: "Create three files: a.txt, b.txt, c.txt with numbers 1, 2, 3"');
    console.log('Expected: Three write_file tool calls\n');

    try {
        const response3 = await agent.query(
            'Create three files: a.txt, b.txt, c.txt with numbers 1, 2, 3 respectively'
        );
        console.log('Response:', response3);
    } catch (error) {
        console.error('Error:', error);
    }

    await agent.stop();

    console.log('\n=== Verification Complete ===');
    console.log('If all tests showed tool invocations (not descriptions), the fix is working!');
}

main().catch(console.error);
