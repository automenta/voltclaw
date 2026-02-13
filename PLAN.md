# VoltClaw Development Roadmap

## Vision

**One agent. Any task. Endless depth. Zero friction.**

VoltClaw aims to become the de facto standard for recursive autonomous agents in TypeScript/Node.js. Success requires:

1. **Zero-config startup** - Works instantly, configures later
2. **Progressive complexity** - Simple for hello-world, powerful for production
3. **Ubiquitous integration** - CLI, programmatic, Docker, serverless, edge
4. **Bulletproof reliability** - Graceful degradation, circuit breakers, auto-recovery
5. **Intuitive ergonomics** - Self-documenting, discoverable, predictable
6. **Extensible by design** - Hooks, plugins, middleware at every layer

---

## Project Structure

```
voltclaw/
├── packages/
│   ├── voltclaw/                    # Core agent library
│   │   ├── src/
│   │   │   ├── index.ts             # Public API surface
│   │   │   ├── agent.ts             # VoltClawAgent class
│   │   │   ├── errors.ts            # Typed error hierarchy
│   │   │   └── types.ts             # Public type definitions
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── @voltclaw/nostr/             # Nostr transport layer
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── client.ts            # NostrClient implementation
│   │   │   ├── encryption.ts        # NIP-04/17 abstraction
│   │   │   ├── relay-pool.ts        # Relay management
│   │   │   └── event.ts             # Event creation/validation
│   │   └── package.json
│   │
│   ├── @voltclaw/llm/               # LLM abstraction layer
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── provider.ts          # Provider interface
│   │   │   ├── ollama.ts            # Ollama provider
│   │   │   ├── openai.ts            # OpenAI provider
│   │   │   ├── anthropic.ts         # Anthropic provider
│   │   │   ├── rate-limiter.ts      # Token bucket rate limiting
│   │   │   └── tokenizer.ts         # Token counting utilities
│   │   └── package.json
│   │
│   ├── @voltclaw/tools/             # Built-in tool library
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── registry.ts          # Tool registry
│   │   │   ├── delegate.ts          # Recursive delegation
│   │   │   ├── time.ts
│   │   │   ├── http.ts              # HTTP requests
│   │   │   ├── shell.ts             # Shell execution (opt-in)
│   │   │   └── memory.ts            # Long-term memory tools
│   │   └── package.json
│   │
│   ├── @voltclaw/memory/            # Persistence layer
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── manager.ts           # Session/memory manager
│   │   │   ├── store.ts             # Store interface
│   │   │   ├── file-store.ts        # File-based persistence
│   │   │   ├── sqlite-store.ts      # SQLite persistence
│   │   │   └── redis-store.ts       # Redis persistence (optional)
│   │   └── package.json
│   │
│   ├── @voltclaw/cli/               # Command-line interface
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── commands/
│   │   │   │   ├── start.ts         # voltclaw start
│   │   │   │   ├── config.ts        # voltclaw config
│   │   │   │   ├── keys.ts          # voltclaw keys
│   │   │   │   ├── dm.ts            # voltclaw dm <npub> <msg>
│   │   │   │   └── skill.ts         # voltclaw skill install/list
│   │   │   └── interactive.ts       # REPL mode
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── @voltclaw/testing/           # Testing utilities
│       ├── src/
│       │   ├── index.ts
│       │   ├── mock-relay.ts        # In-memory test relay
│       │   ├── mock-llm.ts          # Deterministic LLM mock
│       │   ├── fixtures.ts          # Test data factories
│       │   └── harness.ts           # Integration test harness
│       └── package.json
│
├── examples/
│   ├── 00-hello-world.ts            # Minimal usage
│   ├── 01-basic-agent.ts            # Single agent
│   ├── 02-custom-llm.ts             # Custom provider
│   ├── 03-custom-tools.ts           # Adding tools
│   ├── 04-custom-transport.ts       # Non-Nostr transport
│   ├── 05-middleware.ts             # Request/response middleware
│   ├── 06-hooks.ts                  # Lifecycle hooks
│   ├── 07-persistence.ts            # SQLite storage
│   ├── 08-multi-session.ts          # Multiple agents
│   ├── 09-cli-usage.ts              # CLI integration
│   └── 10-production.ts             # Full production setup
│
├── docs/
│   ├── getting-started.md
│   ├── configuration.md
│   ├── api-reference.md
│   ├── tools.md
│   ├── llm-providers.md
│   ├── transports.md
│   ├── persistence.md
│   ├── hooks-middleware.md
│   ├── testing.md
│   ├── deployment.md
│   └── migration-guide.md
│
├── test/
│   ├── setup.ts
│   ├── unit/
│   │   ├── agent.test.ts
│   │   ├── tools.test.ts
│   │   └── memory.test.ts
│   └── integration/
│       ├── basic-reply.test.ts
│       ├── delegation.test.ts
│       ├── error-recovery.test.ts
│       └── persistence.test.ts
│
├── package.json                     # Monorepo root
├── pnpm-workspace.yaml              # pnpm workspaces
├── tsconfig.json                    # Base TypeScript config
├── tsconfig.build.json              # Production build config
├── vitest.config.ts                 # Test configuration
├── vitest.workspace.ts              # Workspace test config
├── eslint.config.js                 # ESLint flat config
├── .github/
│   └── workflows/
│       ├── ci.yml                   # Test, lint, typecheck
│       ├── release.yml              # Automated releases
│       └── docs.yml                 # Deploy docs
│
├── Dockerfile                       # Production container
├── docker-compose.yml               # Local dev stack
└── README.md
```

