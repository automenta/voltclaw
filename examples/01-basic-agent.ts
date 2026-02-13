import { VoltClawAgent } from 'voltclaw';
import { MemoryStore } from '@voltclaw/memory';
import { MockLLM } from '@voltclaw/testing';

const llm = new MockLLM({
  responses: {
    hello: 'Hello! How can I help you?',
    status: 'All systems operational.'
  },
  defaultResponse: 'I understand. Let me help you with that.'
});

const agent = new VoltClawAgent({
  llm,
  persistence: new MemoryStore()
});

const reply = await agent.query('Hello there!');
console.log(reply);
