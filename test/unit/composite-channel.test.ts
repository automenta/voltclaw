import { describe, it, expect, vi } from 'vitest';
import { CompositeChannel } from '../../src/channels/composite.js';
import type { Channel, MessageMeta } from '../../src/core/types.js';

class MockChannel implements Channel {
  type: string;
  identity = { publicKey: 'mock' };
  sent: [string, string][] = [];
  handler?: (from: string, content: string, meta: MessageMeta) => Promise<void>;

  constructor(type: string) {
    this.type = type;
  }

  async start() {}
  async stop() {}
  async send(to: string, content: string) {
    this.sent.push([to, content]);
  }
  subscribe(handler: any) {
    this.handler = handler;
    return () => {};
  }
  on() {}

  // Helper to simulate incoming message
  async receive(from: string, content: string) {
    if (this.handler) {
      await this.handler(from, content, { timestamp: Date.now() });
    }
  }
}

describe('CompositeChannel', () => {
  it('should route messages to correct channel based on prefix', async () => {
    const nostr = new MockChannel('nostr');
    const telegram = new MockChannel('telegram');
    const composite = new CompositeChannel([nostr, telegram]);

    await composite.send('telegram:123', 'Hello Telegram');
    expect(telegram.sent).toEqual([['123', 'Hello Telegram']]);
    expect(nostr.sent).toHaveLength(0);

    await composite.send('nostr:abc', 'Hello Nostr');
    expect(nostr.sent).toEqual([['abc', 'Hello Nostr']]);

    // Default fallback (first channel)
    await composite.send('xyz', 'Default');
    expect(nostr.sent).toHaveLength(2);
    expect(nostr.sent[1]).toEqual(['xyz', 'Default']);
  });

  it('should prefix incoming messages from non-default channels', async () => {
    const nostr = new MockChannel('nostr');
    const telegram = new MockChannel('telegram');
    const composite = new CompositeChannel([nostr, telegram]);

    const received: [string, string][] = [];
    composite.subscribe(async (from, content) => {
      received.push([from, content]);
    });

    // Default channel (nostr) - no prefix
    await nostr.receive('npub1', 'Hi');
    expect(received[0]).toEqual(['npub1', 'Hi']);

    // Secondary channel (telegram) - with prefix
    await telegram.receive('12345', 'Yo');
    expect(received[1]).toEqual(['telegram:12345', 'Yo']);
  });
});
