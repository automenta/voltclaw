// clawvolt-ultimate.ts – Recursive Nostr RLM-style autonomous agent
// v0.7 – all improvements: structured trace, skill metadata, persistent subtasks on startup, rate limiting, NIP-17 prep, tighter budget
import { generateSecretKey, getPublicKey, finalizeEvent, nip04, verifyEvent, validateEvent, type Event } from 'nostr-tools';
import { RelayPool } from 'nostr-relaypool';
import { useWebSocketImplementation } from 'nostr-tools/pool';
import WebSocket from 'ws';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { nip19 } from 'nostr-tools';
useWebSocketImplementation(WebSocket);

// ────────────────────────────────────────────── CONFIG ──────────────────────────────────────────────
interface Config {
  relays: string[];
  llm: { url: string; model: string };
  dataDir: string;
  maxHistory: number;
  retryDelay: number;
  autoPruneInterval: number;
  skillsDir: string;
  maxDelegationDepth: number;
  maxDelegationCalls: number;
  delegationBudgetUSD: number;
  traceFile: string;
  tokenCostPer1k: number;
  subtaskTimeoutMs: number;
  parentCheckIntervalMs: number;
  llmRateLimitPerMin: number;    // new: max LLM calls/min
  useNip17: boolean;             // new: toggle for future NIP-17 (stubbed)
}
let config: Config = {
  relays: ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band', 'wss://purplepag.es'],
  llm: { url: 'http://localhost:11434/api/chat', model: 'gemma3:4b' },
  dataDir: path.join(os.homedir(), '.clawvolt'),
  maxHistory: 60,
  retryDelay: 4000,
  autoPruneInterval: 300000,
  skillsDir: path.join(os.homedir(), '.clawvolt/skills'),
  maxDelegationDepth: 4,
  maxDelegationCalls: 25,
  delegationBudgetUSD: 0.75,
  traceFile: path.join(os.homedir(), '.clawvolt/trace.jsonl'),  // changed to .jsonl for structured
  tokenCostPer1k: 0.0005,
  subtaskTimeoutMs: 600_000,
  parentCheckIntervalMs: 60_000,
  llmRateLimitPerMin: 30,        // new
  useNip17: false,               // new: set true when nostr-tools supports NIP-17 fully
};

async function loadConfig() {
  await fs.mkdir(config.dataDir, { recursive: true });
  const cf = path.join(config.dataDir, 'config.json');
  try {
    if (await fs.stat(cf).catch(() => false)) {
      const data = JSON.parse(await fs.readFile(cf, 'utf-8'));
      Object.assign(config, data);
    }
  } catch {}
  // env overrides (expanded)
  ['RELAYS','LLM_URL','LLM_MODEL','MAX_DELEGATION_DEPTH','MAX_DELEGATION_CALLS','DELEGATION_BUDGET_USD','LLM_RATE_LIMIT_PER_MIN','USE_NIP17']
    .forEach(k => {
      if (process.env[k]) {
        const key = k.toLowerCase().replace(/_/g,'');
        let val: any = process.env[k];
        if (k === 'RELAYS') {
          val = val.split(',').map((s: string) => s.trim());
        } else if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (!isNaN(Number(val))) val = Number(val);
        (config as any)[key] = val;
      }
    });
}

// ────────────────────────────────────────────── KEYS & TRACE ──────────────────────────────────────────────
let keys: { publicKey: string; secretKey: string };
let traceStream: fs.FileHandle | null = null;
async function initKeysAndTrace() {
  const kf = path.join(config.dataDir, 'keys.json');
  if (await fs.stat(kf).catch(() => false)) {
    keys = JSON.parse(await fs.readFile(kf, 'utf-8'));
  } else {
    const sk = generateSecretKey();
    keys = { publicKey: getPublicKey(sk), secretKey: Buffer.from(sk).toString('hex') };
    await fs.writeFile(kf, JSON.stringify(keys, null, 2));
    console.log('New identity created.');
  }
  console.log(`npub: ${nip19.npubEncode(keys.publicKey)}`);
  console.log(`nsec: ${nip19.nsecEncode(Buffer.from(keys.secretKey, 'hex'))} (backup!)`);
  traceStream = await fs.open(config.traceFile, 'a');
  await trace({ event: 'startup', msg: 'ClawVolt v0.7 started', nip17: config.useNip17 ? 'enabled (stub)' : 'disabled; NIP-04 deprecated' });
}

