#!/usr/bin/env node

import { VoltClawAgent, type LLMProvider, type Transport, type Store, type Tool } from 'voltclaw';
import type { VoltClawAgentOptions, MessageContext, ReplyContext, ErrorContext } from 'voltclaw';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { generateSecretKey, getPublicKey, nip19, finalizeEvent, nip04 } from 'nostr-tools';
import { RelayPool } from 'nostr-relaypool';
import { useWebSocketImplementation } from 'nostr-tools/pool';
import WebSocket from 'ws';

useWebSocketImplementation(WebSocket);

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
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const keys = {
      publicKey: pk,
      secretKey: Buffer.from(sk).toString('hex'),
      npub: nip19.npubEncode(pk),
      nsec: nip19.nsecEncode(sk)
    };
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
  
  const llm = createOllamaProvider(config.llm);
  const transport = createNostrTransport(config.relays, keys.secretKey);
  const store = createFileStore();

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

function createOllamaProvider(config: CLIConfig['llm']): LLMProvider {
  const baseUrl = config.baseUrl ?? 'http://localhost:11434';
  return {
    name: 'ollama',
    model: config.model,
    supportsTools: true,
    async chat(messages, options) {
      const toolDefs = options?.tools?.map(t => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: { type: 'object' as const, properties: {} } }
      }));
      
      const body: Record<string, unknown> = {
        model: config.model,
        messages: messages.map(m => ({ role: m.role, content: m.content ?? '' })),
        stream: false
      };
      
      if (toolDefs?.length) body['tools'] = toolDefs;
      
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
      const data = await res.json() as { message?: { content?: string } };
      return { content: data.message?.content ?? '' };
    },
    countTokens(text: string) {
      return Math.ceil(text.length / 4);
    }
  };
}

function createNostrTransport(relays: string[], privateKey: string): Transport {
  let secretKey: Uint8Array;
  if (privateKey.startsWith('nsec')) {
    const decoded = nip19.decode(privateKey);
    if (decoded.type === 'nsec') {
      secretKey = decoded.data;
    } else {
      throw new Error('Invalid nsec key');
    }
  } else {
    secretKey = Uint8Array.from(Buffer.from(privateKey, 'hex'));
  }
  const publicKey = getPublicKey(secretKey);
  
  const pool = new RelayPool();
  for (const relay of relays) {
    pool.addOrGetRelay(relay);
  }
  
  const eventHandlers = new Map<string, Set<(...args: unknown[]) => void>>();
  
  return {
    type: 'nostr',
    identity: { publicKey },
    async start() {
      eventHandlers.get('connected')?.forEach(h => h());
    },
    async stop() {
      for (const relay of pool.relayByUrl.keys()) {
        pool.removeRelay(relay);
      }
    },
    async send(to: string, content: string) {
      const encrypted = await nip04.encrypt(secretKey, to, content);
      const ev = finalizeEvent({
        kind: 4,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', to]],
        content: encrypted
      }, secretKey);
      pool.publish(ev, Array.from(pool.relayByUrl.keys()));
    },
    subscribe(handler) {
      const unsub = pool.subscribe(
        [{ kinds: [4], '#p': [publicKey] }],
        Array.from(pool.relayByUrl.keys()),
        async (event: unknown) => {
          const ev = event as { id: string; pubkey: string; content: string; created_at: number; kind: number; tags: string[][] };
          try {
            const decrypted = await nip04.decrypt(secretKey, ev.pubkey, ev.content);
            await handler(ev.pubkey, decrypted, { eventId: ev.id, timestamp: ev.created_at, kind: ev.kind, tags: ev.tags });
          } catch {
            // Ignore decrypt errors
          }
        }
      );
      return unsub;
    },
    on(event, handler) {
      if (!eventHandlers.has(event)) eventHandlers.set(event, new Set());
      eventHandlers.get(event)!.add(handler);
    }
  };
}

function createFileStore(): Store {
  const data: Record<string, ReturnType<Store['get']>> = {};
  return {
    get(key: string, _isSelf = false) {
      if (!data[key]) {
        data[key] = {
          history: [],
          delegationCount: 0,
          estCostUSD: 0,
          actualTokensUsed: 0,
          subTasks: {},
          depth: 0,
          topLevelStartedAt: 0
        };
      }
      return data[key];
    },
    getAll() {
      return { ...data };
    },
    async load() {},
    async save() {},
    clear() {
      Object.keys(data).forEach(k => delete data[k]);
    }
  };
}

function createBuiltinTools(): Tool[] {
  return [
    {
      name: 'get_time',
      description: 'Get the current UTC time',
      execute: async () => ({ time: new Date().toISOString() })
    }
  ];
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