---

## Phase 1: Core Architecture

### 1.1 VoltClawAgent Class

The single entry point for all agent interactions:

```typescript
import { VoltClawAgent } from 'voltclaw';

// Zero-config: Works instantly
const agent = new VoltClawAgent();
await agent.start();

// Or with explicit config
const agent = new VoltClawAgent({
  llm: { provider: 'ollama', model: 'llama3.2' },
  transport: { type: 'nostr', relays: ['wss://relay.damus.io'] },
  persistence: { type: 'file', path: '~/.voltclaw' }
});

// Listen for messages
agent.on('message', (msg) => console.log(msg));

// Programmatic interaction
const response = await agent.query('What is the capital of France?');

// Graceful shutdown
await agent.stop();
```

### 1.2 Agent Options Interface

```typescript
interface VoltClawAgentOptions {
  // LLM Configuration
  llm?: LLMMProvider | {
    provider: 'ollama' | 'openai' | 'anthropic';
    model: string;
    baseUrl?: string;
    apiKey?: string;
    rateLimit?: { maxPerMinute: number };
  };

  // Transport Layer
  transport?: Transport | {
    type: 'nostr' | 'websocket' | 'stdio' | 'memory';
    // Nostr-specific
    relays?: string[];
    privateKey?: string;
    // WebSocket-specific  
    port?: number;
  };

  // Persistence
  persistence?: Store | {
    type: 'file' | 'sqlite' | 'memory';
    path?: string;
  };

  // Delegation Guardrails
  delegation?: {
    maxDepth?: number;           // default: 4
    maxCalls?: number;           // default: 25
    budgetUSD?: number;          // default: 0.75
    timeoutMs?: number;          // default: 600000
  };

  // History & Memory
  history?: {
    maxMessages?: number;        // default: 60
    autoPruneInterval?: number;  // default: 300000
  };

  // Tools
  tools?: Tool[] | {
    builtins?: string[];         // ['delegate', 'time', 'http']
    directories?: string[];      // Custom skill directories
  };

  // Hooks
  hooks?: {
    onMessage?: (ctx: MessageContext) => Promise<void>;
    onReply?: (ctx: ReplyContext) => Promise<void>;
    onDelegation?: (ctx: DelegationContext) => Promise<void>;
    onError?: (ctx: ErrorContext) => Promise<void>;
  };

  // Middleware
  middleware?: Middleware[];

  // Logging
  logger?: Logger | {
    level?: 'debug' | 'info' | 'warn' | 'error';
    format?: 'pretty' | 'json';
  };
}
```

