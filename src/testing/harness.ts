import { VoltClawAgent, type VoltClawAgentOptions, type LLMProvider, type Transport, type Store, type Session, type Tool, type ChatMessage, type ChatResponse, type ChatOptions, type Unsubscribe, type MessageMeta } from 'voltclaw';
import { MockRelay, MockClient } from './mock-relay.js';
import { MockLLM, createMockLLM, type MockLLMConfig } from './mock-llm.js';
import { generateSecretKey, getPublicKey, finalizeEvent, nip04 } from 'nostr-tools';
import { RelayPool } from 'nostr-relaypool';

export interface TestHarnessConfig {
  llm?: MockLLMConfig | MockLLM;
  relayPort?: number;
  delegation?: VoltClawAgentOptions['delegation'];
}

export class TestHarness {
  public agent: VoltClawAgent;
  public llm: MockLLM;
  public relay: MockRelay;
  public client: MockClient;
  
  private isRunning = false;
  private agentPubkey: string = '';

  constructor(config: TestHarnessConfig = {}) {
    this.relay = new MockRelay(config.relayPort ?? 40404);
    this.llm = config.llm instanceof MockLLM
      ? config.llm
      : createMockLLM(config.llm ?? {});
    this.client = new MockClient();

    const testKey = generateTestKey();
    this.agentPubkey = getPublicKey(testKey);

    const transport = createNostrTransport(this.relay.url, testKey);
    const store = createMemoryStore();

    this.agent = new VoltClawAgent({
      llm: this.llm,
      transport,
      persistence: store,
      delegation: config.delegation ?? {
        maxDepth: 2,
        maxCalls: 5,
        budgetUSD: 0.50
      },
      tools: [
        {
          name: 'get_time',
          description: 'Get current time',
          execute: async () => ({ time: new Date().toISOString() })
        }
      ]
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    await this.relay.start();
    await this.agent.start();
    await this.client.connect(this.relay.url);
    this.client.subscribe();
    
    this.isRunning = true;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    await this.agent.stop();
    await this.client.disconnect();
    await this.relay.stop();
    
    this.isRunning = false;
  }

  async send(message: string): Promise<string> {
    await this.client.sendDM(this.agentPubkey, message);
    const reply = await this.client.waitForDM(60000);
    return reply.content;
  }

  get callCount(): number {
    return this.llm.getCallCount();
  }

  get events() {
    return this.relay.getEvents();
  }
}

function generateTestKey(): Uint8Array {
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    key[i] = Math.floor(Math.random() * 256);
  }
  return key;
}

function createNostrTransport(relayUrl: string, secretKey: Uint8Array): Transport {
  const publicKey = getPublicKey(secretKey);
  const pool = new RelayPool();
  pool.addOrGetRelay(relayUrl);
  
  const eventHandlers = new Map<string, Set<(...args: unknown[]) => void>>();
  
  return {
    type: 'nostr',
    identity: { publicKey },
    async start() {
      eventHandlers.get('connected')?.forEach(h => h());
    },
    async stop() {
      for (const relay of pool.relayByUrl.keys()) {
        pool.removeRelay(relay);
      }
    },
    async send(to: string, content: string) {
      const encrypted = await nip04.encrypt(secretKey, to, content);
      const ev = finalizeEvent({
        kind: 4,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', to]],
        content: encrypted
      }, secretKey);
      pool.publish(ev, [relayUrl]);
    },
    subscribe(handler) {
      const unsub = pool.subscribe(
        [{ kinds: [4], '#p': [publicKey] }],
        [relayUrl],
        async (event: unknown) => {
          const ev = event as { id: string; pubkey: string; content: string; created_at: number; kind: number; tags: string[][] };
          try {
            const decrypted = await nip04.decrypt(secretKey, ev.pubkey, ev.content);
            await handler(ev.pubkey, decrypted, { eventId: ev.id, timestamp: ev.created_at, kind: ev.kind, tags: ev.tags });
          } catch {
            // Ignore
          }
        }
      );
      return unsub;
    },
    on(event, handler) {
      if (!eventHandlers.has(event)) eventHandlers.set(event, new Set());
      eventHandlers.get(event)!.add(handler);
    }
  };
}

function createMemoryStore(): Store {
  const data: Record<string, Session> = {};
  return {
    get(key: string) {
      if (!data[key]) {
        data[key] = {
          history: [],
          delegationCount: 0,
          estCostUSD: 0,
          actualTokensUsed: 0,
          subTasks: {},
          depth: 0,
          topLevelStartedAt: 0
        };
      }
      return data[key];
    },
    getAll() {
      return { ...data };
    },
    async load() {},
    async save() {},
    clear() {
      Object.keys(data).forEach(k => delete data[k]);
    }
  };
}

export async function createTestHarness(config: TestHarnessConfig = {}): Promise<TestHarness> {
  const harness = new TestHarness(config);
  await harness.start();
  return harness;
}
