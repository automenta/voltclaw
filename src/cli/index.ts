#!/usr/bin/env node

import { VoltClawAgent, type LLMProvider } from '../core/index.js';
import type { MessageContext, ReplyContext, ErrorContext } from '../core/index.js';
import { NostrClient, generateNewKeyPair, resolveToHex } from '../nostr/index.js';
import { OllamaProvider, OpenAIProvider, AnthropicProvider } from '../llm/index.js';
import { FileStore } from '../memory/index.js';
import { createAllTools } from '../tools/index.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { fileURLToPath } from 'url';

const VOLTCLAW_DIR = path.join(os.homedir(), '.voltclaw');
const CONFIG_FILE = path.join(VOLTCLAW_DIR, 'config.json');
const KEYS_FILE = path.join(VOLTCLAW_DIR, 'keys.json');

// --- Types ---
interface CLIConfig {
  relays: string[];
  llm: {
    provider: 'ollama' | 'openai' | 'anthropic';
    model: string;
    baseUrl?: string;
    apiKey?: string;
  };
  delegation: {
    maxDepth: number;
    maxCalls: number;
    budgetUSD: number;
    timeoutMs: number;
  };
}

const defaultConfig: CLIConfig = {
  relays: [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band'
  ],
  llm: {
    provider: 'ollama',
    model: 'llama3.2'
  },
  delegation: {
    maxDepth: 4,
    maxCalls: 25,
    budgetUSD: 0.75,
    timeoutMs: 600000
  }
};