### 1.3 Transport Abstraction

Enable any bidirectional messaging system:

```typescript
interface Transport {
  readonly type: string;
  readonly identity: { publicKey: string };
  
  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
  
  // Messaging
  send(to: string, content: string): Promise<void>;
  subscribe(handler: MessageHandler): Unsubscribe;
  
  // Optional: Query historical messages
  query?(filter: QueryFilter): Promise<Message[]>;
  
  // Events
  on(event: 'connected' | 'disconnected' | 'error', handler: Function): void;
}

type MessageHandler = (from: string, content: string, meta: MessageMeta) => Promise<void>;
```

### 1.4 LLM Provider Abstraction

Support any LLM backend:

```typescript
interface LLMProvider {
  readonly name: string;
  readonly model: string;
  
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  
  // Optional: Streaming support
  stream?(messages: Message[], options?: ChatOptions): AsyncIterable<ChatChunk>;
  
  // Optional: Token counting
  countTokens?(text: string): number;
  
  // Optional: Tool/function calling
  supportsTools?: boolean;
}

interface ChatOptions {
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: { promptTokens: number; completionTokens: number };
}
```

---

## Phase 2: Reliability Engineering

### 2.1 Circuit Breaker Pattern

Prevent cascade failures:

```typescript
class CircuitBreaker {
  private failures = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private lastFailureTime = 0;
  
  constructor(
    private threshold = 5,
    private resetTimeoutMs = 30000
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = 'half-open';
      } else {
        throw new CircuitOpenError('Circuit breaker is open');
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }
  
  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }
  
  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
}
```

### 2.2 Retry with Exponential Backoff

```typescript
interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: boolean;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      
      if (attempt === options.maxAttempts) break;
      if (!isRetryable(err)) break;
      
      const delay = calculateBackoff(attempt, options);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

function calculateBackoff(attempt: number, options: RetryOptions): number {
  const delay = Math.min(
    options.baseDelayMs * Math.pow(options.multiplier, attempt - 1),
    options.maxDelayMs
  );
  
  if (options.jitter) {
    return delay * (0.5 + Math.random());
  }
  return delay;
}
```

### 2.3 Graceful Degradation

When LLM is unavailable, agent still functions:

```typescript
class VoltClawAgent {
  private fallbackHandlers = new Map<string, FallbackHandler>();
  
  registerFallback(pattern: string | RegExp, handler: FallbackHandler) {
    this.fallbackHandlers.set(pattern.toString(), handler);
  }
  
  private async handleWithFallback(msg: string): Promise<string> {
    // Try LLM first
    try {
      return await this.llm.chat([{ role: 'user', content: msg }]);
    } catch (err) {
      this.logger.warn('LLM unavailable, checking fallbacks', { error: err });
      
      // Check fallback handlers
      for (const [pattern, handler] of this.fallbackHandlers) {
        if (new RegExp(pattern).test(msg)) {
          return handler(msg);
        }
      }
      
      // Default fallback
      return 'I am currently experiencing technical difficulties. ' +
             'Please try again in a moment.';
    }
  }
}
```

### 2.4 Session Recovery

Resume interrupted sessions:

```typescript
class SessionRecovery {
  async recover(agent: VoltClawAgent): Promise<void> {
    const pending = await this.store.getPendingSubtasks();
    
    for (const subtask of pending) {
      const age = Date.now() - subtask.createdAt;
      
      if (age > agent.config.delegation.timeoutMs) {
        await this.markTimedOut(subtask);
      } else {
        await this.resubscribe(subtask);
      }
    }
    
    agent.logger.info('Session recovery complete', { 
      recovered: pending.length 
    });
  }
}
```

---

## Phase 3: Ergonomics & Developer Experience

### 3.1 Zero-Config Bootstrap

