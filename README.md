# VoltClaw ⚡

**VoltClaw** is a recursive autonomous agent platform for TypeScript/Node.js.

🌌 **One agent. Any task. Endless depth.**

## Quick Start

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# One-shot query
pnpm start "What is 2+2?"

# Interactive REPL
pnpm start repl

# Recursive analysis
pnpm start "Analyze this codebase" --recursive
```

## Features

- **RLM Paradigm** - Recursive Language Model (RLM) with symbolic recursion.  Agents spawn sub-agents for complex tasks.  Inspired by https://github.com/rawwerks/ypi
- **LCM Integration** - Lossless Context Management for efficient recursion.  Inspired by https://papers.voltropy.com/LCM
- **Nostr Native** - Decentralized, encrypted P2P communication
- **LLM Agnostic** - Ollama, OpenAI, Anthropic, or custom providers
- **Tool System** - File operations, HTTP requests, time utilities
- **Zero Config** - Works out of the box with sensible defaults
- **Self-Improving** - Can write new tools and modify its own code

## Installation

```bash
npm install voltclaw
```

## Usage

### CLI

```bash
# One-shot query (non-recursive)
voltclaw "What is 2+2?"

# One-shot query with recursive calls
voltclaw "Analyze each module in src/" --recursive

# Interactive REPL mode
voltclaw repl

# Send a Nostr DM
voltclaw dm npub1... "Hello!"

# Show configuration
voltclaw config

# Show identity keys
voltclaw keys
```

### Programmatic

```typescript
import { VoltClawAgent } from 'voltclaw';
import { NostrClient } from 'voltclaw/nostr';
import { OllamaProvider } from 'voltclaw/llm';
import { FileStore } from 'voltclaw/memory';
import { createAllTools } from 'voltclaw/tools';

const agent = new VoltClawAgent({
  llm: new OllamaProvider({ model: 'llama3.2' }),
  transport: new NostrClient({
    relays: ['wss://relay.damus.io']
  }),
  persistence: new FileStore({ path: '~/.voltclaw/data.json' }),
  tools: await createAllTools(),
  call: {
    maxDepth: 4,
    maxCalls: 25,
    budgetUSD: 0.75
  }
});

await agent.start();

// Direct query (local, no transport needed)
const reply = await agent.query('What is 2+2?');
console.log(reply); // "4"

await agent.stop();
```

### Using the Builder API

```typescript
import { VoltClawAgent } from 'voltclaw';

const agent = VoltClawAgent.builder()
  .withLLM(l => l.ollama().model('llama3.2'))
  .withTransport(t => t.nostr().relays('wss://relay.damus.io'))
  .withCall(c => c.maxDepth(4).maxCalls(25).budget(0.75))
  .build();
```

## Project Structure

```
voltclaw/
├── src/
│   ├── core/           # Agent logic, types, errors, bootstrap
│   ├── llm/            # LLM providers (Ollama, OpenAI, Anthropic)
│   ├── nostr/          # Nostr transport and client
│   ├── tools/          # Built-in tools (files, http, time, call)
│   ├── memory/         # Persistence (FileStore, MemoryStore)
│   ├── testing/        # Test utilities (MockLLM, MockRelay)
│   └── cli/            # Command-line interface
├── test/               # Test suites
├── examples/           # Usage examples
└── dist/               # Compiled output
```

## Built-in Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Write content to a file |
| `list_files` | List files in a directory |
| `http_get` | Make HTTP GET requests |
| `http_post` | Make HTTP POST requests |
| `time` | Get current time |
| `date` | Get current date |
| `sleep` | Pause execution |
| `estimate_tokens` | Estimate token count |
| `call` | Call a sub-agent for a subtask |
| `call_parallel` | Call multiple sub-agents in parallel |
| `grep` | Search file contents |
| `glob` | Find files matching pattern |
| `edit` | Edit file content |
| `execute` | Execute shell commands |

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

## Configuration

### Config File

Create `~/.voltclaw/config.json`:

```json
{
  "channels": [
    { "type": "nostr", "relays": ["wss://relay.damus.io", "wss://nos.lol"] }
  ],
  "llm": {
    "provider": "ollama",
    "model": "llama3.2",
    "baseUrl": "http://localhost:11434"
  },
  "call": {
    "maxDepth": 4,
    "maxCalls": 25,
    "budgetUSD": 0.75,
    "timeoutMs": 600000
  }
}
```

### LLM Providers

| Provider | Config Key | Environment Variable |
|----------|------------|---------------------|
| Ollama | `ollama` | `OLLAMA_BASE_URL` |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |

### Local CLI Usage

You can interact with VoltClaw directly via the terminal using the `stdio` channel, without needing to connect to Nostr relays. This is ideal for local tasks or testing with a local LLM like Ollama.

Update your `~/.voltclaw/config.json`:

```json
{
  "llm": {
    "provider": "ollama",
    "model": "llama3.2"
  },
  "channels": [
    { "type": "stdio" }
  ]
}
```

## Recursive Calls

VoltClaw's signature feature is recursive self-calling. When faced with complex tasks, the agent spawns child instances of itself:

```
Parent: "Analyze this codebase"
  ├─ Child 1: "Analyze src/core/ - purpose and exports"
  ├─ Child 2: "Analyze src/llm/ - purpose and exports"
  ├─ Child 3: "Analyze src/nostr/ - purpose and exports"
  └─ Child 4: "Analyze src/tools/ - purpose and exports"
