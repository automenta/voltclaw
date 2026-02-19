import type { Channel, MessageHandler, EventHandler } from '../core/types.js';

export class CompositeChannel implements Channel {
  public readonly type = 'composite';
  public readonly identity: { publicKey: string };
  private channels: Channel[];

  constructor(channels: Channel[]) {
    if (channels.length === 0) {
      throw new Error('CompositeChannel requires at least one channel');
    }
    this.channels = channels;
    // Use the identity of the first channel as the main identity
    this.identity = channels[0].identity;
  }

  async start(): Promise<void> {
    await Promise.all(this.channels.map(c => c.start()));
  }

  async stop(): Promise<void> {
    await Promise.all(this.channels.map(c => c.stop()));
  }

  async send(to: string, content: string): Promise<void> {
    // Check for prefix (e.g. "telegram:12345")
    // We assume ":" is the separator and the part before it is the channel type.
    const match = to.match(/^([^:]+):(.+)$/);

    if (match) {
      const [_, type, id] = match;

      // Find channel by type
      // Note: If multiple channels have same type, this picks the first one.
      // This might be an issue if we have multiple "nostr" channels.
      // But usually types are distinct (nostr, telegram, discord).
      const channel = this.channels.find(c => c.type === type);

      if (channel) {
        // If the channel is the default one (index 0), we strip the prefix if it was added?
        // But our subscribe logic only adds prefix for non-default channels.
        // So if we receive "nostr:xyz" and nostr is default, it means someone explicitly addressed it?
        // Or maybe we just send "xyz" to it.

        await channel.send(id, content);
        return;
      }
    }

    // Fallback: If no prefix matched (or no prefix present), send to default channel (index 0)
    // This handles the backward compatibility for the primary channel.
    await this.channels[0].send(to, content);
  }

  subscribe(handler: MessageHandler): () => void {
    const unsubscribes = this.channels.map((channel, index) => {
      const isDefault = index === 0;
      return channel.subscribe(async (from, content, meta) => {
        if (isDefault) {
          // Pass through original ID for the default channel
          await handler(from, content, meta);
        } else {
          // Prefix ID with channel type for other channels
          const prefixedFrom = `${channel.type}:${from}`;
          await handler(prefixedFrom, content, meta);
        }
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }

  on(event: 'connected' | 'disconnected' | 'error', handler: EventHandler): void {
    this.channels.forEach(channel => {
      channel.on(event, (...args) => {
        // We propagate events from all channels.
        // We might want to wrap error to indicate which channel it came from,
        // but EventHandler signature is generic.
        handler(...args);
      });
    });
  }
}
