import { VoltClawAgent, type LLMProvider, type MessageContext, type ReplyContext, type ErrorContext } from '../../core/index.js';
import { OllamaProvider, OpenAIProvider, AnthropicProvider } from '../../llm/index.js';
import { FileStore } from '../../memory/index.js';
import { SQLiteStore } from '../../memory/sqlite.js';
import { createAllTools } from '../../tools/index.js';
import { loadConfig, loadOrGenerateKeys, VOLTCLAW_DIR, CONFIG_FILE } from '../config.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import React from 'react';
import { render } from 'ink';
import { App } from '../ui/index.js';

// --- Helpers ---

function createLLMProvider(config: any): LLMProvider {
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

async function checkLLMConnection(config: any): Promise<boolean> {
  if (config.provider === 'ollama') {
    const baseUrl = config.baseUrl || 'http://localhost:11434';
    try {
      const res = await fetch(`${baseUrl}/api/version`);
      if (!res.ok) throw new Error('Not OK');
      return true;
    } catch (e) {
      console.error(`\n❌ Error: Could not connect to Ollama at ${baseUrl}`);
      console.error('   Please ensure Ollama is running: `ollama serve`');
      console.error('   Or update your config with `voltclaw configure`\n');
      return false;
    }
  }
  return true;
}

export async function startCommand(interactive: boolean = false, demo: boolean = false): Promise<void> {
  if (demo) {
      console.clear();
      const { waitUntilExit } = render(React.createElement(App, { demoMode: true }));
      await waitUntilExit();
      return;
  }

  try {
    await fs.stat(CONFIG_FILE);
  } catch {
    console.warn('\n⚠️  Configuration file not found. Running with defaults.');
    console.warn('   Run `voltclaw configure` to set up your environment.\n');
  }

  const config = await loadConfig();
  const keys = await loadOrGenerateKeys();

  if (!interactive) {
      console.log('Starting VoltClaw agent...');
      console.log(`Public key: ${keys.publicKey.slice(0, 16)}...`);
  }

  if (!(await checkLLMConnection(config.llm))) {
    process.exit(1);
  }

  const llm = createLLMProvider(config.llm);

  const channels = (config.channels || [{ type: 'nostr' }]).map(c => {
    if (c.type === 'nostr' && !c.privateKey) {
      return { ...c, privateKey: keys.secretKey };
    }
    return c;
  });

  if (channels.length === 0) {
      if (!interactive) console.log('No external channels configured. Using Stdio (console) channel.');
      channels.push({ type: 'stdio' });
  }

  let store: import('../../core/types.js').Store;

  if (config.persistence?.type === 'sqlite') {
    store = new SQLiteStore({ path: config.persistence.path });
  } else {
    const storePath = config.persistence?.path ?? path.join(VOLTCLAW_DIR, 'data.json');
    store = new FileStore({ path: storePath });
  }

  const tools = await createAllTools();

  // Approval Bridge for Ink UI interaction
  const approvalBridge = {
      requestApproval: async (tool: string, args: any): Promise<boolean> => {
          // This will be overridden by App component in interactive mode
          return true;
      }
  };

  const agent = new VoltClawAgent({
    llm,
    channel: channels,
    persistence: store,
    call: config.call,
    history: config.history,
    plugins: config.plugins,
    tools,
    errors: config.errors,
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
        if (!interactive) {
            console.error(`[${new Date().toISOString()}] Error:`, ctx.error.message);
        }
      },
      onToolApproval: interactive ? async (tool, args) => {
        return approvalBridge.requestApproval(tool, args);
      } : undefined
    }
  });

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  process.env.VOLTCLAW_SOURCE_DIR = path.resolve(currentDir, '../../..');

  await agent.start();

  if (interactive) {
    // Render Ink App
    console.clear();
    const { waitUntilExit } = render(React.createElement(App, { agent, store, approvalBridge, demoMode: false }));
    await waitUntilExit();
    await agent.stop();
    process.exit(0);
  } else {
    console.log('VoltClaw agent is running. Press Ctrl+C to stop.');
    return new Promise(() => {
      process.on('SIGINT', async () => {
          console.log('\nShutting down...');
          await agent.stop();
          process.exit(0);
      });
    });
  }
}
