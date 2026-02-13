import { bootstrap, loadSystemPrompt, VOLTCLAW_DIR, TOOLS_DIR } from './bootstrap.js';
export { bootstrap, loadSystemPrompt, VOLTCLAW_DIR, TOOLS_DIR };

import type {
  VoltClawAgentOptions,
  LLMProvider,
  Transport,
  Store,
  Tool,
  Middleware,
  Logger,
  MessageContext,
  ReplyContext,
  DelegationContext,
  ErrorContext,
  QueryOptions,
  Unsubscribe,
  Session,
  ChatMessage,
  MessageMeta,
  ToolCallResult
} from './types.js';
import {
  VoltClawError,
  ConfigurationError,
  MaxDepthExceededError,
  BudgetExceededError,
  isRetryable
} from './errors.js';

const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_CALLS = 25;
const DEFAULT_BUDGET_USD = 0.75;
const DEFAULT_TIMEOUT_MS = 600000;
const DEFAULT_MAX_HISTORY = 60;
const DEFAULT_PRUNE_INTERVAL = 300000;

interface AgentState {
  isRunning: boolean;
  isPaused: boolean;
}

export class VoltClawAgent {
  private readonly llm: LLMProvider;
  private readonly transport: Transport;
  private readonly store: Store;
  private readonly tools: Map<string, Tool> = new Map();
  private readonly middleware: Middleware[] = [];
  private readonly hooks: {
    onMessage?: (ctx: MessageContext) => Promise<void>;
    onReply?: (ctx: ReplyContext) => Promise<void>;
    onDelegation?: (ctx: DelegationContext) => Promise<void>;
    onError?: (ctx: ErrorContext) => Promise<void>;
    onStart?: () => Promise<void>;
    onStop?: () => Promise<void>;
  } = {};
  private readonly logger: Logger;
  private readonly maxDepth: number;
  private readonly maxCalls: number;
  private readonly budgetUSD: number;
  private readonly timeoutMs: number;
  private readonly maxHistory: number;
  private readonly autoPruneInterval: number;
  private readonly eventHandlers: Map<string, Set<(...args: unknown[]) => void>> = new Map();
  private readonly state: AgentState = { isRunning: false, isPaused: false };
  private transportUnsubscribe?: Unsubscribe;
  private pruneTimer?: ReturnType<typeof setInterval>;
  private systemPromptTemplate?: string;

  constructor(options: VoltClawAgentOptions = {}) {
    this.llm = this.resolveLLM(options.llm);
    this.transport = this.resolveTransport(options.transport);
    this.store = this.resolveStore(options.persistence);
    
    this.maxDepth = options.delegation?.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.maxCalls = options.delegation?.maxCalls ?? DEFAULT_MAX_CALLS;
    this.budgetUSD = options.delegation?.budgetUSD ?? DEFAULT_BUDGET_USD;
    this.timeoutMs = options.delegation?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxHistory = options.history?.maxMessages ?? DEFAULT_MAX_HISTORY;
    this.autoPruneInterval = options.history?.autoPruneInterval ?? DEFAULT_PRUNE_INTERVAL;

    if (options.tools) {
      this.registerTools(options.tools);
    }

    if (options.middleware) {
      this.middleware = options.middleware;
    }

    if (options.hooks) {
      this.hooks = options.hooks;
    }

    this.logger = this.resolveLogger(options.logger);
  }

  private resolveLLM(llm: VoltClawAgentOptions['llm']): LLMProvider {
    if (!llm) {
      throw new ConfigurationError('LLM provider is required');
    }
    if (typeof llm === 'object' && 'chat' in llm && typeof llm.chat === 'function') {
      return llm as LLMProvider;
    }
    throw new ConfigurationError('Invalid LLM configuration');
  }

  private resolveTransport(transport: VoltClawAgentOptions['transport']): Transport {
    if (!transport) {
      throw new ConfigurationError('Transport is required');
    }
    if (typeof transport === 'object' && 'subscribe' in transport && typeof transport.subscribe === 'function') {
      return transport as Transport;
    }
    throw new ConfigurationError('Invalid transport configuration');
  }

  private resolveStore(persistence: VoltClawAgentOptions['persistence']): Store {
    if (!persistence) {
      throw new ConfigurationError('Persistence store is required');
    }
    if (typeof persistence === 'object' && 'get' in persistence && typeof persistence.get === 'function') {
      return persistence as Store;
    }
    throw new ConfigurationError('Invalid persistence configuration');
  }

