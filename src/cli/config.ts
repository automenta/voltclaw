import { resolveToHex, generateNewKeyPair } from '../channels/nostr/index.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export const VOLTCLAW_DIR = path.join(os.homedir(), '.voltclaw');
export const CONFIG_FILE = path.join(VOLTCLAW_DIR, 'config.json');
export const KEYS_FILE = path.join(VOLTCLAW_DIR, 'keys.json');

export interface CLIConfig {
  relays: string[];
  llm: {
    provider: 'ollama' | 'openai' | 'anthropic';
    model: string;
    baseUrl?: string;
    apiKey?: string;
  };
  call: {
    maxDepth: number;
    maxCalls: number;
    budgetUSD: number;
    timeoutMs: number;
  };
  dlq?: {
    type: 'file' | 'memory';
    path?: string;
    enableTools?: boolean;
  };
  audit?: {
    path?: string;
  };
  persistence?: {
    type: 'sqlite' | 'file';
    path?: string;
  };
  plugins?: string[];
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
  call: {
    maxDepth: 4,
    maxCalls: 25,
    budgetUSD: 0.75,
    timeoutMs: 600000
  },
  dlq: {
    type: 'file',
    path: path.join(VOLTCLAW_DIR, 'dlq.json'),
    enableTools: false
  },
  audit: {
    path: path.join(VOLTCLAW_DIR, 'audit.jsonl')
  },
  persistence: {
    type: 'sqlite',
    path: path.join(VOLTCLAW_DIR, 'voltclaw.db')
  },
  plugins: []
};

export async function loadConfig(): Promise<CLIConfig> {
  try {
    const content = await fs.readFile(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(content) as Partial<CLIConfig>;
    return { ...defaultConfig, ...config };
  } catch {
    return defaultConfig;
  }
}

export async function loadOrGenerateKeys(): Promise<{ publicKey: string; secretKey: string; npub?: string; nsec?: string }> {
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
    return { publicKey: keys.publicKey, secretKey: keys.secretKey, npub: keys.npub, nsec: keys.nsec };
  }
}

export { resolveToHex };
