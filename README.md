# VoltClaw ⚡

**VoltClaw** is an open, self-evolving autonomous agent platform for TypeScript/Node.js.

🌌 **One agent. Any task. Endless depth.**

## Quick Start

```bash
# Install dependencies
pnpm install

# Start the agent
pnpm start

# Or with npx
npx voltclaw start
```

## Features

- **Recursive Delegation** - Agents call themselves for complex tasks
- **Nostr Native** - Decentralized, encrypted communication
- **LLM Agnostic** - Ollama, OpenAI, Anthropic, or custom providers
- **Zero Config** - Works out of the box with sensible defaults
- **Plugin Ready** - Extend with tools, transports, providers
- **Production Ready** - Health checks, metrics, graceful shutdown

## Installation

```bash
npm install voltclaw
```

## Usage

### CLI

```bash
# Start the agent
voltclaw start

# Send a DM
voltclaw dm npub1... "Hello!"

# Show configuration
voltclaw config

# Manage keys
voltclaw keys
```

### Programmatic

```typescript
import { VoltClawAgent } from 'voltclaw';
import { NostrClient } from '@voltclaw/nostr';
import { OllamaProvider } from '@voltclaw/llm';
import { FileStore } from '@voltclaw/memory';

const agent = new VoltClawAgent({
  llm: new OllamaProvider({ model: 'llama3.2' }),
  transport: new NostrClient({
    relays: ['wss://relay.damus.io']
  }),
  persistence: new FileStore({ path: '~/.voltclaw/sessions.json' })
});

await agent.start();

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
  .withDelegation(d => d.maxDepth(4).maxCalls(25).budget(0.75))
  .build();
```

## Project Structure

```
voltclaw/
├── packages/
│   ├── voltclaw/           # Core agent library
│   ├── @voltclaw/nostr/    # Nostr transport
│   ├── @voltclaw/llm/      # LLM providers (Ollama, OpenAI, Anthropic)
│   ├── @voltclaw/tools/    # Built-in tools
│   ├── @voltclaw/memory/   # Persistence layer
│   ├── @voltclaw/cli/      # Command-line interface
│   └── @voltclaw/testing/  # Testing utilities
├── examples/               # Usage examples
├── test/                   # Test suites
└── docs/                   # Documentation
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

## Configuration

### Environment Variables

```bash
VOLTCLAW_LLM_PROVIDER=ollama
VOLTCLAW_LLM_MODEL=llama3.2
VOLTCLAW_LLM_URL=http://localhost:11434
VOLTCLAW_NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol
VOLTCLAW_DELEGATION_MAX_DEPTH=4
VOLTCLAW_DELEGATION_MAX_CALLS=25
VOLTCLAW_DELEGATION_BUDGET_USD=0.75
```

### Config File

Create `~/.voltclaw/config.json`:

```json
{
  "relays": ["wss://relay.damus.io"],
  "llm": {
    "provider": "ollama",
    "model": "llama3.2"
  },
  "delegation": {
    "maxDepth": 4,
    "maxCalls": 25,
    "budgetUSD": 0.75
  }
}
```

## Recursive Delegation

VoltClaw's signature feature is recursive self-delegation. When faced with complex tasks, the agent can spawn child instances of itself:

```typescript
// The agent can call itself recursively
// Parent: "Build a landing page"
//   └─ Child: "Research competitors"
//   └─ Child: "Write copy"
//   └─ Child: "Design layout"
// Parent: Synthesizes results into final output
```

Guardrails keep recursion safe:
- Maximum depth (default: 4)
- Maximum calls (default: 25)
- Budget tracking (default: $0.75)
- Timeouts (default: 10 minutes)

## License

MIT

## Contributing

Contributions welcome! Please read the contributing guidelines first.
