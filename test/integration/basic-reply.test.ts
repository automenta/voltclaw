import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockRelay, MockClient } from '../../src/testing/index.js';

describe('MockRelay', () => {
  let relay: MockRelay;

  beforeEach(async () => {
    relay = new MockRelay(40504);
    await relay.start();
  });

  afterEach(async () => {
    await relay.stop();
  });

  it('starts and stops', () => {
    expect(relay.url).toBe('ws://localhost:40504');
  });

  it('accepts connections', async () => {
    const client = new MockClient();
    await client.connect(relay.url);
    await client.disconnect();
  });
});
