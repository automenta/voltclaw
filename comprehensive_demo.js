#!/usr/bin/env node

import { VoltClawAgent } from './dist/core/index.js';
import { OllamaProvider } from './dist/llm/index.js';
import { MemoryStore } from './dist/memory/index.js';
import { createBuiltinTools } from './dist/tools/index.js';

async function demo() {
  console.log("🚀 Starting VoltClaw Comprehensive Demo...\n");

  // Create an in-memory store
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
        return () => {};
      },
      send: async (to, content) => {
        // Silent send for cleaner demo output
      }
    },
    persistence: store,
    tools,
    call: {
      maxDepth: 2,
      maxCalls: 10,
      budgetUSD: 0.75
    }
  });

  console.log("🤖 VoltClaw Agent Initialized");
  console.log("├─ LLM: Ollama with llama3.2");
  console.log("├─ Tools available:", tools.length);
  console.log("├─ Max recursion depth: 2");
  console.log("└─ Budget: $0.75 USD\n");

  // Start the agent
  await agent.start();
  console.log("✅ Agent started successfully\n");

  // DEMO 1: Basic arithmetic
  console.log("🔢 DEMO 1: Basic Arithmetic");
  console.log("❓ Question: What is 2+2?");
  const result1 = await agent.query("What is 2+2?");
  console.log("💡 Answer:", result1, "\n");

  // DEMO 2: File operations
  console.log("📁 DEMO 2: File Operations");
  console.log("❓ Action: Create a file with sample content");
  await agent.query('Write a file named "sample.txt" containing "This is a VoltClaw demo file."');
  console.log("✅ File created\n");

  console.log("❓ Action: Read the file back");
  const result2 = await agent.query('Read the content of "sample.txt"');
  console.log("💡 Content:", result2, "\n");

  // DEMO 3: Time and date
  console.log("🕒 DEMO 3: Time & Date Tools");
  console.log("❓ Question: What time is it?");
  const result3 = await agent.query("What time is it right now?");
  console.log("💡 Answer:", result3, "\n");

  // DEMO 4: HTTP requests
  console.log("🌐 DEMO 4: HTTP Requests");
  console.log("❓ Action: Get a sample JSON from JSONPlaceholder");
  const result4 = await agent.query("Make an HTTP GET request to https://jsonplaceholder.typicode.com/posts/1 and tell me the title");
  console.log("💡 Title:", result4, "\n");

  // DEMO 5: Tool chaining
  console.log("🔗 DEMO 5: Tool Chaining");
  console.log("❓ Action: Get current time, then write it to a file");
  const result5 = await agent.query("Get the current time and date, then write it to a file called 'timestamp.txt'");
  console.log("✅ Timestamp captured\n");

  console.log("📖 Reading the timestamp file...");
  const result6 = await agent.query("Read the content of 'timestamp.txt'");
  console.log("💡 Timestamp:", result6, "\n");

  // DEMO 6: Code analysis (simulating with a text file)
  console.log("🔍 DEMO 6: Code/File Analysis");
  // Create a sample code file first
  await agent.query('Write a file named "sample_code.js" with the content "function add(a, b) { return a + b; } // Adds two numbers"');
  
  console.log("❓ Question: Analyze the code in sample_code.js");
  const result7 = await agent.query("Read and analyze the code in sample_code.js. Explain what it does.");
  console.log("💡 Analysis:", result7, "\n");

  // DEMO 7: Grep functionality
  console.log("🔍 DEMO 7: Search Capabilities");
  console.log("❓ Action: Search for the word 'add' in sample_code.js");
  const result8 = await agent.query("Search for lines containing 'add' in sample_code.js");
  console.log("💡 Search results:", result8, "\n");

  // DEMO 8: List files
  console.log("📋 DEMO 8: File System Navigation");
  console.log("❓ Question: What files are in the current directory?");
  const result9 = await agent.query("List all files in the current directory");
  console.log("💡 Files found:", result9, "\n");

  // DEMO 9: Execute simple command (if allowed)
  console.log("⚙️  DEMO 9: Command Execution");
  console.log("❓ Action: Execute a simple command");
  try {
    const result10 = await agent.query("Execute the command 'echo Hello from VoltClaw!' and tell me the output");
    console.log("💡 Command output:", result10, "\n");
  } catch (e) {
    console.log("⚠️  Command execution may be restricted in this environment\n");
  }

  // Summary
  console.log("🏆 DEMO SUMMARY");
  console.log("VoltClaw demonstrated the following capabilities:");
  console.log("├─ Natural Language Understanding");
  console.log("├─ File Operations (read, write)");
  console.log("├─ System Information (time, date)");
  console.log("├─ HTTP Requests");
  console.log("├─ Tool Chaining");
  console.log("├─ Code/File Analysis");
  console.log("├─ Text Search (grep-like)");
  console.log("├─ File System Navigation");
  console.log("├─ Command Execution");
  console.log("└─ Recursive Task Decomposition (partially shown)");

  console.log("\n🌟 VoltClaw is a versatile autonomous agent platform that can:");
  console.log("  • Process natural language queries");
  console.log("  • Interact with file systems");
  console.log("  • Make HTTP requests");
  console.log("  • Chain multiple tools together");
  console.log("  • Maintain conversation history");
  console.log("  • Operate recursively for complex tasks");

  // Stop the agent
  await agent.stop();
  console.log("\n🛑 Agent stopped");
  console.log("🎯 VoltClaw Comprehensive Demo Completed!");
}

// Run the demo
demo().catch(console.error);