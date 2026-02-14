export interface VoltClawAgentOptions {
  llm?: LLMProvider | LLMConfig;
  transport?: Transport | TransportConfig;
  persistence?: Store | PersistenceConfig;
  delegation?: DelegationConfig;
  history?: HistoryConfig;
  tools?: Tool[] | ToolsConfig;
  hooks?: HooksConfig;
  middleware?: Middleware[];
  logger?: Logger | LoggerConfig;
}

export interface LLMConfig {
  provider: 'ollama' | 'openai' | 'anthropic';
  model: string;
  baseUrl?: string;
  apiKey?: string;
  rateLimit?: RateLimitConfig;
}

export interface RateLimitConfig {
  maxPerMinute: number;
}

export interface TransportConfig {
  type: 'nostr' | 'websocket' | 'stdio' | 'memory';
  relays?: string[];
  privateKey?: string;
  port?: number;
}

export interface PersistenceConfig {
  type: 'file' | 'sqlite' | 'memory';
  path?: string;
}

export interface DelegationConfig {
  maxDepth?: number;
  maxCalls?: number;
  budgetUSD?: number;
  timeoutMs?: number;
}

export interface HistoryConfig {
  maxMessages?: number;
  autoPruneInterval?: number;
}

export interface ToolsConfig {
  builtins?: string[];
  directories?: string[];
}

export interface HooksConfig {
  onMessage?: (ctx: MessageContext) => Promise<void>;
  onReply?: (ctx: ReplyContext) => Promise<void>;
  onDelegation?: (ctx: DelegationContext) => Promise<void>;
  onError?: (ctx: ErrorContext) => Promise<void>;
}

export interface LoggerConfig {
  level?: 'debug' | 'info' | 'warn' | 'error';
  format?: 'pretty' | 'json';
}

export interface MessageContext {
  from: string;
  content: string;
  timestamp: Date;
  metadata: MessageMeta;
}

export interface ReplyContext {
  to: string;
  content: string;
  timestamp: Date;
  inReplyTo?: string;
}

export interface DelegationContext {
  taskId: string;
  task: string;
  depth: number;
  parentPubkey?: string;
}

export interface ErrorContext {
  error: Error;
  context?: Record<string, unknown>;
  timestamp: Date;
}

export type Middleware = (
  ctx: MiddlewareContext,
  next: () => Promise<void>
) => Promise<void>;

export interface MiddlewareContext {
  from: string;
  message: string;
  reply?: string;
  session: Session;
  metadata: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export interface QueryOptions {
  timeout?: number;
  metadata?: Record<string, unknown>;
}

export type Unsubscribe = () => void;

export type EventMap = {
  message: [MessageContext];
  reply: [ReplyContext];
  delegation: [DelegationContext];
  error: [ErrorContext];
  start: [];
  stop: [];
};

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  readonly supportsTools?: boolean;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  countTokens?(text: string): number;
}

export interface ChatOptions {
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
}

export interface Transport {
  readonly type: string;
  readonly identity: { publicKey: string };
  start(): Promise<void>;
  stop(): Promise<void>;
  send(to: string, content: string): Promise<void>;
  subscribe(handler: MessageHandler): Unsubscribe;
  on(event: 'connected' | 'disconnected' | 'error', handler: EventHandler): void;
}

export type MessageHandler = (
  from: string,
  content: string,
  meta: MessageMeta
) => Promise<void>;

export type EventHandler = (...args: unknown[]) => void;

export interface MessageMeta {
  eventId?: string;
  timestamp?: number;
  kind?: number;
  tags?: string[][];
}

export interface Store {
  get(key: string, isSelf?: boolean): Session;
  getAll(): Record<string, Session>;
  load(): Promise<void>;
  save(): Promise<void>;
  clear(): void;
}

export interface Session {
  history: ChatMessage[];
  delegationCount: number;
  estCostUSD: number;
  actualTokensUsed: number;
  subTasks: Record<string, SubTaskInfo>;
  depth: number;
  topLevelStartedAt: number;
}

export interface SubTaskInfo {
  createdAt: number;
  task: string;
  arrived: boolean;
  result?: string;
  error?: string;
  resolve?: (value: string) => void;
  reject?: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

export interface Tool {
  name: string;
  description: string;
  parameters?: ToolParameters;
  execute: (args: Record<string, unknown>) => Promise<ToolCallResult> | ToolCallResult;
  maxDepth?: number;
  costMultiplier?: number;
}

export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolParameterProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  enum?: string[];
  items?: ToolParameterProperty;
  properties?: Record<string, ToolParameterProperty>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: ToolParameters;
}

export interface ToolCallResult {
  [key: string]: unknown;
  error?: string;
  status?: string;
  result?: string;
  subId?: string;
  depth?: number;
  estCost?: number;
}