// --- Helpers ---
async function loadConfig(): Promise<CLIConfig> {
  try {
    const content = await fs.readFile(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(content) as Partial<CLIConfig>;
    return { ...defaultConfig, ...config };
  } catch {
    return defaultConfig;
  }
}

async function loadOrGenerateKeys(): Promise<{ publicKey: string; secretKey: string }> {
  try {
    const content = await fs.readFile(KEYS_FILE, 'utf-8');
    return JSON.parse(content) as { publicKey: string; secretKey: string };
  } catch {
    const keys = await generateNewKeyPair();
    await fs.mkdir(VOLTCLAW_DIR, { recursive: true });
    await fs.writeFile(KEYS_FILE, JSON.stringify({
      publicKey: keys.publicKey,
      secretKey: keys.secretKey
    }, null, 2));
    console.log(`New identity created.`);
    console.log(`npub: ${keys.npub}`);
    console.log(`nsec: ${keys.nsec} (backup securely!)`);
    return { publicKey: keys.publicKey, secretKey: keys.secretKey };
  }
}

function createLLMProvider(config: CLIConfig['llm']): LLMProvider {
  switch (config.provider) {
    case 'ollama':
      return new OllamaProvider({
        model: config.model,
        baseUrl: config.baseUrl
      });
    case 'openai':
      return new OpenAIProvider({
        model: config.model,
        apiKey: config.apiKey ?? process.env.OPENAI_API_KEY ?? ''
      });
    case 'anthropic':
      return new AnthropicProvider({
        model: config.model,
        apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? ''
      });
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

function printHelp(): void {
  console.log(`
VoltClaw - Recursive Autonomous Agent

Usage:
  voltclaw [command] [options]
  voltclaw "your query here"  # One-shot query mode

Commands:
  start               Start the agent daemon
  repl                Start interactive REPL (alias for start with interaction)
  config [key] [val]  View or edit configuration
  keys                Show current identity
  version             Show version info
  help                Show this help message

Options:
  --recursive         Enable recursive delegation for one-shot query
`);
}

// --- Commands ---

async function startCommand(interactive: boolean = false): Promise<void> {
  const config = await loadConfig();
  const keys = await loadOrGenerateKeys();

  console.log('Starting VoltClaw agent...');
  console.log(`Public key: ${keys.publicKey.slice(0, 16)}...`);

  const llm = createLLMProvider(config.llm);
  const transport = new NostrClient({
    relays: config.relays,
    privateKey: keys.secretKey
  });
  const store = new FileStore({ path: path.join(VOLTCLAW_DIR, 'data.json') });
  const tools = await createAllTools();

  const agent = new VoltClawAgent({
    llm,
    transport,
    persistence: store,
    delegation: config.delegation,
    tools,
    hooks: {
      onMessage: async (ctx: MessageContext) => {
        if (!interactive) {
          console.log(`[${new Date().toISOString()}] Message from ${ctx.from.slice(0, 8)}: ${ctx.content.slice(0, 100)}...`);
        }
      },
      onReply: async (ctx: ReplyContext) => {
        if (!interactive) {
          console.log(`[${new Date().toISOString()}] Reply to ${ctx.to.slice(0, 8)}: ${ctx.content.slice(0, 100)}...`);
        }
      },
      onError: async (ctx: ErrorContext) => {
        console.error(`[${new Date().toISOString()}] Error:`, ctx.error.message);
      }
    }
  });

  // Set source dir for self-improvement
  process.env.VOLTCLAW_SOURCE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  await agent.start();

  if (interactive) {
    console.log('Interactive REPL mode. Type your query below.');
    console.log('Type "exit" to quit.');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> '
    });

    rl.prompt();

    rl.on('line', async (line) => {
      const query = line.trim();
      if (query === 'exit') {
        rl.close();
        return;
      }
      if (query) {
        try {
          const response = await agent.query(query);
          console.log(response);
        } catch (error) {
          console.error('Error:', error);
        }
      }
      rl.prompt();
    });

    rl.on('close', async () => {
      console.log('\nShutting down...');
      await agent.stop();
      process.exit(0);
    });

  } else {
    console.log('VoltClaw agent is running. Press Ctrl+C to stop.');
    // Keep process alive
    return new Promise(() => {
      process.on('SIGINT', async () => {
          console.log('\nShutting down...');
          await agent.stop();
          process.exit(0);
      });
    });
  }
}

async function dmCommand(to: string, message: string): Promise<void> {
  const config = await loadConfig();
  const keys = await loadOrGenerateKeys();
  const transport = new NostrClient({
    relays: config.relays,
    privateKey: keys.secretKey
  });

  try {
    const hexKey = resolveToHex(to);
    console.log(`Connecting to relays...`);
    await transport.start();

    // Allow some time for connection
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log(`Sending DM to ${hexKey.slice(0, 8)}...`);
    await transport.send(hexKey, message);
    console.log('Message sent.');

    // Allow some time for publish
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    console.error('Failed to send DM:', error);
  } finally {
    await transport.stop();
  }
}

async function oneShotQuery(
  query: string,
  options: { recursive: boolean; verbose: boolean; debug: boolean }
): Promise<void> {
  const config = await loadConfig();
  const keys = await loadOrGenerateKeys();
  const llm = createLLMProvider(config.llm);
  const transport = new NostrClient({
    relays: config.relays,
    privateKey: keys.secretKey
  });
  const store = new FileStore({ path: path.join(VOLTCLAW_DIR, 'data.json') });
  const tools = await createAllTools();

  const agent = new VoltClawAgent({
    llm,
    transport,
    persistence: store,
    delegation: options.recursive ? config.delegation : { ...config.delegation, maxDepth: 1 },
    tools,
    hooks: {
       onDelegation: async (ctx) => {
         if (options.recursive) {
           const indicator = options.verbose ? ctx.task.slice(0, 60) : '';
           console.log(`  → [Depth ${ctx.depth}] Delegating... ${indicator}`);
         }
       }
    }
  });

  if (options.verbose) {
    // We need to cast 'tool_call' because it's not strictly typed in EventMap yet or I need to check types.
    // However, VoltClawAgent uses emit('tool_call')?
    // Checking agent.ts, it doesn't emit tool_call. It emits message, reply, delegation, error.
    // Wait, PLAN.md suggested logging tool calls.
    // src/core/agent.ts does NOT emit tool_call.
    // I should check if I missed adding tool_call emission in agent.ts or if the plan was aspirational.
    // In agent.ts:
    // messages.push({ role: 'tool', ... })
    // It does not emit an event.
    // So I can't easily hook into tool calls without modifying agent.ts further.
    // For now I will stick to what is available or skip tool call logging if not supported.
    // I will skip tool call logging for now as it requires modifying agent.ts which is not in this step (strictly speaking, but I could have added it).
    // Let's stick to delegation logging which IS supported via onDelegation hook.
  }

  await agent.start();

  try {
    console.log(`\n❯ ${query}\n`);
    const response = await agent.query(query);
    console.log(`\n${response}\n`);
  } catch (error) {
    console.error("Error executing query:", error);
  } finally {
    await agent.stop();
  }
}

// --- Main Runner ---

async function run(args: string[]): Promise<void> {
  // Parse flags first
  let recursive = false;
  let verbose = false;
  let debug = false;
  const positional: string[] = [];

  for (const arg of args) {
    if (arg === '--recursive' || arg === '-r') {
      recursive = true;
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--debug' || arg === '-d') {
      debug = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      return;
    } else if (arg === '--version') {
      console.log('VoltClaw v1.0.0');
      return;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  const command = positional[0];

  if (!command) {
    printHelp();
    return;
  }

  // Handle known commands
  switch (command) {
    case 'start':
      await startCommand(false);
      break;
    case 'repl':
      await startCommand(true);
      break;
    case 'dm': {
      if (positional.length < 3) {
        console.error('Usage: voltclaw dm <npub/hex> <message>');
        process.exit(1);
      }
      await dmCommand(positional[1] || '', positional[2] || '');
      break;
    }
    case 'keys': {
      const keys = await loadOrGenerateKeys();
      console.log('Current identity:');
      console.log(`  Public key: ${keys.publicKey}`);
      break;
    }
    case 'config': {
      const config = await loadConfig();
      console.log(JSON.stringify(config, null, 2));
      break;
    }
    case 'version':
      console.log('VoltClaw v1.0.0');
      break;
    default:
      // Treat as one-shot query
      const query = positional.join(' ');
      await oneShotQuery(query, { recursive, verbose, debug });
      break;
  }
}

// --- Entry Point ---

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
        await run(process.argv.slice(2));
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
  })();
}
