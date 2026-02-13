import { VoltClawAgent } from 'voltclaw';
import { NostrClient } from '@voltclaw/nostr';
import { OllamaProvider } from '@voltclaw/llm';
import { FileStore } from '@voltclaw/memory';
import { createBuiltinTools } from '@voltclaw/tools';

const llm = new OllamaProvider({
  model: 'llama3.2',
  baseUrl: 'http://localhost:11434'
});

const transport = new NostrClient({
  relays: ['wss://relay.damus.io'],
  privateKey: process.env['NOSTR_PRIVATE_KEY']
});

const store = new FileStore({
  path: '~/.voltclaw/sessions.json'
});

const agent = new VoltClawAgent({
  llm,
  transport,
  persistence: store,
  tools: createBuiltinTools()
});

await agent.start();

const reply = await agent.query('What is 2+2?');
console.log(reply);

await agent.stop();