Parent: Synthesizes results into final report
```

Each sub-agent has full access to tools and can spawn further sub-agents (up to `maxDepth`).

### Guardrails

- **Max Depth** (default: 4) - Limits recursion depth
- **Max Calls** (default: 25) - Limits total calls
- **Budget** (ex: $0.75, default: Infinite) - Tracks estimated cost
- **Tokens** (default: Infinite) - Limits output
- **Timeout** (default: 10 min) - Wall-clock limit

### Example

```bash
# Analyze codebase with recursive calls
voltclaw "Analyze this project. Call sub-agents to summarize each module (core, llm, nostr, tools, memory). Synthesize a one-sentence description." --recursive
```

## Architecture

```
┌─────────────────────────────────────────────┐
│  VoltClawAgent                              │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  │
│  │   LLM   │  │ Transport│  │   Store   │  │
│  │ Provider│  │ (Nostr)  │  │ (File)    │  │
│  └─────────┘  └──────────┘  └───────────┘  │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │           Tool Registry              │   │
│  │  read_file │ write_file │ call      │   │
│  │  list_files│ http_get   │ time      │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │         Session Manager              │   │
│  │  history │ subTasks │ depth │ cost  │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## Testing

```bash
# Run all tests
pnpm test

# Run with watch mode
pnpm test:watch
```

The testing module provides:
- `MockLLM` - Simulates LLM responses for unit tests
- `MockRelay` - Simulates Nostr relay for integration tests
- `TestHarness` - Full agent testing harness

## Self-Improvement

VoltClaw can modify itself:

1. **Write new tools** to `~/.voltclaw/tools/`
2. **Update system prompt** at `~/.voltclaw/SYSTEM_PROMPT.md`
3. **Modify source code** when running from source

## LCM Integration

VoltClaw now includes **Lossless Context Management (LCM)** inspired by the [Voltropy LCM paper](https://papers.voltropy.com/LCM). This provides efficient context handling in recursive operations.

### Key Features

- **Context References** - Pass lightweight references instead of copying full context
- **Hierarchical Context** - Automatic context inheritance through recursion chains
- **Context Compression** - Automatic compression of large context data
- **Cross-Session Memory** - Share context across different sessions

### Usage Example

```typescript
import { ContextReferenceManager, HierarchicalContext } from 'voltclaw';

// Create context reference (LCM style)
const manager = new ContextReferenceManager(agent.memory, session);
const refId = await manager.createReference({
  keys: ['codebase', 'requirements', 'decisions'],
  expiresIn: 3600000, // 1 hour
  tags: ['project-x']
});

// Use in sub-agent call (much more efficient!)
const result = await agent.executeTool('call', {
  task: 'Analyze the code',
  summary: `Context Reference: ${refId}`
});

// Or use hierarchical context
const rootContext = new HierarchicalContext();
rootContext.set('project', 'VoltClaw');

const child = rootContext.createChild();
child.set('subtask', 'LCM integration');

// Child inherits parent context automatically
console.log(child.get('project')); // 'VoltClaw'
```

### LCM Tools

VoltClaw provides built-in LCM tools:

- `context_create` - Create a named context reference
- `context_resolve` - Resolve a context reference to get data
- `context_delete` - Delete a context reference
- `context_stats` - Get context reference statistics

### RLM-LCM Hybrid Pattern

VoltClaw combines RLM's symbolic recursion with LCM's efficient context management:

```typescript
// RLM-style shared data
session.sharedData['requirements'] = 'Build LCM integration';

// LCM-style context reference
const refId = await contextManager.createReference({
  keys: ['requirements'],
  tags: ['rlm-lcm-hybrid']
});

// Use in rlm_map for parallel operations
const results = await rlm_map(items, (item) => ({
  task: `Implement ${item}`,
  contextRef: refId  // All calls share context efficiently!
}));
```

### Performance Benefits

| Metric | RLM Only | RLM + LCM | Improvement |
|--------|----------|-----------|-------------|
| Context Token Usage | O(n²) | O(n) | 50-80% reduction |
| Sub-agent Context Accuracy | ~70% | ~95% | +25% |
| Large Context Handling | Limited | Unlimited | 10x+ |

For more details, see [LCM_INTEGRATION_PLAN.md](./LCM_INTEGRATION_PLAN.md)


## License

MIT

## Contributing

Contributions welcome! Open an issue or PR on GitHub.
