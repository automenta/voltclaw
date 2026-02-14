import { VoltClawAgent, type LLMProvider, type MessageContext, type ReplyContext, type ErrorContext } from '../../core/index.js';
import { NostrClient } from '../../nostr/index.js';
import { OllamaProvider, OpenAIProvider, AnthropicProvider } from '../../llm/index.js';
import { FileStore } from '../../memory/index.js';
import { createAllTools } from '../../tools/index.js';
import { loadConfig, loadOrGenerateKeys, VOLTCLAW_DIR } from '../config.js';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

// --- Helpers ---
// Ideally these would be shared but for now we duplicate or refactor CLI logic later.
// I will create a config.ts first to share these.

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

export async function startCommand(interactive: boolean = false): Promise<void> {
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
    call: config.call,
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
  // We need to resolve import.meta.url carefully if this file moves
  // Assuming src/cli/commands/start.ts -> up two levels -> src/cli -> up one -> src -> up one -> root
  // Wait, current file is src/cli/commands/start.ts
  // root is ../../..

  // Actually, let's keep it simple. If running from dist/cli/commands/start.js
  // dist/cli/commands/start.js -> .. -> dist/cli -> .. -> dist -> .. -> root
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  process.env.VOLTCLAW_SOURCE_DIR = path.resolve(currentDir, '../../..');

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
