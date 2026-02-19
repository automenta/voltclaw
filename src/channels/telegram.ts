import { Telegraf } from 'telegraf';
import type { Channel, MessageHandler, EventHandler, MessageMeta } from '../../core/types.js';

export interface TelegramConfig {
  token: string;
}

export class TelegramChannel implements Channel {
  public readonly type = 'telegram';
  public readonly identity: { publicKey: string };
  private bot: Telegraf;
  private messageHandler?: MessageHandler;
  private eventHandlers: Map<string, EventHandler[]> = new Map();

  constructor(config: TelegramConfig) {
    this.bot = new Telegraf(config.token);
    // Identity is just the bot's username (fetched on start)
    this.identity = { publicKey: 'telegram-bot' };
  }

  async start(): Promise<void> {
    try {
      const me = await this.bot.telegram.getMe();
      this.identity.publicKey = me.username;

      this.bot.on('text', async (ctx) => {
        if (!this.messageHandler) return;

        // Use Chat ID as 'from' to maintain session per chat
        const from = String(ctx.chat.id);
        const content = ctx.message.text;

        // Metadata specific to Telegram
        const meta: MessageMeta = {
          timestamp: ctx.message.date * 1000,
          kind: 1, // Treat as normal message
          tags: [
            ['platform', 'telegram'],
            ['chat_id', String(ctx.chat.id)],
            ['user_id', String(ctx.message.from.id)],
            ['username', ctx.message.from.username || 'unknown']
          ]
        };

        // Note: We ignore commands unless they are explicitly for the bot?
        // Or handle everything.
        // For now, handle everything.

        await this.messageHandler(from, content, meta);
      });

      // Launch without awaiting because it blocks?
      // No, launch returns a promise that resolves when started?
      // Actually launch() returns Promise<void> but waits for stop signal?
      // Wait, telegraf.launch() keeps running.
      // We should not await it fully if it blocks.

      this.bot.launch(() => {
          this.emit('connected');
      }).catch(err => {
          this.emit('error', err);
      });

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.bot.stop();
    this.emit('disconnected');
  }

  async send(to: string, content: string): Promise<void> {
    try {
        // 'to' is expected to be the chat_id
        await this.bot.telegram.sendMessage(to, content);
    } catch (error) {
        // this.emit('error', error); // Avoid emitting on send errors to prevent loops?
        console.error('Telegram send error:', error);
    }
  }

  subscribe(handler: MessageHandler): () => void {
    this.messageHandler = handler;
    return () => {
      this.messageHandler = undefined;
    };
  }

  on(event: 'connected' | 'disconnected' | 'error', handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler as EventHandler);
  }

  private emit(event: string, ...args: unknown[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(h => h(...args));
    }
  }
}
