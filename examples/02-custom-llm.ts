import { VoltClawAgent } from 'voltclaw';
import { OpenAIProvider } from '@voltclaw/llm';
import { MemoryStore } from '@voltclaw/memory';

const agent = new VoltClawAgent({
  llm: new OpenAIProvider({
    model: 'gpt-4o',
    apiKey: process.env['OPENAI_API_KEY']
  }),
  persistence: new MemoryStore(),
  delegation: {
    maxDepth: 4,
    maxCalls: 25,
    budgetUSD: 1.00
  }
});