```typescript
// The simplest possible usage
import 'voltclaw/auto';

// Creates agent, loads config from env/files, starts listening
// Equivalent to running `voltclaw start` from CLI
```

### 3.2 Environment Variable Convention

All options configurable via environment:

```bash
# LLM
VOLTCLAW_LLM_PROVIDER=ollama
VOLTCLAW_LLM_MODEL=llama3.2
VOLTCLAW_LLM_URL=http://localhost:11434

# Nostr
VOLTCLAW_NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol
VOLTCLAW_NOSTR_PRIVATE_KEY=nsec1...

# Delegation
VOLTCLAW_DELEGATION_MAX_DEPTH=4
VOLTCLAW_DELEGATION_MAX_CALLS=25
VOLTCLAW_DELEGATION_BUDGET_USD=0.75

# Persistence
VOLTCLAW_PERSISTENCE_TYPE=file
VOLTCLAW_PERSISTENCE_PATH=~/.voltclaw

# Logging
VOLTCLAW_LOG_LEVEL=info
VOLTCLAW_LOG_FORMAT=json
```

### 3.3 Config File Hierarchy

Load from multiple sources in order of precedence:

```
1. Environment variables (highest)
2. CLI arguments
3. .voltclawrc.json (local)
4. .voltclaw/config.json (local)
5. ~/.voltclaw/config.json (user)
6. /etc/voltclaw/config.json (system)
7. Built-in defaults (lowest)
```

```typescript
const config = await loadConfig({
  sources: [
    { type: 'defaults' },
    { type: 'file', path: '/etc/voltclaw/config.json' },
    { type: 'file', path: '~/.voltclaw/config.json' },
    { type: 'file', path: '.voltclaw/config.json' },
    { type: 'file', path: '.voltclawrc.json' },
    { type: 'env', prefix: 'VOLTCLAW_' },
    { type: 'cli' }
  ]
});
```

### 3.4 Fluent Builder API

For programmatic configuration:

```typescript
const agent = VoltClawAgent.builder()
  .withLLM(l => l
    .ollama()
    .model('llama3.2')
    .rateLimit(30, 'perMinute')
  )
  .withTransport(t => t
    .nostr()
    .relays('wss://relay.damus.io', 'wss://nos.lol')
    .privateKeyFromEnv('NOSTR_PRIVATE_KEY')
  )
  .withPersistence(p => p
    .sqlite()
    .path('~/.voltclaw/data.db')
  )
  .withDelegation(d => d
    .maxDepth(4)
    .maxCalls(25)
    .budget(0.75, 'USD')
    .timeout(10, 'minutes')
  )
  .withHooks(h => h
    .onMessage(logMessage)
    .onReply(logReply)
    .onError(sendAlert)
  )
  .build();
```

### 3.5 Middleware Pipeline

Composable request/response processing:

```typescript
const agent = new VoltClawAgent()
  .use(loggingMiddleware())
  .use(rateLimitMiddleware({ maxPerMinute: 60 }))
  .use(authMiddleware({ allowedPubkeys }))
  .use(validationMiddleware())
  .use(metricsMiddleware());

// Custom middleware
function loggingMiddleware(): Middleware {
  return async (ctx, next) => {
    console.log(`[${new Date().toISOString()}] ${ctx.from}: ${ctx.message}`);
    await next();
    console.log(`[${new Date().toISOString()}] Reply: ${ctx.reply?.slice(0, 50)}...`);
  };
}
```

### 3.6 Lifecycle Hooks

React to agent lifecycle events:

```typescript
agent.hooks.onStart(async () => {
  console.log('Agent started');
});

agent.hooks.onStop(async () => {
  console.log('Agent stopped');
});

agent.hooks.onDelegationStart(async (ctx) => {
  console.log(`Delegating: ${ctx.task}`);
});

agent.hooks.onDelegationComplete(async (ctx) => {
  console.log(`Delegation complete: ${ctx.result}`);
});

agent.hooks.onError(async (ctx) => {
  Sentry.captureException(ctx.error);
});

agent.hooks.onBudgetExceeded(async (ctx) => {
  await notifyAdmin(`Budget exceeded: ${ctx.used}/${ctx.limit}`);
});
```