  private resolveLogger(logger: VoltClawAgentOptions['logger']): Logger {
    if (logger && typeof logger === 'object' && 'info' in logger) {
      return logger as Logger;
    }
    return {
      debug: (_message: string, _data?: Record<string, unknown>) => {},
      info: (_message: string, _data?: Record<string, unknown>) => {},
      warn: (_message: string, _data?: Record<string, unknown>) => {},
      error: (_message: string, _data?: Record<string, unknown>) => {}
    };
  }

  private registerTools(tools: Tool[] | { builtins?: string[]; directories?: string[] }): void {
    if (Array.isArray(tools)) {
      for (const tool of tools) {
        this.tools.set(tool.name, tool);
      }
    }
  }

  async start(): Promise<void> {
    if (this.state.isRunning) {
      return;
    }

    // Try to bootstrap if needed
    try {
        await bootstrap();
        this.systemPromptTemplate = await loadSystemPrompt();
    } catch (e) {
        this.logger.warn("Failed to bootstrap configuration", { error: String(e) });
    }

    await this.transport.start();
    await this.store.load?.();

    this.transportUnsubscribe = this.transport.subscribe(
      async (from: string, content: string, meta: MessageMeta) => {
        await this.handleMessage(from, content, meta);
      }
    );

    this.pruneTimer = setInterval(async () => {
      await this.pruneAllSessions();
    }, this.autoPruneInterval);

    this.state.isRunning = true;
    this.state.isPaused = false;
    await this.hooks.onStart?.();
    this.emit('start');
    this.logger.info('VoltClaw agent started');
  }

  async stop(): Promise<void> {
    if (!this.state.isRunning) {
      return;
    }

    this.transportUnsubscribe?.();
    this.transportUnsubscribe = undefined;

    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = undefined;
    }

    await this.transport.stop();
    await this.store.save?.();