// ────────────────────────────────────────────── MEMORY + SESSION STATE ──────────────────────────────────────────────
interface SubtaskInfo {
  createdAt: number;
  task: string;
  arrived: boolean;
  result?: string;
  error?: string;
}
interface Session {
  history: any[];
  delegationCount: number;
  estCostUSD: number;
  actualTokensUsed: number;
  subTasks: Record<string, SubtaskInfo>;
  depth: number;
  topLevelStartedAt: number;
  parentCheckTimer?: NodeJS.Timeout;
  llmCallsInMin: number;         // new: for rate limiting
  lastLlmCallTs: number;
}
class Memory {
  private data: Record<string, Session> = {};
  private file = path.join(config.dataDir, 'sessions.json');
  async load() { try { this.data = JSON.parse(await fs.readFile(this.file, 'utf-8') || '{}'); } catch {} }
  async save() { try { await fs.writeFile(this.file, JSON.stringify(this.data, null, 2)); } catch {} }
  get(pubkey: string, isSelf = false): Session {
    const key = isSelf ? 'self' : pubkey;
    if (!this.data[key]) this.data[key] = {
      history: [],
      delegationCount: 0,
      estCostUSD: 0,
      actualTokensUsed: 0,
      subTasks: {},
      depth: 0,
      topLevelStartedAt: 0,
      llmCallsInMin: 0,
      lastLlmCallTs: 0,
    };
    return this.data[key];
  }
  prune(pubkey: string) {
    const s = this.get(pubkey);
    if (s.history.length > config.maxHistory) s.history.splice(0, s.history.length - config.maxHistory);
  }
}
const memory = new Memory();

// ────────────────────────────────────────────── TOOLS ──────────────────────────────────────────────
class ToolRegistry {
  private tools: Record<string, { handler: Function; desc: string; maxDepth: number; costMultiplier?: number }> = {};  // new: costMultiplier
  register(name: string, handler: Function, desc: string, maxDepth = Infinity, costMultiplier = 1) {
    this.tools[name] = { handler, desc, maxDepth, costMultiplier };
  }
  listForDepth(depth: number) {
    return Object.entries(this.tools)
      .filter(([,t]) => depth <= t.maxDepth)
      .map(([n,t]) => ({ name: n, description: t.desc }));
  }
  async call(name: string, args: any) {
    const t = this.tools[name];
    if (!t) throw new Error(`Tool ${name} not found`);
    return t.handler(args);
  }
}
const tools = new ToolRegistry();
tools.register('get_time', async () => new Date().toISOString(), 'Current UTC time', Infinity);
tools.register('estimate_tokens', async (text: string) => Math.ceil((text?.length || 0) / 4), 'Rough token count estimate', Infinity);