---

## Phase 4: CLI & Interactive Experience

### 4.1 Command Structure

```bash
voltclaw [command] [options]

Commands:
  start                 Start the agent daemon
  dm <npub> <message>   Send a DM to another agent
  config [key] [value]  View or edit configuration
  keys                  Manage identity keys
  skill                 Manage skills/plugins
  version               Show version info

Options:
  --config <path>       Path to config file
  --log-level <level>   Set log level (debug, info, warn, error)
  --json                Output in JSON format
  -h, --help            Show help
```

### 4.2 Start Command

```bash
# Basic start
voltclaw start

# With options
voltclaw start --llm ollama:llama3.2 --relays wss://relay.damus.io

# Foreground mode (no daemon)
voltclaw start --foreground

# With custom config
voltclaw start --config ./voltclaw.production.json
```

### 4.3 DM Command

```bash
# Send a DM
voltclaw dm npub1abc123... "Hello, agent!"

# Interactive mode
voltclaw dm npub1abc123... --interactive

# Wait for reply
voltclaw dm npub1abc123... "What is 2+2?" --wait
```

### 4.4 Config Command

```bash
# Show all config
voltclaw config

# Show specific key
voltclaw config llm.model

# Set a value
voltclaw config delegation.maxDepth 6

# Export config
voltclaw config --export > my-config.json
```

### 4.5 Keys Command

```bash
# Show current identity
voltclaw keys

# Generate new identity
voltclaw keys generate

# Import from nsec
voltclaw keys import nsec1...

# Export to nsec (with warning)
voltclaw keys export

# Backup to file
voltclaw keys backup ./keys-backup.json
```

### 4.6 Skill Command

```bash
# List installed skills
voltclaw skill list

# Install from npm
voltclaw skill install @voltclaw/skill-http

# Install from local directory
voltclaw skill install ./my-skill

# Install from git
voltclaw skill install github:user/voltclaw-skill-custom

# Remove skill
voltclaw skill remove @voltclaw/skill-http

# Create new skill scaffold
voltclaw skill create my-skill
```

### 4.7 Interactive REPL

```bash
voltclaw repl

> Hello!
[Agent] Hello! How can I help you today?

> status
Session Status:
  Delegations: 0
  Budget: $0.00 / $0.75
  Depth: 0

> delegate "Calculate 5!"
[Agent] Delegating to child instance...
[Agent] Result: 120

> exit
Goodbye!
```

---

## Phase 5: Testing Infrastructure

### 5.1 Test Harness

```typescript
import { TestHarness, MockRelay, MockLLM } from '@voltclaw/testing';

describe('Agent', () => {
  let harness: TestHarness;
  
  beforeEach(async () => {
    harness = new TestHarness({
      llm: new MockLLM({
        responses: {
          'hello': 'Hello! How can I help?',
          'status': 'All systems operational.'
        }
      }),
      relay: new MockRelay()
    });
    
    await harness.start();
  });
  
  afterEach(async () => {
    await harness.stop();
  });
  
  it('responds to greetings', async () => {
    const reply = await harness.query('hello');
    expect(reply).toBe('Hello! How can I help?');
  });
});
```

### 5.2 Mock LLM with Fixtures

```typescript
const mockLLM = new MockLLM({
  // Static responses
  responses: {
    'ping': 'pong'
  },
  
  // Pattern matching
  patterns: [
    { match: /what is (\d+)\+(\d+)\?/, respond: (_, a, b) => `${a + b}` }
  ],
  
  // Full handler
  handler: async (messages) => {
    const lastMsg = messages[messages.length - 1].content;
    return { content: `Echo: ${lastMsg}` };
  },
  
  // Simulate delays
  delay: { min: 50, max: 200 },
  
  // Simulate failures
  failureRate: 0.1
});
```

### 5.3 Integration Test Patterns

