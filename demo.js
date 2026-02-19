#!/usr/bin/env node

import { VoltClawAgent } from './dist/core/index.js';
import { OllamaProvider } from './dist/llm/index.js';
import { MemoryStore } from './dist/memory/index.js';
import { createBuiltinTools } from './dist/tools/index.js';

async function demo() {
  console.log("🚀 Starting VoltClaw Demo...\n");

  // Create an in-memory store instead of file store to avoid Nostr issues
  const store = new MemoryStore();
  
  // Create Ollama provider
  const llm = new OllamaProvider({
    model: 'llama3.2',
    baseUrl: 'http://localhost:11434'
  });

  // Get all built-in tools
  const tools = createBuiltinTools();
  
  // Create agent with minimal configuration
  const agent = new VoltClawAgent({
    llm,
    channel: {
      // Simple mock channel for demonstration
      identity: { publicKey: 'mock-key' },
      start: async () => {},
      stop: async () => {},
      subscribe: (handler) => {
        // Return a dummy unsubscribe function
        return () => {};
      },
      send: async (to, content) => {
        console.log(`📤 Sent to ${to}:`, content.substring(0, 100) + (content.length > 100 ? '...' : ''));
      }
    },
    persistence: store,
    tools,
    call: {
      maxDepth: 2,  // Limit depth for demo
      maxCalls: 10,
      budgetUSD: 0.75
    }
  });

  console.log("🤖 Agent initialized with Ollama and built-in tools");
  console.log("- Available tools:", tools.map(t => t.name).join(", "));
  console.log("- LLM Provider: Ollama with llama3.2 model\n");

  // Start the agent
  await agent.start();
  console.log("✅ Agent started\n");

  // Demonstrate simple query
  console.log("💬 Asking: What is 2+2?");
  try {
    const result = await agent.query("What is 2+2?");
    console.log("📝 Response:", result, "\n");
  } catch (error) {
    console.error("❌ Error in simple query:", error.message);
  }

  // Demonstrate file operations
  console.log("📝 Writing a test file...");
  try {
    const writeResult = await agent.query('Write a file named "demo.txt" with the content "Hello VoltClaw Demo!"');
    console.log("📝 Write response:", writeResult);
    
    console.log("\n📖 Reading the test file back...");
    const readResult = await agent.query('Read the content of "demo.txt"');
    console.log("📖 Read response:", readResult);
  } catch (error) {
    console.error("❌ Error in file operations:", error.message);
  }

  // Demonstrate recursive capability with a simple task
  console.log("\n🔄 Demonstrating recursive capability:");
  console.log("Asking agent to break down a simple task into subtasks...");
  try {
    const recursiveResult = await agent.query("Calculate 2+2 and 3+3 separately, then add the results together. Use sub-agents for each calculation.");
    console.log("📝 Recursive response:", recursiveResult);
  } catch (error) {
    console.error("❌ Error in recursive query:", error.message);
  }

  // Stop the agent
  await agent.stop();
  console.log("\n🛑 Agent stopped");
  console.log("🎯 VoltClaw Demo Completed!");
}

// Run the demo
demo().catch(console.error);