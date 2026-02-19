import { NostrClient, resolveToHex } from '../../channels/nostr/index.js';
import { loadConfig, loadOrGenerateKeys } from '../config.js';

export async function dmCommand(to: string, message: string): Promise<void> {
  const config = await loadConfig();
  const keys = await loadOrGenerateKeys();

  const nostrConfig = config.channels?.find(c => c.type === 'nostr');
  const relays = nostrConfig?.relays || ['wss://relay.damus.io'];

  const transport = new NostrClient({
    relays,
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