```typescript
describe('Delegation', () => {
  it('delegates complex tasks', async () => {
    const harness = await TestHarness.create({
      llm: mockLLM.withToolSupport()
    });
    
    const reply = await harness.query('Factorial of 5');
    
    expect(harness.delegationCount).toBeGreaterThan(0);
    expect(reply).toMatch(/120/);
  });
  
  it('respects max depth', async () => {
    const harness = await TestHarness.create({
      delegation: { maxDepth: 2 }
    });
    
    await harness.query('Very complex task');
    
    expect(harness.maxDepthReached).toBeLessThanOrEqual(2);
  });
  
  it('handles timeout gracefully', async () => {
    const harness = await TestHarness.create({
      delegation: { timeoutMs: 100 },
      llm: mockLLM.withDelay(200)
    });
    
    const reply = await harness.query('Slow task');
    
    expect(reply).toContain('timeout');
  });
});
```

---

## Phase 6: Production Readiness

### 6.1 Health Checks

```typescript
agent.health.addCheck('llm', async () => {
  await agent.llm.chat([{ role: 'user', content: 'ping' }]);
  return { status: 'healthy' };
});

agent.health.addCheck('relays', async () => {
  const connected = agent.transport.connectedRelays;
  const total = agent.transport.configuredRelays;
  return { 
    status: connected > 0 ? 'healthy' : 'degraded',
    connected,
    total 
  };
});

// HTTP endpoint
agent.health.serve(8080); // GET /health
```

### 6.2 Metrics

```typescript
// Built-in metrics
agent.metrics.counter('messages_received');
agent.metrics.counter('messages_sent');
agent.metrics.counter('delegations_started');
agent.metrics.counter('delegations_completed');
agent.metrics.histogram('llm_latency_ms');
agent.metrics.histogram('message_processing_ms');
agent.metrics.gauge('active_sessions');
agent.metrics.gauge('budget_used_usd');

// Export formats
agent.metrics.export('prometheus'); // for Prometheus scraping
agent.metrics.export('json');       // for custom collection
```

### 6.3 Structured Logging

```typescript
// Default: Pretty console
agent.logger.info('Message received', { from: npub, length: msg.length });

// Production: JSON to stdout
VOLTCLAW_LOG_FORMAT=json voltclaw start

// Custom transport
agent.logger.addTransport(new FileTransport('/var/log/voltclaw.log'));
agent.logger.addTransport(new DatadogTransport({ apiKey: '...' }));
```

### 6.4 Graceful Shutdown

```typescript
const shutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  
  // Stop accepting new messages
  agent.pause();
  
  // Wait for in-flight requests
  await agent.drain({ timeout: 30000 });
  
  // Save state
  await agent.persist();
  
  // Close connections
  await agent.stop();
  
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

### 6.5 Docker Support

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy built artifacts
COPY dist/ ./dist/

# Non-root user
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Default command
CMD ["node", "dist/cli.js", "start"]

# Expose health endpoint
EXPOSE 8080
```

### 6.6 Docker Compose for Development

```yaml
version: '3.8'

services:
  voltclaw:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - ~/.voltclaw:/home/node/.voltclaw
    environment:
      - VOLTCLAW_LOG_LEVEL=debug
    depends_on:
      - ollama
  
  ollama:
    image: ollama/ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
  
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    profiles:
      - redis

volumes:
  ollama-data:
```

---

## Phase 7: Extensibility

### 7.1 Plugin System

```typescript
// Plugin interface
interface VoltClawPlugin {
  name: string;
  version: string;
  
  // Lifecycle hooks
  init?(agent: VoltClawAgent): Promise<void>;
  start?(agent: VoltClawAgent): Promise<void>;
  stop?(agent: VoltClawAgent): Promise<void>;
  
  // Contribute tools
  tools?: Tool[];
  
  // Contribute middleware
  middleware?: Middleware[];
  
  // Contribute LLM providers
  llmProviders?: Record<string, LLMProviderFactory>;
  
  // Contribute transports
  transports?: Record<string, TransportFactory>;
}

// Example plugin
const httpSkillPlugin: VoltClawPlugin = {
  name: '@voltclaw/skill-http',
  version: '1.0.0',
  
  tools: [
    {
      name: 'http_get',
      description: 'Make HTTP GET request',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' }
        },
        required: ['url']
      },
      execute: async (params) => {
        const res = await fetch(params.url);
        return { ok: true, value: await res.text() };
      }
    }
  ]
};

// Register plugin
agent.use(httpSkillPlugin);
```