    this.state.isRunning = false;
    await this.hooks.onStop?.();
    this.emit('stop');
    this.logger.info('VoltClaw agent stopped');
  }

  pause(): void {
    this.state.isPaused = true;
    this.logger.info('Agent paused');
  }

  resume(): void {
    this.state.isPaused = false;
    this.logger.info('Agent resumed');
  }

  async query(message: string, _options?: QueryOptions): Promise<string> {
    const session = this.store.get('self', true);

    // Ensure we start with a clean state for one-shot if needed, or handle session logic better
    // For now, simple append
    if (session.depth === undefined) session.depth = 0;

    session.history.push({ role: 'user', content: message });
    
    // Use handleTopLevel logic but wait for result?
    // query() is synchronous-looking but really async.
    // We should reuse handleTopLevel logic but capture the final answer.
    // However, handleTopLevel sends via transport.
    // For local query, we want the result directly.
    
    // Adapted from handleTopLevel for direct response:
    session.subTasks = {};
    session.delegationCount = 0;
    session.estCostUSD = 0;
    session.actualTokensUsed = 0;
    session.topLevelStartedAt = Date.now();

    const systemPrompt = this.buildSystemPrompt(session.depth);
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...session.history.slice(-this.maxHistory)
    ];

    let response = await this.llm.chat(messages, {
      tools: this.getToolDefinitions(session.depth)
    });

    while (response.toolCalls && response.toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls
      });

      for (const call of response.toolCalls) {
        // Execute tool (including delegate if enabled)
        const result = await this.executeTool(call.name, call.arguments, session, 'self');
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: JSON.stringify(result)
        });
      }

      response = await this.llm.chat(messages, {
        tools: this.getToolDefinitions(session.depth)
      });
    }

    const reply = response.content || '[error]';
    session.history.push({ role: 'assistant', content: reply });
    this.pruneHistory(session);
    await this.store.save?.();
    
    return reply;
  }

  private async handleMessage(from: string, content: string, meta: MessageMeta): Promise<void> {
    if (this.state.isPaused) {
      this.logger.debug('Message ignored - agent paused', { from });
      return;
    }

    const isSelf = from === this.transport.identity.publicKey;
    const session = this.store.get(isSelf ? 'self' : from, isSelf);

    const ctx: MessageContext = {
      from,
      content,
      timestamp: new Date(),
      metadata: meta
    };
    await this.hooks.onMessage?.(ctx);
    this.emit('message', ctx);

    try {
      const parsed = this.tryParseJSON(content);
      
      if (parsed?.type === 'subtask') {
        await this.handleSubtask(session, parsed, from);
      } else if (parsed?.type === 'subtask_result') {
        await this.handleSubtaskResult(session, parsed, from);
      } else {
        await this.handleTopLevel(session, content, from);
      }
    } catch (error) {
      const errCtx: ErrorContext = {
        error: error instanceof Error ? error : new Error(String(error)),
        context: { from, content: content.slice(0, 100) },
        timestamp: new Date()
      };
      await this.hooks.onError?.(errCtx);
      this.emit('error', errCtx);
      this.logger.error('Error handling message', { error: String(error), from });
    }
  }

  private tryParseJSON(text: string): Record<string, unknown> | null {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private async handleTopLevel(
    session: Session,
    content: string,
    from: string
  ): Promise<void> {
    session.depth = 0;
    session.subTasks = {};
    session.delegationCount = 0;
    session.estCostUSD = 0;
    session.actualTokensUsed = 0;
    session.topLevelStartedAt = Date.now();

    const systemPrompt = this.buildSystemPrompt(session.depth);
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...session.history.slice(-this.maxHistory),
      { role: 'user', content }
    ];

    let response = await this.llm.chat(messages, {
      tools: this.getToolDefinitions(session.depth)
    });

    while (response.toolCalls && response.toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls
      });

      for (const call of response.toolCalls) {
        const result = await this.executeTool(call.name, call.arguments, session, from);
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: JSON.stringify(result)
        });
      }

      response = await this.llm.chat(messages, {
        tools: this.getToolDefinitions(session.depth)
      });
    }

    const reply = response.content || '[error]';
    session.history.push({ role: 'user', content });
    session.history.push({ role: 'assistant', content: reply });
    this.pruneHistory(session);
    await this.store.save?.();

    await this.transport.send(from, reply);
    
    const replyCtx: ReplyContext = {
      to: from,
      content: reply,
      timestamp: new Date()
    };
    await this.hooks.onReply?.(replyCtx);
    this.emit('reply', replyCtx);
  }

  private async handleSubtask(
    session: Session,
    parsed: Record<string, unknown>,
    _from: string
  ): Promise<void> {
    const depth = (parsed.depth as number) ?? session.depth + 1;
    const task = parsed.task as string;
    const contextSummary = (parsed.contextSummary as string) ?? '';
    const subId = parsed.subId as string;
    const parentPubkey = parsed.parentPubkey as string | undefined;

    session.depth = depth;

    const mustFinish = depth >= this.maxDepth - 1
      ? '\nMUST produce final concise answer NOW. No further delegation.'
      : '';

    // Use template or fallback
    const basePrompt = this.systemPromptTemplate || `You are VoltClaw (depth {depth}/{maxDepth}).`;

    // We need to inject depth specific context into the subtask prompt
    // Ideally we use buildSystemPrompt but customized for subtask
    // For now, let's stick to a simpler subtask prompt to keep context low
    const systemPrompt = `FOCUSED sub-agent (depth ${depth}/${this.maxDepth}).
Task: ${task}
Parent context: ${contextSummary}${mustFinish}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Begin.' }
    ];

    try {
      const response = await this.llm.chat(messages, {
        tools: this.getToolDefinitions(depth)
      });
      
      const result = response.content || '[no content]';
      await this.transport.send(
        this.transport.identity.publicKey,
        JSON.stringify({ type: 'subtask_result', subId, result })
      );

      const delCtx: DelegationContext = {
        taskId: subId,
        task,
        depth,
        parentPubkey
      };
      await this.hooks.onDelegation?.(delCtx);
      this.emit('delegation', delCtx);
    } catch (error) {
      await this.transport.send(
        this.transport.identity.publicKey,
        JSON.stringify({ type: 'subtask_result', subId, error: String(error) })
      );
    }
  }

  private async handleSubtaskResult(
    session: Session,
    parsed: Record<string, unknown>,
    _from: string
  ): Promise<void> {
    const subId = parsed.subId as string;
    const sub = session.subTasks[subId];
    if (!sub) return;

    sub.arrived = true;
    if (parsed.error) {
      sub.error = parsed.error as string;
    } else {
      sub.result = parsed.result as string;
      const addedTokens = Math.ceil((sub.result?.length ?? 0) / 4);
      session.actualTokensUsed += addedTokens;
      session.estCostUSD += (addedTokens / 1000) * 0.0005;
    }

    await this.store.save?.();

    const allDone = Object.values(session.subTasks).every(
      (s: { arrived: boolean; error?: string }) => s.arrived || s.error
    );
    
    if (allDone && session.topLevelStartedAt > 0) {
      await this.synthesize(session);
    }
  }

  private async synthesize(session: Session): Promise<string> {
    const results = Object.entries(session.subTasks)
      .map(([id, info]: [string, { arrived: boolean; result?: string; error?: string }]) => {
        const status = info.arrived ? info.result : (info.error ?? '[timeout/failed]');
        return `- ${id.slice(-8)}: ${status}`;
      })
      .join('\n');

    const prompt = `Synthesize sub-task results (or note failures/timeouts):\n${results}\n\nProduce coherent final answer.`;
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are VoltClaw – combine sub-results.' },
      { role: 'user', content: prompt }
    ];

    const response = await this.llm.chat(messages).catch(() => ({
      content: 'Synthesis failed. Raw results:\n' + results
    }));

    return response.content;
  }

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
    session: Session,
    from: string
  ): Promise<ToolCallResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { error: `Tool not found: ${name}` };
    }

    try {
      if (name === 'delegate') {
        return await this.executeDelegate(args, session, from);
      }
      const result = await tool.execute(args);
      return result as ToolCallResult;
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async executeDelegate(
    args: Record<string, unknown>,
    session: Session,
    from: string
  ): Promise<ToolCallResult> {
    const task = args.task as string;
    const summary = args.summary as string | undefined;
    const depth = session.depth + 1;

    if (depth > this.maxDepth) {
      throw new MaxDepthExceededError(this.maxDepth, depth);
    }

    if (session.delegationCount >= this.maxCalls) {
      return { error: 'Max delegations exceeded' };
    }

    const baseEst = ((task.length + (summary?.length ?? 0)) / 4000) * 0.0005;
    const estNewCost = baseEst * 3;

    if (session.estCostUSD + estNewCost > this.budgetUSD * 0.8) {
      throw new BudgetExceededError(this.budgetUSD, session.estCostUSD);
    }

    session.delegationCount++;
    session.estCostUSD += estNewCost;

    const subId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    session.subTasks[subId] = {
      createdAt: Date.now(),
      task,
      arrived: false
    };

    const payload = JSON.stringify({
      type: 'subtask',
      parentPubkey: from,
      subId,
      task,
      contextSummary: summary ?? '',
      depth
    });

    await this.transport.send(this.transport.identity.publicKey, payload);
    await this.store.save?.();

    return { status: 'delegated', subId, depth, estCost: estNewCost };
  }

  private buildSystemPrompt(depth: number): string {
    const toolNames = Array.from(this.tools.keys())
      .filter(name => {
        const tool = this.tools.get(name);
        return tool && (tool.maxDepth ?? Infinity) >= depth;
      })
      .join(', ');

    let template = this.systemPromptTemplate;
    if (!template) {
        // Fallback if loadSystemPrompt failed or hasn't run
        template = `You are VoltClaw (depth {depth}/{maxDepth}).
A recursive autonomous coding agent.

OBJECTIVE:
You solve complex tasks by breaking them down into smaller subtasks and delegating them to new instances of yourself using the 'delegate' tool.
You also have access to file system tools to read, write, and list files. Use these to manipulate code and data directly.

RECURSION STRATEGY:
1. Analyze the request. Is it simple? Solve it directly.
2. Is it complex? Break it down.
3. Use 'delegate' to spawn a sub-agent for each sub-task.
4. Combine the results.

TOOLS:
{tools}

CONSTRAINTS:
- Budget: {budget}
- Max Depth: {maxDepth}
- Current Depth: {depth}
{depthWarning}

You are persistent, efficient, and recursive.`;
    }

    const depthWarning = depth >= this.maxDepth - 1
        ? '- WARNING: MAX DEPTH REACHED. DO NOT DELEGATE. SOLVE DIRECTLY.'
        : '';

    return template
        .replace('{depth}', String(depth))
        .replace('{maxDepth}', String(this.maxDepth))
        .replace('{budget}', String(this.budgetUSD))
        .replace('{tools}', toolNames)
        .replace('{depthWarning}', depthWarning);
  }

  private getToolDefinitions(depth: number): Array<{ name: string; description: string }> {
    return Array.from(this.tools.entries())
      .filter(([_, tool]) => (tool.maxDepth ?? Infinity) >= depth)
      .map(([name, tool]) => ({ name, description: tool.description }));
  }

  private pruneHistory(session: Session): void {
    if (session.history.length > this.maxHistory) {
      session.history = session.history.slice(-this.maxHistory);
    }
  }

  private async pruneAllSessions(): Promise<void> {
    const sessions = await this.store.getAll?.() ?? {};
    for (const session of Object.values(sessions)) {
      this.pruneHistory(session);
    }
    await this.store.save?.();
  }

  on<K extends keyof import('./types.js').EventMap>(
    event: K,
    handler: (...args: import('./types.js').EventMap[K]) => void
  ): Unsubscribe {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    const handlers = this.eventHandlers.get(event)!;
    handlers.add(handler as (...args: unknown[]) => void);
    return () => {
      handlers.delete(handler as (...args: unknown[]) => void);
    };
  }

  private emit(event: string, ...args: unknown[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(...args);
      }
    }
  }

  static builder(): VoltClawAgentBuilder {
    return new VoltClawAgentBuilder();
  }
}

class VoltClawAgentBuilder {
  private options: VoltClawAgentOptions = {};

  withLLM(llm: LLMProvider | ((b: LLMBuilder) => LLMProvider)): this {
    if (typeof llm === 'function') {
      this.options.llm = llm(new LLMBuilder());
    } else {
      this.options.llm = llm;
    }
    return this;
  }

  withTransport(transport: Transport | ((b: TransportBuilder) => Transport)): this {
    if (typeof transport === 'function') {
      this.options.transport = transport(new TransportBuilder());
    } else {
      this.options.transport = transport;
    }
    return this;
  }

  withPersistence(store: Store): this {
    this.options.persistence = store;
    return this;
  }

  withDelegation(config: DelegationBuilder | ((b: DelegationBuilder) => DelegationBuilder)): this {
    const builder = typeof config === 'function' ? config(new DelegationBuilder()) : config;
    this.options.delegation = builder.build();
    return this;
  }

  withHooks(hooks: import('./types.js').HooksConfig): this {
    this.options.hooks = hooks;
    return this;
  }

  use(middleware: Middleware): this {
    this.options.middleware = [...(this.options.middleware ?? []), middleware];
    return this;
  }

  build(): VoltClawAgent {
    return new VoltClawAgent(this.options);
  }
}

class LLMBuilder {
  private config: Partial<import('./types.js').LLMConfig> = {};

  ollama(): this {
    this.config.provider = 'ollama';
    return this;
  }

  openai(): this {
    this.config.provider = 'openai';
    return this;
  }

  anthropic(): this {
    this.config.provider = 'anthropic';
    return this;
  }

  model(model: string): this {
    this.config.model = model;
    return this;
  }

  baseUrl(url: string): this {
    this.config.baseUrl = url;
    return this;
  }

  rateLimit(maxPerMinute: number): this {
    this.config.rateLimit = { maxPerMinute };
    return this;
  }

  build(): import('./types.js').LLMConfig {
    if (!this.config.provider || !this.config.model) {
      throw new ConfigurationError('LLM provider and model are required');
    }
    return this.config as import('./types.js').LLMConfig;
  }
}

class TransportBuilder {
  private config: Partial<import('./types.js').TransportConfig> = {};

  nostr(): this {
    this.config.type = 'nostr';
    return this;
  }

  websocket(): this {
    this.config.type = 'websocket';
    return this;
  }

  stdio(): this {
    this.config.type = 'stdio';
    return this;
  }

  memory(): this {
    this.config.type = 'memory';
    return this;
  }

  relays(...relays: string[]): this {
    this.config.relays = relays;
    return this;
  }

  privateKey(key: string): this {
    this.config.privateKey = key;
    return this;
  }

  build(): import('./types.js').TransportConfig {
    if (!this.config.type) {
      throw new ConfigurationError('Transport type is required');
    }
    return this.config as import('./types.js').TransportConfig;
  }
}

class DelegationBuilder {
  private config: import('./types.js').DelegationConfig = {};

  maxDepth(depth: number): this {
    this.config.maxDepth = depth;
    return this;
  }

  maxCalls(calls: number): this {
    this.config.maxCalls = calls;
    return this;
  }

  budget(usd: number): this {
    this.config.budgetUSD = usd;
    return this;
  }

  timeout(ms: number): this {
    this.config.timeoutMs = ms;
    return this;
  }

  build(): import('./types.js').DelegationConfig {
    return this.config;
  }
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts: number; baseDelayMs: number; maxDelayMs: number }
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === options.maxAttempts || !isRetryable(error)) {
        throw lastError;
      }

      const delay = Math.min(
        options.baseDelayMs * Math.pow(2, attempt - 1),
        options.maxDelayMs
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error('Retry failed');
}

export { withRetry };
