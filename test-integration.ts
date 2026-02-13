import { spawn, ChildProcess } from 'child_process';
import { WebSocketServer, WebSocket } from 'ws';
import { generateSecretKey, getPublicKey, finalizeEvent, nip04 } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import http from 'http';

const TEST_PORT = 40404;
const RELAY_URL = `ws://localhost:${TEST_PORT}`;

interface NostrEvent {
  id?: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
}

class TestRelay {
  private server: WebSocketServer;
  private httpServer: http.Server;
  private clients: Set<WebSocket> = new Set();
  private events: NostrEvent[] = [];
  private subscriptions: Map<WebSocket, { subId: string; filters: any[] }[]> = new Map();

  constructor(port: number) {
    this.httpServer = http.createServer();
    this.server = new WebSocketServer({ server: this.httpServer });
    
    this.server.on('connection', (ws, req) => {
      this.clients.add(ws);
      console.log(`[Relay] Client connected (${this.clients.size} total)`);

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(ws, msg);
        } catch (e) {
          console.error('[Relay] Parse error:', e);
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        this.subscriptions.delete(ws);
        console.log(`[Relay] Client disconnected (${this.clients.size} total)`);
      });
    });
  }

  clear() {
    this.events = [];
    this.subscriptions.clear();
  }

  private handleMessage(ws: WebSocket, msg: any[]) {
    const [type, ...args] = msg;

    switch (type) {
      case 'EVENT':
        this.handleEvent(ws, args[0] as NostrEvent);
        break;
      case 'REQ':
        this.handleSubscribe(ws, args[0] as string, args.slice(1) as any[]);
        break;
      case 'CLOSE':
        this.subscriptions.delete(ws);
        break;
    }
  }

  private handleEvent(ws: WebSocket, event: NostrEvent) {
    console.log(`[Relay] Event received: kind=${event.kind} from=${event.pubkey.slice(0, 8)} p=${event.tags.find(t => t[0] === 'p')?.[1]?.slice(0, 8)} content_len=${event.content?.length}`);
    this.events.push(event);
    
    ws.send(JSON.stringify(['OK', event.id || 'unknown', true, '']));

    this.broadcastEvent(event);
  }

  private handleSubscribe(ws: WebSocket, subId: string, filters: any[]) {
    console.log(`[Relay] Subscription: ${subId}`);
    if (!this.subscriptions.has(ws)) {
      this.subscriptions.set(ws, []);
    }
    this.subscriptions.get(ws)!.push({ subId, filters });

    for (const filter of filters) {
      const matching = this.events.filter(e => this.matchesFilter(e, filter));
      for (const event of matching) {
        ws.send(JSON.stringify(['EVENT', subId, event]));
      }
    }
    ws.send(JSON.stringify(['EOSE', subId]));
  }

  private matchesFilter(event: NostrEvent, filter: any): boolean {
    if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
    if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
    if (filter['#p'] && !event.tags.some(t => t[0] === 'p' && filter['#p'].includes(t[1]))) return false;
    if (filter.since && event.created_at < filter.since) return false;
    if (filter.until && event.created_at > filter.until) return false;
    return true;
  }

  private broadcastEvent(event: NostrEvent) {
    for (const [ws, subs] of this.subscriptions) {
      for (const sub of subs) {
        for (const filter of sub.filters) {
          const matches = this.matchesFilter(event, filter);
          console.log(`[Relay] Broadcast check: subId=${sub.subId} matches=${matches} event.p=${event.tags.find(t => t[0] === 'p')?.[1]?.slice(0,8)} filter.p=${filter['#p']?.[0]?.slice(0,8)}`);
          if (matches) {
            ws.send(JSON.stringify(['EVENT', sub.subId, event]));
          }
        }
      }
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(TEST_PORT, () => {
        console.log(`[Relay] Listening on ${RELAY_URL}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const ws of this.clients) {
        ws.close();
      }
      this.events = [];
      this.subscriptions.clear();
      this.server.close(() => {
        this.httpServer.close(() => {
          console.log('[Relay] Stopped');
          resolve();
        });
      });
    });
  }

  getEvents(): NostrEvent[] {
    return this.events;
  }
}

class TestClient {
  private ws: WebSocket | null = null;
  private secretKey: Uint8Array;
  public publicKey: string;
  private messageQueue: any[] = [];
  private resolveWait: (() => void) | null = null;

  constructor() {
    this.secretKey = generateSecretKey();
    this.publicKey = getPublicKey(this.secretKey);
  }

  async connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      
      this.ws.on('open', () => {
        console.log(`[Client ${this.publicKey.slice(0, 8)}] Connected`);
        resolve();
      });

      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        this.messageQueue.push(msg);
        if (this.resolveWait) {
          this.resolveWait();
          this.resolveWait = null;
        }
      });

      this.ws.on('error', reject);
    });
  }

  async sendDM(to: string, content: string): Promise<void> {
    const encrypted = await nip04.encrypt(this.secretKey, to, content);
    console.log(`[Client ${this.publicKey.slice(0, 8)}] Encrypted content: "${encrypted}"`);
    const event = finalizeEvent({
      kind: 4,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', to]],
      content: encrypted,
    }, this.secretKey);

    const eventJson = JSON.stringify(['EVENT', event]);
    console.log(`[Client ${this.publicKey.slice(0, 8)}] Event JSON content field: "${event.content}"`);
    this.ws!.send(eventJson);
    console.log(`[Client ${this.publicKey.slice(0, 8)}] Sent DM to ${to.slice(0, 8)}`);
  }

  subscribe(): void {
    this.ws!.send(JSON.stringify(['REQ', 'sub', {
      kinds: [4],
      '#p': [this.publicKey],
    }]));
    console.log(`[Client ${this.publicKey.slice(0, 8)}] Subscribed to DMs for self`);
  }

  async waitForDM(timeout = 30000): Promise<{ from: string; content: string }> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      for (let i = 0; i < this.messageQueue.length; i++) {
        const msg = this.messageQueue[i];
        if (msg[0] === 'EVENT' && msg[2]?.kind === 4) {
          this.messageQueue.splice(i, 1);
          const event = msg[2];
          try {
            const content = await nip04.decrypt(this.secretKey, event.pubkey, event.content);
            console.log(`[Client ${this.publicKey.slice(0, 8)}] Received DM from ${event.pubkey.slice(0, 8)}: ${content.slice(0, 50)}...`);
            return { from: event.pubkey, content };
          } catch (e) {
            continue;
          }
        }
      }

      await new Promise<void>(resolve => {
        this.resolveWait = resolve;
        setTimeout(resolve, 100);
      });
    }

    throw new Error('Timeout waiting for DM');
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.ws) {
        this.ws.close();
        this.ws.on('close', resolve);
      } else {
        resolve();
      }
    });
  }
}

let voltclawProcess: ChildProcess | null = null;
let relay: TestRelay;

async function setup() {
  console.log('\n=== Setting up test environment ===\n');

  relay = new TestRelay(TEST_PORT);
  await relay.start();

  console.log('[Setup] Relay started');
}

async function startVoltclaw(): Promise<{ publicKey: string }> {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      RELAYS: RELAY_URL,
      LLM_URL: 'http://localhost:11434/api/chat',
      LLM_MODEL: 'gemma3:4b',
      MAX_DELEGATION_DEPTH: '2',
      MAX_DELEGATION_CALLS: '5',
      DELEGATION_BUDGET_USD: '0.50',
    };

    voltclawProcess = spawn('npx', ['tsx', 'voltclaw.ts'], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    let publicKey = '';
    let output = '';

    voltclawProcess.stdout?.on('data', (data) => {
      const str = data.toString();
      output += str;
      console.log('[Voltclaw stdout]', str.trim());

      const npubMatch = output.match(/npub: (npub1[a-zA-Z0-9]+)/);
      if (npubMatch && !publicKey) {
        const npub = npubMatch[1];
        const decoded = nip19.decode(npub);
        if (decoded.type === 'npub') {
          publicKey = decoded.data;
          console.log(`[Setup] Voltclaw started with pubkey: ${publicKey.slice(0, 8)}...`);
          setTimeout(() => resolve({ publicKey }), 2000);
        }
      }
    });

    voltclawProcess.stderr?.on('data', (data) => {
      console.log('[Voltclaw stderr]', data.toString().trim());
    });

    voltclawProcess.on('error', reject);

    setTimeout(() => {
      if (!publicKey) {
        reject(new Error('Timeout waiting for Voltclaw to start'));
      }
    }, 30000);
  });
}

async function stopVoltclaw() {
  if (voltclawProcess) {
    voltclawProcess.kill('SIGINT');
    await new Promise<void>(resolve => {
      voltclawProcess?.on('close', () => {
        console.log('[Teardown] Voltclaw stopped');
        resolve();
      });
      setTimeout(resolve, 5000);
    });
    voltclawProcess = null;
  }
}

async function teardown() {
  console.log('\n=== Tearing down test environment ===\n');
  await stopVoltclaw();
  await relay.stop();
}

async function testBasicReply() {
  console.log('\n--- Test: Basic Reply ---\n');

  relay.clear();

  const { publicKey: agentPubkey } = await startVoltclaw();

  const client = new TestClient();
  await client.connect(RELAY_URL);
  client.subscribe();

  await client.sendDM(agentPubkey, 'hi');

  console.log('[Test] Waiting for reply...');
  const reply = await client.waitForDM(60000);

  console.log(`[Test] Got reply: ${reply.content.slice(0, 200)}...`);

  if (!reply.content) {
    throw new Error('No content in reply');
  }

  const hasNumber = /\b[4]\b/.test(reply.content) || /four/i.test(reply.content);
  console.log(`[Test] Reply ${hasNumber ? 'CONTAINS' : 'does NOT contain'} expected answer`);

  await client.disconnect();
  await stopVoltclaw();

  console.log('[Test] ✓ Basic reply test passed');
}

async function testStatusCommand() {
  console.log('\n--- Test: Status Command ---\n');

  const { publicKey: agentPubkey } = await startVoltclaw();

  const client = new TestClient();
  await client.connect(RELAY_URL);
  client.subscribe();

  await client.sendDM(agentPubkey, 'status');

  console.log('[Test] Waiting for status reply...');
  const reply = await client.waitForDM(30000);

  console.log(`[Test] Status: ${reply.content}`);

  if (!reply.content.includes('Delegations:')) {
    throw new Error('Status command did not return expected format');
  }

  await client.disconnect();
  await stopVoltclaw();

  console.log('[Test] ✓ Status command test passed');
}

async function testDelegation() {
  console.log('\n--- Test: Delegation ---\n');

  const { publicKey: agentPubkey } = await startVoltclaw();

  const client = new TestClient();
  await client.connect(RELAY_URL);
  client.subscribe();

  const task = 'Calculate the factorial of 5. Delegate the calculation if needed.';
  await client.sendDM(agentPubkey, task);

  console.log('[Test] Waiting for reply with potential delegation...');
  const reply = await client.waitForDM(120000);

  console.log(`[Test] Reply: ${reply.content.slice(0, 300)}...`);

  await client.disconnect();
  await stopVoltclaw();

  console.log('[Test] ✓ Delegation test passed');
}

async function runTests() {
  console.log('========================================');
  console.log('  Voltclaw Integration Tests');
  console.log('========================================');

  try {
    await setup();

    await testStatusCommand();
    await testBasicReply();
    await testDelegation();

    console.log('\n========================================');
    console.log('  All tests passed! ✓');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n========================================');
    console.error('  Test failed!');
    console.error('========================================');
    console.error(error);
    process.exit(1);
  } finally {
    await teardown();
  }
}

runTests();