### 7.2 Custom LLM Provider

```typescript
class CustomLLMProvider implements LLMProvider {
  name = 'custom';
  model: string;
  
  constructor(private config: { apiKey: string; model: string }) {
    this.model = config.model;
  }
  
  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    // Implementation
  }
}

// Register globally
VoltClawAgent.registerLLMProvider('custom', (config) => new CustomLLMProvider(config));

// Use
const agent = new VoltClawAgent({
  llm: { provider: 'custom', model: 'my-model', apiKey: '...' }
});
```

### 7.3 Custom Transport

```typescript
class DiscordTransport implements Transport {
  type = 'discord';
  identity = { publicKey: 'discord-user-id' };
  
  constructor(private client: DiscordClient) {}
  
  async send(to: string, content: string): Promise<void> {
    await this.client.users.send(to, content);
  }
  
  subscribe(handler: MessageHandler): Unsubscribe {
    this.client.on('message', (msg) => {
      handler(msg.author.id, msg.content, {});
    });
    return () => this.client.off('message');
  }
}

// Use
const agent = new VoltClawAgent({
  transport: new DiscordTransport(discordClient)
});
```

---

## Phase 8: Documentation

### 8.1 README Structure

```markdown
# VoltClaw ⚡

Recursive autonomous agent platform for TypeScript.

## Quick Start

\`\`\`bash
npx voltclaw start
\`\`\`

## Features

- **Recursive Delegation** - Agents call themselves for complex tasks
- **Nostr Native** - Decentralized, encrypted communication
- **LLM Agnostic** - Ollama, OpenAI, Anthropic, or custom
- **Zero Config** - Works out of the box
- **Plugin Ready** - Extend with tools, transports, providers

## Installation

\`\`\`bash
npm install voltclaw
\`\`\`

## Usage

### CLI

\`\`\`bash
voltclaw start
voltclaw dm npub1... "Hello!"
\`\`\`

### Programmatic

\`\`\`typescript
import { VoltClawAgent } from 'voltclaw';

const agent = new VoltClawAgent();
await agent.start();

const reply = await agent.query('What is 2+2?');
console.log(reply); // "4"

await agent.stop();
\`\`\`

## Documentation

- [Getting Started](./docs/getting-started.md)
- [Configuration](./docs/configuration.md)
- [API Reference](./docs/api-reference.md)
- [Creating Plugins](./docs/plugins.md)

## License

MIT
```

### 8.2 API Documentation

Auto-generated with TypeDoc:

```typescript
/**
 * Creates and manages a recursive autonomous agent.
 * 
 * @example
 * ```typescript
 * const agent = new VoltClawAgent();
 * await agent.start();
 * ```
 */
export class VoltClawAgent {
  /**
   * Process a message and return the agent's response.
   * 
   * @param message - The message to process
   * @param options - Optional processing options
   * @returns The agent's response
   * 
   * @example
   * ```typescript
   * const reply = await agent.query('Hello!');
   * ```
   */
  async query(message: string, options?: QueryOptions): Promise<string>;
}
```

### 8.3 Migration Guide

For users upgrading from single-file version:

```markdown
# Migration from v0.x to v1.0

## Breaking Changes

### Import Path Changed

**Before:**
\`\`\`typescript
// Single file import
import './voltclaw.ts';
\`\`\`

**After:**
\`\`\`typescript
import { VoltClawAgent } from 'voltclaw';

const agent = new VoltClawAgent();
await agent.start();
\`\`\`

### Config File Location

**Before:** `~/.clawvolt/config.json`
**After:** `~/.voltclaw/config.json`

Run migration:
\`\`\`bash
voltclaw migrate
\`\`\`

### Environment Variables

**Before:** `RELAYS`, `LLM_URL`
**After:** `VOLTCLAW_NOSTR_RELAYS`, `VOLTCLAW_LLM_URL`
```

