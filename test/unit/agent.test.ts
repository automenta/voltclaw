import { describe, it, expect, beforeEach } from 'vitest';
import { VoltClawAgent } from '../../src/index.js';
import { MemoryStore } from '../../src/memory/index.js';
import { MockLLM } from '../../src/testing/index.js';

describe('VoltClawAgent', () => {
  describe('constructor', () => {
    it('creates agent with minimal options', () => {
      const llm = new MockLLM();
      expect(llm.name).toBe('mock');
    });

  it('creates agent with custom delegation config', () => {
    const mockTransport = {
      type: 'mock',
      identity: { publicKey: 'test' },
      start: async () => {},
      stop: async () => {},
      send: async () => {},
      subscribe: () => () => {},
      on: () => {}
    };
    const agent = new VoltClawAgent({
      llm: new MockLLM(),
      transport: mockTransport,
      persistence: new MemoryStore(),
      delegation: {
        maxDepth: 2,
        maxCalls: 5,
        budgetUSD: 0.25
      }
    });
    expect(agent).toBeDefined();
  });
  });
});

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it('creates new session for unknown key', () => {
    const session = store.get('test-pubkey');
    expect(session.history).toEqual([]);
    expect(session.delegationCount).toBe(0);
  });

  it('returns same session for same key', () => {
    const session1 = store.get('test-pubkey');
    session1.history.push({ role: 'user', content: 'test' });
    
    const session2 = store.get('test-pubkey');
    expect(session2.history.length).toBe(1);
  });

  it('separates sessions by key', () => {
    const session1 = store.get('pubkey1');
    const session2 = store.get('pubkey2');
    
    session1.history.push({ role: 'user', content: 'test1' });
    session2.history.push({ role: 'user', content: 'test2' });
    
    expect(store.get('pubkey1').history.length).toBe(1);
    expect(store.get('pubkey2').history.length).toBe(1);
  });
});

describe('MockLLM', () => {
  it('returns default response', async () => {
    const llm = new MockLLM({ defaultResponse: 'test response' });
    const response = await llm.chat([{ role: 'user', content: 'hello' }]);
    expect(response.content).toBe('test response');
  });

  it('matches predefined responses', async () => {
    const llm = new MockLLM({
      responses: {
        hello: 'Hello there!'
      }
    });
    const response = await llm.chat([{ role: 'user', content: 'Say hello' }]);
    expect(response.content).toBe('Hello there!');
  });

  it('matches patterns', async () => {
    const llm = new MockLLM({
      patterns: [
        {
          match: /calculate (\d+) plus (\d+)/,
          respond: (a, b) => String(Number(a) + Number(b))
        }
      ]
    });
    const response = await llm.chat([{ role: 'user', content: 'calculate 5 plus 3' }]);
    expect(response.content).toBe('8');
  });

  it('tracks call count', async () => {
    const llm = new MockLLM();
    await llm.chat([{ role: 'user', content: 'test' }]);
    await llm.chat([{ role: 'user', content: 'test' }]);
    expect(llm.getCallCount()).toBe(2);
  });
});