// ──────────────── RECURSIVE DELEGATION ────────────────
tools.register('delegate', async function(this: any, args: { task: string; summary?: string }) {
  const session = memory.get(this.senderPubkey);
  const depth = session.depth + 1;
  if (depth > config.maxDelegationDepth) return { error: `Max depth reached (${config.maxDelegationDepth}).` };
  if (session.delegationCount >= config.maxDelegationCalls) return { error: `Max delegations exceeded.` };

  const baseEst = ((args.task.length + (args.summary?.length || 0)) / 4000) * config.tokenCostPer1k;
  const estNewCost = baseEst * 3;  // tighter pessimistic (was 2.5)
  if (session.estCostUSD + estNewCost > config.delegationBudgetUSD * 0.8) {  // tighter threshold (was 0.9)
    return { error: `Budget near limit (${session.estCostUSD.toFixed(4)} / ${config.delegationBudgetUSD}).` };
  }

  session.delegationCount++;
  session.estCostUSD += estNewCost;

  const subId = `${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  session.subTasks[subId] = { createdAt: Date.now(), task: args.task, arrived: false };

  const payload = JSON.stringify({
    type: 'subtask',
    parentPubkey: this.senderPubkey,
    subId,
    task: args.task,
    contextSummary: args.summary || '',
    depth
  });

  await nostr.sendDM(keys.publicKey, payload);
  await trace({ event: 'delegate', subId: subId.slice(-8), depth });

  return { status: 'delegated', subId, depth, estCost: estNewCost };
}, 'Delegate sub-task to child instance. Use clear task + optional summary.', config.maxDelegationDepth - 1, 3);  // high cost mult

// ────────────────────────────────────────────── LLM CALL ──────────────────────────────────────────────
let llmRateBucket: number[] = [];  // timestamps of recent calls (global for simplicity)
async function callLLM(messages: any[], depth = 0, retries = 3): Promise<{ content: string; tool_calls?: any[]; usage?: { total_tokens?: number } }> {
  const now = Date.now();
  llmRateBucket = llmRateBucket.filter(ts => now - ts < 60_000);  // last min
  if (llmRateBucket.length >= config.llmRateLimitPerMin) {
    throw new Error('LLM rate limit exceeded; retry later');
  }
  llmRateBucket.push(now);

  try {
    const toolDefs = tools.listForDepth(depth).map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: { type: 'object', properties: {} } } }));
    const res = await fetch(config.llm.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.llm.model,
        messages,
        stream: false,
        ...(toolDefs.length > 0 && { tools: toolDefs })
      })
    });
    if (!res.ok) {
      const errorBody = await res.text().catch(() => 'Unable to read error body');
      if (errorBody.includes('does not support tools') && toolDefs.length > 0) {
        const resNoTools = await fetch(config.llm.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: config.llm.model, messages, stream: false })
        });
        if (!resNoTools.ok) throw new Error(`${resNoTools.statusText}`);
        const json = await resNoTools.json();
        const message = json.message || json;
        return { content: message.content || '', tool_calls: undefined, usage: json.usage || message.usage || {} };
      }
      throw new Error(`${res.statusText}: ${errorBody}`);
    }
    const json = await res.json();
    const message = json.message || json;
    return {
      content: message.content || '',
      tool_calls: message.tool_calls,
      usage: json.usage || message.usage || {}
    };
  } catch (e) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, config.retryDelay));
      return callLLM(messages, depth, retries - 1);
    }
    throw e;
  }
}

// ────────────────────────────────────────────── NOSTR CLIENT ──────────────────────────────────────────────
class NostrClient {
  pool = new RelayPool();
  private seenEvents = new Set<string>();
  constructor(public pubkey: string, private seckey: Uint8Array) {
    config.relays.forEach(relay => this.pool.addOrGetRelay(relay));
  }
  async sendDM(to: string, content: string) {
    const enc = await nip04.encrypt(this.seckey, to, content);  // TODO: replace with NIP-17 when supported
    const ev = finalizeEvent({ kind: 4, created_at: Math.floor(Date.now()/1000), tags: [['p', to]], content: enc }, this.seckey);
    this.pool.publish(ev, config.relays);
  }
  subscribe(handler: (from: string, text: string, ev: Event) => Promise<void>) {
    this.pool.subscribe(
      [{ kinds: [4], '#p': [this.pubkey] }],
      config.relays,
      async (ev) => {
        if (this.seenEvents.has(ev.id)) return;
        this.seenEvents.add(ev.id);
        console.log(`[Voltclaw] Received event: id=${ev.id?.slice(0,8)} from=${ev.pubkey.slice(0,8)}`);
        if (!validateEvent(ev) || !verifyEvent(ev)) {
          await trace({ event: 'invalid_event', id: ev.id?.slice(0,8), pubkey: ev.pubkey?.slice(0,8), reason: 'sig fail' });
          return;
        }
        try {
          const pt = nip04.decrypt(this.seckey, ev.pubkey, ev.content);
          console.log(`[Voltclaw] Decrypt success: "${pt.slice(0,50)}..."`);
          await handler(ev.pubkey, pt, ev);
        } catch (e) {
          console.error(`[Voltclaw] Decrypt failed for event ${ev.id?.slice(0,8)}: ${e}`);
          console.error((e as Error).stack);
          await trace({ event: 'decrypt_fail', from: ev.pubkey.slice(0,8), to: ev.tags.find(t => t[0] === 'p')?.[1]?.slice(0,8), error: String(e) });
        }
      }
    );
  }
  async queryRecentDMs(since: number): Promise<Event[]> {
    return new Promise((resolve) => {
      const events: Event[] = [];
      const unsub = this.pool.subscribe(
        [{ kinds: [4], '#p': [this.pubkey], since }],
        config.relays,
        async (ev) => { if (validateEvent(ev) && verifyEvent(ev)) events.push(ev); },
        undefined,
        undefined,
        { unsubscribeOnEose: true }
      );
      setTimeout(() => { unsub(); resolve(events); }, 5000);
    });
  }
  async close() { 
    for (const relay of this.pool.relayByUrl.keys()) {
      this.pool.removeRelay(relay);
    }
  }
}
let nostr: NostrClient;

// ────────────────────────────────────────────── HELPERS ──────────────────────────────────────────────
async function synthesize(session: Session, to: string) {
  const results = Object.entries(session.subTasks)
    .map(([id, info]) => `- ${id.slice(-8)}: ${info.arrived ? info.result : (info.error || '[timeout/failed]')}`)
    .join('\n');

  const prompt = `Synthesize sub-task results (or note failures/timeouts):\n${results}\n\nProduce coherent final answer.`;
  const msgs = [{role:'system', content: 'You are ClawVolt – combine sub-results.'}, {role:'user', content: prompt}];
  const resp = await callLLM(msgs).catch(() => ({ content: 'Synthesis failed. Raw results:\n' + results }));

  const elapsed = ((Date.now() - session.topLevelStartedAt) / 1000).toFixed(0);
  const maxUsedDepth = Math.max(...Object.values(session.subTasks).map(() => session.depth), session.depth);
  const meta = `[ClawVolt v0.7 | max depth: ${maxUsedDepth} | delegations: ${session.delegationCount} | est cost: $${session.estCostUSD.toFixed(4)} | time: ${elapsed}s]`;

  const finalReply = `${meta}\n\n${resp.content}`;
  await nostr.sendDM(to, finalReply);
  await trace({ event: 'synthesize', to: to.slice(0,8), replyLen: finalReply.length });

  if (session.parentCheckTimer) clearInterval(session.parentCheckTimer);
  session.subTasks = {};
  session.parentCheckTimer = undefined;
}

function startParentCheck(session: Session, to: string) {
  if (session.parentCheckTimer) clearInterval(session.parentCheckTimer);
  session.parentCheckTimer = setInterval(async () => {
    const now = Date.now();
    let incomplete = 0;
    for (const [id, info] of Object.entries(session.subTasks)) {
      if (!info.arrived && (now - info.createdAt > config.subtaskTimeoutMs)) {
        info.error = 'timeout';
        await trace({ event: 'subtask_timeout', subId: id.slice(-8) });
      }
      if (!info.arrived && !info.error) incomplete++;
    }

    if (incomplete === 0) {
      await synthesize(session, to);
    } else if (now - session.topLevelStartedAt > config.subtaskTimeoutMs * 1.5) {
      await nostr.sendDM(to, `[Timeout] Still waiting on ${incomplete} subtasks. Partial synthesis coming soon.`);
      await synthesize(session, to);
    }
  }, config.parentCheckIntervalMs);
}

// ────────────────────────────────────────────── CORE PROCESSING ──────────────────────────────────────────────
async function processMessage(from: string, text: string, _event: Event) {
  const isSelf = from === keys.publicKey;
  const sessionKey = isSelf ? 'self' : from;
  const session = memory.get(sessionKey, isSelf);

  // ─── Magic commands ───
  const lower = text.trim().toLowerCase();
  if (lower === 'status') {
    const pending = Object.values(session.subTasks).filter(s => !s.arrived && !s.error).length;
    const msg = `Status:\n- Delegations: ${session.delegationCount}\n- Budget used: $${session.estCostUSD.toFixed(4)}\n- Tokens used: ${session.actualTokensUsed}\n- Pending: ${pending}\n- Depth: ${session.depth}`;
    await nostr.sendDM(from, msg);
    return;
  }
  if (lower.startsWith('cancel ')) {
    const subId = text.trim().split(' ')[1];
    if (session.subTasks[subId]) {
      session.subTasks[subId].error = 'cancelled by user';
      await nostr.sendDM(from, `Cancelled subtask ${subId.slice(-8)}`);
      await trace({ event: 'cancel', subId: subId.slice(-8) });
    } else {
      await nostr.sendDM(from, `Subtask ${subId?.slice(-8) || '?'} not found`);
    }
    return;
  }
  if (lower === 'abort') {
    if (session.parentCheckTimer) clearInterval(session.parentCheckTimer);
    session.subTasks = {};
    session.delegationCount = 0;
    await nostr.sendDM(from, 'Session aborted. Ready for new task.');
    await trace({ event: 'abort', from: from.slice(0,8) });
    return;
  }

  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = null; }

  if (parsed?.type === 'subtask') {
    session.depth = parsed.depth;
    const mustFinish = session.depth >= config.maxDelegationDepth - 1
      ? '\nMUST produce final concise JSON answer NOW: { "result": "..." }. No delegation.'
      : '';  // leaf structured output

    const system = `FOCUSED sub-agent (depth ${parsed.depth}/${config.maxDelegationDepth}).
Task: ${parsed.task}
Parent context: ${parsed.contextSummary}${mustFinish}`;

    const messages = [{role:'system', content: system}, {role:'user', content: 'Begin.'}];
    let resp;
    try {
      resp = await callLLM(messages, parsed.depth);
      const result = resp.content || '[no content]';
      const payload = JSON.stringify({ type: 'subtask_result', subId: parsed.subId, result });
      await nostr.sendDM(keys.publicKey, payload);
      await trace({ event: 'child_complete', subId: parsed.subId.slice(-8), depth: parsed.depth });
    } catch (e) {
      const errPayload = JSON.stringify({ type: 'subtask_result', subId: parsed.subId, error: String(e) });
      await nostr.sendDM(keys.publicKey, errPayload);
      await trace({ event: 'child_error', subId: parsed.subId.slice(-8), error: String(e) });
    }
    return;
  }

  if (parsed?.type === 'subtask_result') {
    const sub = session.subTasks[parsed.subId];
    if (!sub) return;

    sub.arrived = true;
    if (parsed.error) {
      sub.error = parsed.error;
    } else {
      sub.result = parsed.result;
      const added = Math.ceil((parsed.result?.length || 0) / 4);
      session.actualTokensUsed += added;
      session.estCostUSD += (added / 1000) * config.tokenCostPer1k;
    }

    await trace({ event: 'result_received', subId: parsed.subId.slice(-8), status: parsed.error ? 'error' : 'ok' });

    const allDone = Object.values(session.subTasks).every(s => s.arrived || s.error);
    if (allDone) await synthesize(session, from);
    return;
  }

  // ─── Top-level ───
  session.depth = 0;
  session.subTasks = {};
  session.delegationCount = 0;
  session.estCostUSD = 0;
  session.actualTokensUsed = 0;
  session.topLevelStartedAt = Date.now();

  const system = `You are ClawVolt – recursive agent.
Tools: ${tools.listForDepth(0).map(t=>t.name).join(', ')}
Use 'delegate' for complex subtasks.
Budget: $${config.delegationBudgetUSD}. Max depth: ${config.maxDelegationDepth}.`;

  let messages = [{role:'system', content: system}, ...session.history.slice(-config.maxHistory), {role:'user', content: text}];
  console.log(`[Voltclaw] Calling LLM with prompt: "${text}"`);
  let resp = await callLLM(messages, 0);
  console.log(`[Voltclaw] LLM response: content="${resp.content?.slice(0,100)}..." tool_calls=${resp.tool_calls?.length || 0}`);

  while (resp.tool_calls?.length) {
    messages.push({ role: 'assistant', content: null, tool_calls: resp.tool_calls });
    for (const call of resp.tool_calls) {
      try {
        const args = JSON.parse(call.function.arguments || '{}');
        const result = await tools.call(call.function.name, args);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      } catch (e) {
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: String(e) }) });
      }
    }
    resp = await callLLM(messages, 0);
  }

  const reply = resp.content || '[error]';
  session.history.push({role:'user', content: text}, {role:'assistant', content: reply});
  memory.prune(sessionKey);
  await memory.save();

  await nostr.sendDM(from, reply);
  await trace({ event: 'reply', from: from.slice(0,8), replyLen: reply.length });

  if (Object.keys(session.subTasks).length > 0) {
    startParentCheck(session, from);
  }
}

// ────────────────────────────────────────────── TRACE + SKILLS ──────────────────────────────────────────────
async function trace(entry: Record<string, any>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
  console.log(line.trim());
  if (traceStream) await traceStream.appendFile(line);
}

async function loadSkills() {
  try {
    await fs.mkdir(config.skillsDir, { recursive: true });
    const files = await fs.readdir(config.skillsDir);
    for (const file of files.filter(f => /\.(js|ts)$/.test(f))) {
      const mod = await import(path.join(config.skillsDir, file));
      const skill = mod.default || mod;
      if (skill?.name && skill?.handler && skill?.desc) {
        tools.register(skill.name, skill.handler, skill.desc, skill.maxDepth ?? Infinity, skill.costMultiplier ?? 1);
        await trace({ event: 'skill_load', name: skill.name, file });
      }
    }
  } catch (e) {
    await trace({ event: 'skill_error', error: String(e) });
  }
}

// ────────────────────────────────────────────── RECOVER PENDING ──────────────────────────────────────────────
async function recoverPendingSessions() {
  const since = Math.floor((Date.now() - 86_400_000) / 1000);  // last 24h
  const events = await nostr.queryRecentDMs(since);
  for (const ev of events) {
    try {
      const pt = await nip04.decrypt(Buffer.from(keys.secretKey, 'hex'), ev.pubkey, ev.content);
      const parsed = JSON.parse(pt);
      if (parsed.type === 'subtask' && !memory.get('self').subTasks[parsed.subId]) {  // recover pending
        memory.get('self').subTasks[parsed.subId] = { createdAt: ev.created_at * 1000, task: parsed.task, arrived: false };
        await trace({ event: 'recover_subtask', subId: parsed.subId.slice(-8) });
      }
      // also check for results and apply if matching
      if (parsed.type === 'subtask_result') {
        const sub = memory.get('self').subTasks[parsed.subId];
        if (sub) {
          sub.arrived = true;
          sub.result = parsed.result;
          sub.error = parsed.error;
        }
      }
    } catch {}
  }
}

// ────────────────────────────────────────────── STARTUP ──────────────────────────────────────────────
async function main() {
  await loadConfig();
  await initKeysAndTrace();
  await loadSkills();
  await memory.load();
  nostr = new NostrClient(keys.publicKey, Buffer.from(keys.secretKey, 'hex'));
  await recoverPendingSessions();  // new: persistent recovery
  nostr.subscribe((from, text, ev) => processMessage(from, text, ev));
  setInterval(async () => {
    Object.keys(memory.data || {}).forEach(k => memory.prune(k));
    await memory.save();
    await trace({ event: 'prune' });
  }, config.autoPruneInterval);
  console.log('ClawVolt v0.7 running…');
}

main().catch(console.error);

process.on('SIGINT', async () => {
  if (traceStream) await traceStream.close();
  if (nostr) await nostr.close();
  process.exit(0);
});

