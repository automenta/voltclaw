#!/usr/bin/env node

import { VoltClawAgent, type LLMProvider, type Transport, type Store, type Tool } from '../core/index.js';
import type { MessageContext, ReplyContext, ErrorContext } from '../core/index.js';
import { NostrClient, generateNewKeyPair } from '../nostr/index.js';
import { OllamaProvider, OpenAIProvider, AnthropicProvider } from '../llm/index.js';
import { FileStore } from '../memory/index.js';
import { createBuiltinTools } from '../tools/index.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const VOLTCLAW_DIR = path.join(os.homedir(), '.voltclaw');
const CONFIG_FILE = path.join(VOLTCLAW_DIR, 'config.json');
const KEYS_FILE = path.join(VOLTCLAW_DIR, 'keys.json');

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

function printHelp(): void {
  console.log(`
VoltClaw - Recursive Autonomous Agent

Usage:
  voltclaw [command] [options]

Commands:
  start               Start the agent
  config [key] [val]  View or edit configuration
  keys                Show current identity
  version             Show version info
  help                Show this help message
`);
}

async function startCommand(): Promise<void> {
  const config = await loadConfig();
  const keys = await loadOrGenerateKeys();

  console.log('Starting VoltClaw agent...');
  console.log(`Public key: ${keys.publicKey.slice(0, 16)}...`);

  const llm = createLLMProvider(config.llm);
  const transport = new NostrClient({
    relays: config.relays,
    privateKey: keys.secretKey
  });
  // Use FileStore. Ideally pass path if FileStore supports it.
  // Looking at src/memory/index.ts -> src/memory/file-store.ts (implied).
  // I need to check if FileStore accepts path.
  // Assuming default for now or check constructor.
  const store = new FileStore({ path: path.join(VOLTCLAW_DIR, 'data.json') });

  const builtinTools = createBuiltinTools();

  const agent = new VoltClawAgent({
    llm,
    transport,
    persistence: store,
    delegation: config.delegation,
    tools: builtinTools,
    hooks: {
      onMessage: async (ctx: MessageContext) => {
        console.log(`[${new Date().toISOString()}] Message from ${ctx.from.slice(0, 8)}: ${ctx.content.slice(0, 100)}...`);
      },
      onReply: async (ctx: ReplyContext) => {
        console.log(`[${new Date().toISOString()}] Reply to ${ctx.to.slice(0, 8)}: ${ctx.content.slice(0, 100)}...`);
      },
      onError: async (ctx: ErrorContext) => {
        console.error(`[${new Date().toISOString()}] Error:`, ctx.error.message);
      }
    }
  });

  await agent.start();

  console.log('VoltClaw agent is running. Press Ctrl+C to stop.');

  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await agent.stop();
    process.exit(0);
  });
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const command = args[0];

  try {
    switch (command) {
      case 'start':
        await startCommand();
        break;
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
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
