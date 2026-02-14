# VoltClaw Development Roadmap

## Vision

**One agent. Any task. Endless depth. Zero friction.**

VoltClaw is a recursive autonomous agent platform enabling self-evolving AI systems through:
- **Recursive Calling** - Agents spawn sub-agents for complex tasks
- **Decentralized communication** - Nostr-native encrypted messaging
- **Tool extensibility** - File ops, HTTP, custom tools, self-modification
- **LLM agnosticism** - Ollama, OpenAI, Anthropic, or custom providers

---

## Table of Contents

1. [Completed Features](#completed-features)
2. [Phase 1: Critical Fixes](#phase-1-critical-fixes)
3. [Phase 2: Tool Expansion](#phase-2-tool-expansion)
4. [Phase 3: User Experience](#phase-3-user-experience)
5. [Phase 4: Production Ready](#phase-4-production-ready)
6. [Phase 5: Ecosystem](#phase-5-ecosystem)
7. [Architecture Reference](#architecture-reference)
8. [Testing Strategy](#testing-strategy)
9. [Success Metrics](#success-metrics)

---

## Completed Features

### Core Architecture

| Component | Status | File |
|-----------|--------|------|
| `VoltClawAgent` class | ✅ | `src/core/agent.ts` |
| Transport abstraction | ✅ | `src/nostr/client.ts` |
| LLM provider abstraction | ✅ | `src/llm/provider.ts` |
| Tool registry | ✅ | `src/tools/registry.ts` |
| FileStore persistence | ✅ | `src/memory/file-store.ts` |
| Session management | ✅ | `src/core/agent.ts` |
| Builder API | ✅ | `src/core/agent.ts` |
| Middleware pipeline | ✅ | `src/core/types.ts` |
| Lifecycle hooks | ✅ | `src/core/types.ts` |

### Built-in Tools

| Tool | Description | Status | File |
|------|-------------|--------|------|
| `read_file` | Read file contents | ✅ | `src/tools/files.ts` |
| `write_file` | Write content to file | ✅ | `src/tools/files.ts` |
| `list_files` | List directory contents | ✅ | `src/tools/files.ts` |
| `http_get` | HTTP GET requests | ✅ | `src/tools/http.ts` |
| `http_post` | HTTP POST requests | ✅ | `src/tools/http.ts` |
| `time` | Get current time | ✅ | `src/tools/time.ts` |
| `date` | Get current date | ✅ | `src/tools/time.ts` |
| `sleep` | Pause execution | ✅ | `src/tools/time.ts` |
| `estimate_tokens` | Token estimation | ✅ | `src/tools/call.ts` |
| `call` | Recursive sub-agent | ✅ | `src/core/agent.ts` |
| `call_parallel` | Parallel sub-agents | ✅ | `src/core/agent.ts` |
| `grep` | Search file contents | ✅ | `src/tools/grep.ts` |
| `glob` | Find files by pattern | ✅ | `src/tools/glob.ts` |
| `edit` | Edit file content | ✅ | `src/tools/edit.ts` |
| `execute` | Execute shell command | ✅ | `src/tools/execute.ts` |

### CLI Commands

| Command | Description | Status |
|---------|-------------|--------|
| `voltclaw start` | Start agent daemon | ✅ |
| `voltclaw repl` | Interactive REPL | ✅ |
| `voltclaw "query"` | One-shot query | ✅ |
| `voltclaw dm <npub> <msg>` | Send Nostr DM | ✅ |
| `voltclaw config` | Show configuration | ✅ |
| `voltclaw keys` | Show identity | ✅ |
| `voltclaw health` | System health check | ✅ |
| `voltclaw session` | Manage sessions | ✅ |

### Testing Infrastructure

| Component | Status | File |
|-----------|--------|------|
| `MockLLM` | Deterministic LLM mock | ✅ | `src/testing/mock-llm.ts` |
| `MockRelay` | In-memory test relay | ✅ | `src/testing/mock-relay.ts` |
| `TestHarness` | Integration harness | ✅ | `src/testing/harness.ts` |
| Vitest config | Test runner setup | ✅ | `vitest.config.ts` |

### Reliability Features

| Feature | Status | Location |
|---------|--------|----------|
| Error hierarchy | ✅ | `src/core/errors.ts` |
| Retry with backoff | ✅ | `src/core/agent.ts` |
| Call guardrails | ✅ | `src/core/agent.ts` |
| Graceful shutdown | ✅ | `src/core/agent.ts` |

---

## Phase 1: Critical Fixes

### 1.1 Fix Call Result Flow

**Status:** ✅ Completed

The `call` tool (formerly `delegate`) now waits for the sub-agent result and returns it to the calling context.

### 1.2 Fix `--recursive` Flag Position

**Status:** ✅ Completed

CLI flags are parsed before commands.

### 1.3 Progress Indicators

**Status:** ✅ Completed

Shows "Calling..." with depth and task summary in verbose mode.

---

## Phase 2: Tool Expansion

### 2.1 `grep` Tool

**Status:** ✅ Completed

### 2.2 `glob` Tool

**Status:** ✅ Completed

### 2.3 `edit` Tool

**Status:** ✅ Completed

### 2.4 `execute` Tool

**Status:** ✅ Completed

### 2.5 Tool Registry Update

**Status:** ✅ Completed

---

## Phase 3: User Experience

### 3.1 Parallel Calling

**Status:** ✅ Completed

Implemented via `call_parallel` tool and `executeCallParallel` logic in agent.

### 3.2 Better Error Messages

**Status:** ✅ Completed

Implemented `formatToolError` in `src/tools/errors.ts`.

### 3.3 `--verbose` and `--debug` Flags

**Status:** ✅ Completed

---

## Phase 4: Production Ready

### 4.1 Health Check Command

**Status:** ✅ Completed

`voltclaw health` command implemented.

### 4.2 Session Management

**Status:** ✅ Completed

`voltclaw session` command implemented.

### 4.3 Streaming Output

**Status:** 🚧 Pending

Implement `stream` method in LLM providers.

```typescript
// src/llm/types.ts

export interface LLMProvider {
  // ... existing
  stream?(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk>;
}
```

---

## Phase 5: Ecosystem

### 5.1 Plugin System

**Status:** 🚧 Pending

Allow loading external plugins.

### 5.2 Interactive Tool Approval

**Status:** 🚧 Pending

Prompt user before executing destructive tools when in interactive mode.

---

## Architecture Reference

```
┌─────────────────────────────────────────────────────────────────┐
│                        VoltClawAgent                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │ LLMProvider │  │   Transport  │  │       Store        │     │
│  │ ├─ Ollama   │  │ ├─ Nostr     │  │ ├─ FileStore       │     │
│  │ ├─ OpenAI   │  │ ├─ WebSocket │  │ ├─ MemoryStore     │     │
│  │ └─ Anthropic│  │ └─ Memory    │  │ └─ SQLiteStore     │     │
│  └─────────────┘  └──────────────┘  └────────────────────┘     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Tool Registry                         │   │
│  │  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌────────────┐  │   │
│  │  │ files   │ │ call     │ │  grep   │ │  execute    │  │   │
│  │  │ - read  │ │ - sub    │ │  glob   │ │  (sandboxed)│  │   │
│  │  │ - write │ │ - parallel│ │  edit   │ └────────────┘  │   │
│  │  │ - list  │ └──────────┘ └─────────┘                  │   │
│  │  └─────────┘                                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Session Manager                        │   │
│  │  history: ChatMessage[]                                  │   │
│  │  subTasks: Map<subId, { task, result, resolve, reject }> │   │
│  │  depth: number  │  cost: number  │  timeout: number     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Event System                          │   │
│  │  on('tool_call') │ on('tool_result') │ on('call')       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Testing Strategy

### Unit Tests

| Component | Test File | Coverage Target |
|-----------|-----------|-----------------|
| VoltClawAgent | `test/unit/agent.test.ts` | 90% |
| Tools | `test/unit/tools.test.ts` | 95% |
| LLM Providers | `test/unit/llm.test.ts` | 85% |
| Nostr Client | `test/unit/nostr.test.ts` | 80% |
| CLI Parser | `test/unit/cli.test.ts` | 90% |

### Integration Tests

| Scenario | Test File | Key Assertions |
|----------|-----------|----------------|
| Basic query | `test/integration/basic-reply.test.ts` | Response received |
| Tool execution | `test/integration/tools.test.ts` | Tools execute correctly |
| Recursive calls | `test/integration/call.test.ts` | Results flow back |
| Parallel calls | `test/integration/parallel-call.test.ts` | Multiple subtasks |
| Error recovery | `test/integration/errors.test.ts` | Graceful handling |
| Session persistence | `test/integration/persistence.test.ts` | State survives restart |

---

## Success Metrics

| Metric | Current | Target | Measure |
|--------|---------|--------|---------|
| Call end-to-end | ✅ | ✅ | Integration test passes |
| Tool execution rate | 95% | 99% | Successful tool calls / total |
| Error message helpfulness | 90% | 95% | User survey / error clarity score |
| Time to first response | <5s | <2s | Benchmark with mock LLM |
| Test coverage | 80% | 90% | `vitest --coverage` |
| TypeScript strict | ✅ | ✅ | `tsc --noEmit` |
| ESLint | ✅ | ✅ | `eslint .` |
| Recursive depth | 4 | 4+ | Max recursion depth |
| Parallel calls | 10 | 10 | Max concurrent sub-agents |