---

## Implementation Roadmap

### Week 1-2: Foundation
- [ ] Monorepo setup (pnpm workspaces)
- [ ] TypeScript strict configuration
- [ ] Core `VoltClawAgent` class
- [ ] Transport abstraction
- [ ] LLM provider abstraction
- [ ] Basic test harness

### Week 3-4: Reliability
- [ ] Circuit breaker
- [ ] Retry with backoff
- [ ] Graceful degradation
- [ ] Session recovery
- [ ] Error hierarchy

### Week 5-6: Ergonomics
- [ ] Zero-config bootstrap
- [ ] Config loading hierarchy
- [ ] Fluent builder API
- [ ] Middleware pipeline
- [ ] Lifecycle hooks

### Week 7-8: CLI & Testing
- [ ] CLI commands (start, dm, config, keys, skill)
- [ ] Interactive REPL
- [ ] Mock LLM with fixtures
- [ ] Mock relay
- [ ] Integration test suite

### Week 9-10: Production
- [ ] Health checks
- [ ] Metrics collection
- [ ] Structured logging
- [ ] Graceful shutdown
- [ ] Docker & docker-compose

### Week 11-12: Extensibility & Docs
- [ ] Plugin system
- [ ] Custom provider/transport guides
- [ ] API documentation (TypeDoc)
- [ ] Examples (10+ scenarios)
- [ ] Migration guide
- [ ] README polish

---

## Success Metrics

| Metric | Target |
|--------|--------|
| TypeScript strict mode | 0 errors |
| ESLint | 0 warnings |
| Test coverage | >90% |
| Bundle size (core) | <50KB gzipped |
| Startup time | <1 second |
| Time to first response | <100ms (mock LLM) |
| Memory footprint | <100MB idle |
| npm weekly downloads | >1000 (6 months) |
| GitHub stars | >500 (6 months) |
| Contributor count | >10 (6 months) |

---

## File Decomposition Map

Current `voltclaw.ts` (556 lines) → Target modules:

| Lines | Content | Target Module |
|-------|---------|---------------|
| 14-74 | Config types/loader | `packages/voltclaw/src/config/` |
| 77-93 | Key management | `packages/voltclaw/src/identity.ts` |
| 96-139 | Memory/Session | `packages/@voltclaw/memory/src/` |
| 143-158 | Tool registry | `packages/@voltclaw/tools/src/registry.ts` |
| 160-161 | Built-in tools | `packages/@voltclaw/tools/src/*.ts` |
| 164-195 | Delegate tool | `packages/@voltclaw/tools/src/delegate.ts` |
| 198-248 | LLM call | `packages/@voltclaw/llm/src/` |
| 251-305 | Nostr client | `packages/@voltclaw/nostr/src/` |
| 309-351 | Helpers | `packages/voltclaw/src/agent/` |
| 354-480 | Message processing | `packages/voltclaw/src/agent/processor.ts` |
| 483-504 | Trace/skills | `packages/voltclaw/src/trace.ts` |
| 507-529 | Recovery | `packages/voltclaw/src/agent/recovery.ts` |
| 532-555 | Main/CLI | `packages/@voltclaw/cli/src/` |

Current `test-integration.ts` (440 lines):

| Lines | Content | Target Module |
|-------|---------|---------------|
| 20-149 | TestRelay | `packages/@voltclaw/testing/src/mock-relay.ts` |
| 151-247 | TestClient | `packages/@voltclaw/testing/src/mock-client.ts` |
| 252-331 | Setup/teardown | `packages/@voltclaw/testing/src/harness.ts` |
| 333-437 | Test cases | `test/integration/*.test.ts` |
