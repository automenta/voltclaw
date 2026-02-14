# VoltClaw Development Roadmap

## Vision

**One agent. Any task. Endless depth. Zero friction.**

VoltClaw is a recursive autonomous agent platform enabling self-evolving AI systems through:
- **Recursive delegation** - Agents spawn sub-agents for complex tasks
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
| Session management | ✅ | `src/core/agent.ts:202-211` |
| Builder API | ✅ | `src/core/agent.ts:691-846` |
| Middleware pipeline | ✅ | `src/core/types.ts:93-104` |
| Lifecycle hooks | ✅ | `src/core/types.ts:54-59` |

### Built-in Tools

| Tool | Description | Status | File |
|------|-------------|--------|------|
| `read_file` | Read file contents | ✅ | `src/tools/files.ts:15-34` |
| `write_file` | Write content to file | ✅ | `src/tools/files.ts:36-56` |
| `list_files` | List directory contents | ✅ | `src/tools/files.ts:58-77` |
| `http_get` | HTTP GET requests | ✅ | `src/tools/http.ts` |
| `http_post` | HTTP POST requests | ✅ | `src/tools/http.ts` |
| `time` | Get current time | ✅ | `src/tools/time.ts` |
| `date` | Get current date | ✅ | `src/tools/time.ts` |
| `sleep` | Pause execution | ✅ | `src/tools/time.ts` |
| `estimate_tokens` | Token estimation | ✅ | `src/tools/delegate.ts:54-72` |
| `delegate` | Recursive sub-agent | ✅ | `src/core/agent.ts:546-593` |

### CLI Commands

| Command | Description | Status |
|---------|-------------|--------|
| `voltclaw start` | Start agent daemon | ✅ |
| `voltclaw repl` | Interactive REPL | ✅ |
| `voltclaw "query"` | One-shot query | ✅ |
| `voltclaw dm <npub> <msg>` | Send Nostr DM | ✅ |
| `voltclaw config` | Show configuration | ✅ |
| `voltclaw keys` | Show identity | ✅ |

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
| Retry with backoff | ✅ | `src/core/agent.ts:848-876` |
| Delegation guardrails | ✅ | `src/core/agent.ts:38-44` |
| Graceful shutdown | ✅ | `src/cli/index.ts:200-216` |

---

## Phase 1: Critical Fixes

### 1.1 Fix Delegation Result Flow

**Priority:** P0 (Blocking)  
**Effort:** Medium  
**Impact:** Critical  

**Problem:** The `delegate` tool sends subtask via transport but never waits for the result. The `handleSubtaskResult` method processes results asynchronously but the tool returns immediately with `{ status: 'delegated' }` instead of the actual result.

**Current Flow (Broken):**
```
Agent calls delegate tool
  → Sends message to self via transport
  → Returns { status: 'delegated' }
  → LLM continues without result
  → Result arrives later via handleMessage
  → Result goes to session.subTasks[subId]
  → Never returned to calling context
```

**Target Flow (Fixed):**
```
Agent calls delegate tool
  → Sends message to self via transport
  → Waits for result with timeout
  → Returns { status: 'completed', result: "..." }
  → LLM receives actual sub-agent output
```

**Implementation:**

```typescript
// src/core/agent.ts

private async executeDelegate(
  args: Record<string, unknown>,
  session: Session,
  from: string
): Promise<ToolCallResult> {
  const task = args.task as string;
  const summary = args.summary as string | undefined;
  const depth = session.depth + 1;

  // Guardrails
  if (depth > this.maxDepth) {
    throw new MaxDepthExceededError(this.maxDepth, depth);
  }
  if (session.delegationCount >= this.maxCalls) {
    return { error: 'Max delegations exceeded' };
  }

  // Cost estimation
  const estCost = this.estimateDelegationCost(task, summary);
  if (session.estCostUSD + estCost > this.budgetUSD * 0.8) {
    throw new BudgetExceededError(this.budgetUSD, session.estCostUSD);
  }

  session.delegationCount++;
  session.estCostUSD += estCost;

  const subId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  
  // Create pending subtask
  session.subTasks[subId] = {
    createdAt: Date.now(),
    task,
    arrived: false,
    resolve: undefined,
    reject: undefined
  };

  // Send subtask
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

  // Wait for result
  try {
    const result = await this.waitForSubtaskResult(subId, session);
    return { status: 'completed', result, subId, depth };
  } catch (error) {
    return { 
      error: error instanceof Error ? error.message : String(error),
      subId 
    };
  }
}

private async waitForSubtaskResult(
  subId: string, 
  session: Session,
  timeoutMs: number = this.timeoutMs
): Promise<string> {
  return new Promise((resolve, reject) => {
    const sub = session.subTasks[subId];
    if (!sub) {
      reject(new Error(`Subtask ${subId} not found`));
      return;
    }

    // Store resolvers for handleSubtaskResult to call
    sub.resolve = resolve;
    sub.reject = reject;

    // Timeout
    const timer = setTimeout(() => {
      sub.arrived = true;
      sub.error = `Timeout after ${timeoutMs}ms`;
      reject(new TimeoutError(`Subtask ${subId} timed out`));
    }, timeoutMs);

    // Store timer for cleanup
    sub.timer = timer;
  });
}

// Update handleSubtaskResult
private async handleSubtaskResult(
  session: Session,
  parsed: Record<string, unknown>,
  _from: string
): Promise<void> {
  const subId = parsed.subId as string;
  const sub = session.subTasks[subId];
  if (!sub) return;

  // Clear timeout
  if (sub.timer) {
    clearTimeout(sub.timer);
  }

  sub.arrived = true;
  
  if (parsed.error) {
    sub.error = parsed.error as string;
    sub.reject?.(new Error(sub.error));
  } else {
    sub.result = parsed.result as string;
    sub.resolve?.(sub.result);
  }

  await this.store.save?.();
}
```

**SubTaskInfo Update:**

```typescript
// src/core/types.ts

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
```

**Acceptance Criteria:**
- [ ] `delegate` tool returns actual sub-agent result
- [ ] Timeout handled gracefully with error message
- [ ] Multiple sequential delegations work correctly
- [ ] Test: `test/integration/delegation.test.ts`

---

### 1.2 Fix `--recursive` Flag Position

**Priority:** P0  
**Effort:** Low  
**Impact:** High  

**Problem:** CLI parser requires flag after query string, which is unintuitive.

```bash
# Current (confusing)
voltclaw "query" --recursive

# Expected (natural)
voltclaw --recursive "query"
voltclaw -r "query"
```

**Implementation:**

```typescript
// src/cli/index.ts

async function run(args: string[]): Promise<void> {
  // Parse flags first
  let recursive = false;
  let verbose = false;
  let debug = false;
  let dryRun = false;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--recursive' || arg === '-r') {
      recursive = true;
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--debug' || arg === '-d') {
      debug = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      return;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  // Handle commands
  const command = positional[0];
  
  if (!command) {
    printHelp();
    return;
  }

  // One-shot query mode
  if (!['start', 'repl', 'keys', 'config', 'dm', 'health', 'session'].includes(command)) {
    const query = positional.join(' ');
    await oneShotQuery(query, { recursive, verbose, debug, dryRun });
    return;
  }

  // ... rest of command handling
}
```

**Acceptance Criteria:**
- [ ] `voltclaw -r "query"` works
- [ ] `voltclaw --recursive "query"` works
- [ ] Flags work in any order
- [ ] Test: `test/unit/cli.test.ts`

---

### 1.3 Progress Indicators

**Priority:** P1  
**Effort:** Low  
**Impact:** High  

**Problem:** Long-running recursive tasks have no feedback, making agent appear frozen.

**Implementation:**

```typescript
// src/cli/index.ts

async function oneShotQuery(
  query: string, 
  options: { recursive: boolean; verbose: boolean; debug: boolean; dryRun: boolean }
): Promise<void> {
  const config = await loadConfig();
  const keys = await loadOrGenerateKeys();
  const llm = createLLMProvider(config.llm);
  const transport = new NostrClient({ relays: config.relays, privateKey: keys.secretKey });
  const store = new FileStore({ path: path.join(VOLTCLAW_DIR, 'data.json') });
  const tools = await createAllTools();

  const agent = new VoltClawAgent({
    llm,
    transport,
    persistence: store,
    delegation: options.recursive ? config.delegation : { ...config.delegation, maxDepth: 1 },
    tools,
    hooks: {
      onDelegation: options.recursive ? (ctx) => {
        const indicator = options.verbose ? ctx.task.slice(0, 60) : '';
        console.log(`  → [Depth ${ctx.depth}] Delegating... ${indicator}`);
      } : undefined
    }
  });

  // Verbose mode: show tool calls
  if (options.verbose) {
    agent.on('tool_call' as any, ({ tool, args }: any) => {
      const argsStr = JSON.stringify(args).slice(0, 80);
      console.log(`  ⚙ [Tool] ${tool}(${argsStr})`);
    });
  }

  await agent.start();

  try {
    console.log(`\n❯ ${query}\n`);
    const response = await agent.query(query);
    console.log(`\n${response}\n`);
  } finally {
    await agent.stop();
  }
}
```

**Output Example:**
```
❯ Analyze this codebase with recursive delegation

  → [Depth 1] Delegating... Summarize core module
  → [Depth 1] Delegating... Summarize llm module
  → [Depth 1] Delegating... Summarize nostr module
  ⚙ [Tool] read_file({"path":"src/core/types.ts"})

**Module Summaries:**
...
```

**Acceptance Criteria:**
- [ ] Shows delegation depth and task preview
- [ ] `--verbose` shows all tool calls
- [ ] Non-verbose mode shows minimal output
- [ ] Works in REPL mode too

---

## Phase 2: Tool Expansion

### 2.1 `grep` Tool

**Priority:** P1  
**Effort:** Low  

Search file contents with regex patterns.

```typescript
// src/tools/grep.ts

import { z } from 'zod';
import { readFile } from 'fs/promises';
import { glob } from 'glob';
import type { Tool, ToolCallResult } from './types.js';

const GrepSchema = z.object({
  pattern: z.string().describe('Regex pattern to search for'),
  path: z.string().optional().default('.').describe('File or directory to search'),
  ignoreCase: z.boolean().optional().default(false).describe('Case insensitive'),
  include: z.string().optional().describe('Glob pattern for files to include (e.g., *.ts)'),
  maxMatches: z.number().optional().default(100).describe('Maximum matches to return')
});

interface GrepMatch {
  file: string;
  line: number;
  content: string;
  match: string;
}

export const grepTool: Tool = {
  name: 'grep',
  description: 'Search for regex patterns in files. Returns matching lines with file path and line number.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search for' },
      path: { type: 'string', description: 'File or directory to search (default: current directory)' },
      ignoreCase: { type: 'boolean', description: 'Case insensitive search' },
      include: { type: 'string', description: 'Glob pattern for files to include (e.g., *.ts)' },
      maxMatches: { type: 'number', description: 'Maximum matches to return (default: 100)' }
    },
    required: ['pattern']
  },
  execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    const parsed = GrepSchema.safeParse(args);
    if (!parsed.success) {
      return { error: `Invalid arguments: ${parsed.error.issues[0].message}` };
    }

    const { pattern, path, ignoreCase, include, maxMatches } = parsed.data;
    
    try {
      const regex = new RegExp(pattern, ignoreCase ? 'gi' : 'g');
      const matches: GrepMatch[] = [];
      
      // Find files to search
      const pattern_ = include || '**/*';
      const files = await glob(pattern_, { 
        cwd: path, 
        nodir: true, 
        ignore: ['node_modules/**', 'dist/**', '.git/**']
      });

      for (const file of files) {
        if (matches.length >= maxMatches) break;
        
        try {
          const content = await readFile(`${path}/${file}`, 'utf-8');
          const lines = content.split('\n');
          
          for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
            const line = lines[i];
            const match = line.match(regex);
            if (match) {
              matches.push({
                file,
                line: i + 1,
                content: line.slice(0, 200),
                match: match[0]
              });
            }
          }
        } catch {
          // Skip unreadable files
        }
      }

      return { 
        matches,
        count: matches.length,
        truncated: matches.length >= maxMatches
      };
    } catch (error) {
      return { error: `Invalid regex pattern: ${pattern}` };
    }
  }
};
```

**Acceptance Criteria:**
- [ ] Regex patterns work correctly
- [ ] Case insensitive option works
- [ ] Returns file, line number, and content
- [ ] Respects maxMatches limit
- [ ] Ignores node_modules, dist, .git

---

### 2.2 `glob` Tool

**Priority:** P1  
**Effort:** Low  

Find files by glob pattern.

```typescript
// src/tools/glob.ts

import { z } from 'zod';
import { glob as globFn } from 'glob';
import type { Tool, ToolCallResult } from './types.js';

const GlobSchema = z.object({
  pattern: z.string().describe('Glob pattern (e.g., **/*.ts, src/**/*.test.ts)'),
  path: z.string().optional().default('.').describe('Base directory'),
  ignore: z.array(z.string()).optional().describe('Patterns to ignore')
});

export const globTool: Tool = {
  name: 'glob',
  description: 'Find files matching a glob pattern. Use to discover files by name or extension.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern (e.g., **/*.ts)' },
      path: { type: 'string', description: 'Base directory (default: current directory)' },
      ignore: { type: 'array', items: { type: 'string' }, description: 'Patterns to ignore' }
    },
    required: ['pattern']
  },
  execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    const parsed = GlobSchema.safeParse(args);
    if (!parsed.success) {
      return { error: `Invalid arguments: ${parsed.error.issues[0].message}` };
    }

    const { pattern, path, ignore } = parsed.data;

    try {
      const files = await globFn(pattern, {
        cwd: path,
        nodir: true,
        ignore: ignore || ['node_modules/**', 'dist/**', '.git/**']
      });

      return { 
        files,
        count: files.length 
      };
    } catch (error) {
      return { error: `Glob error: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
};
```

---

### 2.3 `edit` Tool

**Priority:** P1  
**Effort:** Medium  

Make targeted file edits by replacing specific text.

```typescript
// src/tools/edit.ts

import { z } from 'zod';
import { readFile, writeFile } from 'fs/promises';
import type { Tool, ToolCallResult } from './types.js';

const EditSchema = z.object({
  path: z.string().describe('File to edit'),
  oldString: z.string().describe('Exact text to find and replace'),
  newString: z.string().describe('Replacement text'),
  replaceAll: z.boolean().optional().default(false).describe('Replace all occurrences')
});

export const editTool: Tool = {
  name: 'edit',
  description: 'Edit a file by replacing specific text. Use for targeted modifications without rewriting entire file.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File to edit' },
      oldString: { type: 'string', description: 'Exact text to find and replace' },
      newString: { type: 'string', description: 'Replacement text' },
      replaceAll: { type: 'boolean', description: 'Replace all occurrences (default: false)' }
    },
    required: ['path', 'oldString', 'newString']
  },
  execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    const parsed = EditSchema.safeParse(args);
    if (!parsed.success) {
      return { error: `Invalid arguments: ${parsed.error.issues[0].message}` };
    }

    const { path, oldString, newString, replaceAll } = parsed.data;

    try {
      const content = await readFile(path, 'utf-8');

      // Check if oldString exists
      if (!content.includes(oldString)) {
        return { error: `Text not found in file: "${oldString.slice(0, 50)}..."` };
      }

      // Check for multiple occurrences when not using replaceAll
      const occurrences = content.split(oldString).length - 1;
      if (occurrences > 1 && !replaceAll) {
        return { 
          error: `Found ${occurrences} occurrences. Use replaceAll: true to replace all, or provide more specific oldString.` 
        };
      }

      // Perform replacement
      const updated = replaceAll
        ? content.split(oldString).join(newString)
        : content.replace(oldString, newString);

      await writeFile(path, updated, 'utf-8');

      return { 
        status: 'success', 
        path,
        replacements: replaceAll ? occurrences : 1
      };
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return { error: `File not found: ${path}` };
      }
      if ((error as any).code === 'EACCES') {
        return { error: `Permission denied: ${path}` };
      }
      return { error: `Edit failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
};
```

---

### 2.4 `execute` Tool

**Priority:** P2  
**Effort:** Medium  

Run shell commands safely with sandboxing.

```typescript
// src/tools/execute.ts

import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { Tool, ToolCallResult } from './types.js';

const execAsync = promisify(exec);

const ExecuteSchema = z.object({
  command: z.string().describe('Command to execute'),
  timeout: z.number().optional().default(30000).describe('Timeout in ms (default: 30000)'),
  cwd: z.string().optional().describe('Working directory')
});

// Dangerous patterns to block
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//,           // rm -rf /
  />\s*\/dev\//,              // Writing to device files
  /mkfs/,                     // Format filesystem
  /dd\s+if=/,                 // dd commands
  /:\(\)\{.*:\};\s*:/,        // Fork bombs
];

export const executeTool: Tool = {
  name: 'execute',
  description: 'Execute a shell command. Use for running tests, git commands, npm scripts. Dangerous commands are blocked.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command to execute' },
      timeout: { type: 'number', description: 'Timeout in ms (default: 30000)' },
      cwd: { type: 'string', description: 'Working directory' }
    },
    required: ['command']
  },
  execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    const parsed = ExecuteSchema.safeParse(args);
    if (!parsed.success) {
      return { error: `Invalid arguments: ${parsed.error.issues[0].message}` };
    }

    const { command, timeout, cwd } = parsed.data;

    // Safety check
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return { error: `Command blocked for safety: matches dangerous pattern` };
      }
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        cwd,
        maxBuffer: 1024 * 1024 * 10  // 10MB buffer
      });

      return {
        status: 'success',
        stdout: stdout.slice(0, 50000),  // Truncate if too long
        stderr: stderr.slice(0, 10000),
        truncated: stdout.length > 50000
      };
    } catch (error: any) {
      if (error.killed) {
        return { error: `Command timed out after ${timeout}ms` };
      }
      return { 
        error: `Command failed with exit code ${error.code}`,
        stdout: error.stdout?.slice(0, 10000),
        stderr: error.stderr?.slice(0, 10000)
      };
    }
  }
};
```

---

### 2.5 Tool Registry Update

Update `src/tools/index.ts` to export new tools:

```typescript
import { grepTool } from './grep.js';
import { globTool } from './glob.js';
import { editTool } from './edit.js';
import { executeTool } from './execute.js';

export function createBuiltinTools(): Tool[] {
  return [
    // Existing
    timeTool,
    dateTool,
    sleepTool,
    estimateTokensTool,
    httpGetTool,
    httpPostTool,
    readFileTool,
    writeFileTool,
    listFilesTool,
    restartTool,
    // New
    grepTool,
    globTool,
    editTool,
    executeTool
  ];
}
```

---

## Phase 3: User Experience

### 3.1 Parallel Delegation

**Priority:** P1  
**Effort:** Medium  

Spawn multiple sub-agents concurrently.

```typescript
// src/tools/delegate-parallel.ts

import { z } from 'zod';
import type { Tool, ToolCallResult } from './types.js';

const DelegateParallelSchema = z.object({
  tasks: z.array(z.object({
    task: z.string(),
    summary: z.string().optional()
  })).min(1).max(10).describe('Tasks to delegate in parallel (max 10)')
});

export function createDelegateParallelTool(
  executeDelegate: (args: { task: string; summary?: string }) => Promise<ToolCallResult>,
  session: Session
): Tool {
  return {
    name: 'delegate_parallel',
    description: 'Delegate multiple independent tasks in parallel. Use when subtasks do not depend on each other.',
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              task: { type: 'string' },
              summary: { type: 'string' }
            },
            required: ['task']
          },
          description: 'List of tasks to delegate in parallel (max 10)'
        }
      },
      required: ['tasks']
    },
    execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
      const parsed = DelegateParallelSchema.safeParse(args);
      if (!parsed.success) {
        return { error: `Invalid arguments: ${parsed.error.issues[0].message}` };
      }

      const { tasks } = parsed.data;

      // Check budget for all tasks
      const totalEstCost = tasks.reduce((sum, t) => 
        sum + estimateDelegationCost(t.task, t.summary), 0);
      
      if (session.estCostUSD + totalEstCost > this.budgetUSD * 0.8) {
        return { error: `Insufficient budget for ${tasks.length} parallel delegations` };
      }

      // Execute in parallel
      const results = await Promise.all(
        tasks.map(t => executeDelegate({ task: t.task, summary: t.summary }))
      );

      return {
        status: 'completed',
        results: results.map((r, i) => ({
          task: tasks[i].task.slice(0, 50),
          ...r
        }))
      };
    }
  };
}
```

---

### 3.2 Better Error Messages

**Priority:** P2  
**Effort:** Low  

```typescript
// src/tools/errors.ts

export function formatToolError(tool: string, error: unknown, args?: Record<string, unknown>): string {
  // File system errors
  if ((error as any).code === 'ENOENT') {
    const path = args?.path || args?.file || 'unknown';
    return `File not found: ${path}`;
  }
  if ((error as any).code === 'EACCES') {
    const path = args?.path || args?.file || 'unknown';
    return `Permission denied: ${path}`;
  }
  if ((error as any).code === 'EISDIR') {
    return `Expected file but found directory: ${args?.path}`;
  }
  if ((error as any).code === 'ENOTDIR') {
    return `Expected directory but found file: ${args?.path}`;
  }

  // Network errors
  if ((error as any).code === 'ECONNREFUSED') {
    return `Connection refused: ${args?.url || 'unknown host'}`;
  }
  if ((error as any).code === 'ETIMEDOUT') {
    return `Connection timed out: ${args?.url || 'unknown host'}`;
  }
  if ((error as any).code === 'ENOTFOUND') {
    return `Host not found: ${args?.url}`;
  }

  // HTTP errors
  if ((error as any).status) {
    const status = (error as any).status;
    const statusMessages: Record<number, string> = {
      400: 'Bad request',
      401: 'Unauthorized - check API key',
      403: 'Forbidden - insufficient permissions',
      404: 'Not found',
      429: 'Rate limited - try again later',
      500: 'Server error',
      502: 'Bad gateway',
      503: 'Service unavailable'
    };
    return `HTTP ${status}: ${statusMessages[status] || 'Unknown error'}`;
  }

  // Generic error
  const message = error instanceof Error ? error.message : String(error);
  return `${tool} failed: ${message}`;
}
```

---

### 3.3 `--verbose` and `--debug` Flags

**Priority:** P2  
**Effort:** Low  

```typescript
// src/cli/index.ts

interface CLIOptions {
  recursive: boolean;
  verbose: boolean;
  debug: boolean;
  dryRun: boolean;
  json: boolean;
  quiet: boolean;
}

function parseFlags(args: string[]): { options: CLIOptions; positional: string[] } {
  const options: CLIOptions = {
    recursive: false,
    verbose: false,
    debug: false,
    dryRun: false,
    json: false,
    quiet: false
  };
  const positional: string[] = [];

  for (const arg of args) {
    if (arg === '--recursive' || arg === '-r') options.recursive = true;
    else if (arg === '--verbose' || arg === '-v') options.verbose = true;
    else if (arg === '--debug' || arg === '-d') options.debug = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--quiet' || arg === '-q') options.quiet = true;
    else if (!arg.startsWith('-')) positional.push(arg);
  }

  return { options, positional };
}
```

---

## Phase 4: Production Ready

### 4.1 Health Check Command

```bash
voltclaw health [--json]
```

```typescript
// src/cli/commands/health.ts

async function healthCommand(json: boolean): Promise<void> {
  const config = await loadConfig();
  const checks: HealthCheck[] = [];

  // LLM check
  const llmCheck = await checkLLM(config.llm);
  checks.push(llmCheck);

  // Transport check
  const transportCheck = await checkTransport(config.relays);
  checks.push(transportCheck);

  // Storage check
  const storageCheck = await checkStorage();
  checks.push(storageCheck);

  if (json) {
    console.log(JSON.stringify({ checks, healthy: checks.every(c => c.healthy) }, null, 2));
    return;
  }

  for (const check of checks) {
    const icon = check.healthy ? '✓' : '✗';
    console.log(`${icon} ${check.name}: ${check.message}`);
  }

  const allHealthy = checks.every(c => c.healthy);
  console.log(allHealthy ? '\nSystem healthy' : '\nSystem has issues');
  process.exit(allHealthy ? 0 : 1);
}

async function checkLLM(config: LLMConfig): Promise<HealthCheck> {
  try {
    const llm = createLLMProvider(config);
    const start = Date.now();
    await llm.chat([{ role: 'user', content: 'ping' }], { maxTokens: 5 });
    const latency = Date.now() - start;
    
    return {
      name: 'LLM',
      healthy: true,
      message: `${config.provider}/${config.model} (connected, ${latency}ms latency)`
    };
  } catch (error) {
    return {
      name: 'LLM',
      healthy: false,
      message: `${config.provider}/${config.model} - ${error instanceof Error ? error.message : 'unreachable'}`
    };
  }
}
```

---

### 4.2 Session Management

```bash
voltclaw session list
voltclaw session show <id>
voltclaw session clear
voltclaw session export <id>
```

---

### 4.3 Streaming Output

```typescript
// src/llm/types.ts

export interface LLMProvider {
  // ... existing
  stream?(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk>;
}

export interface ChatChunk {
  content?: string;
  toolCalls?: Partial<ToolCall>;
  done?: boolean;
}

// src/llm/ollama.ts

async *stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk> {
  const response = await fetch(`${this.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: this.model,
      messages: messages.map(m => this.formatMessage(m)),
      stream: true,
      tools: options?.tools
    })
  });

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      const data = JSON.parse(line);
      if (data.message?.content) {
        yield { content: data.message.content };
      }
    }
  }

  yield { done: true };
}
```

---

## Phase 5: Ecosystem

### 5.1 Plugin System

```typescript
// src/core/plugin.ts

export interface VoltClawPlugin {
  name: string;
  version: string;
  description?: string;
  
  // Lifecycle
  init?(agent: VoltClawAgent): Promise<void>;
  start?(agent: VoltClawAgent): Promise<void>;
  stop?(agent: VoltClawAgent): Promise<void>;
  
  // Contributions
  tools?: Tool[];
  middleware?: Middleware[];
  providers?: Record<string, LLMProviderFactory>;
}

export class PluginManager {
  private plugins: Map<string, VoltClawPlugin> = new Map();
  
  async load(pluginName: string): Promise<void> {
    const plugin = await import(pluginName);
    this.plugins.set(pluginName, plugin.default || plugin);
  }
  
  getTools(): Tool[] {
    return Array.from(this.plugins.values())
      .flatMap(p => p.tools || []);
  }
  
  getMiddleware(): Middleware[] {
    return Array.from(this.plugins.values())
      .flatMap(p => p.middleware || []);
  }
}
```

---

### 5.2 Interactive Tool Approval

```typescript
// For destructive operations with --interactive flag

const DESTRUCTIVE_TOOLS = ['execute', 'write_file', 'edit', 'delete'];

async function executeToolWithApproval(
  name: string,
  args: Record<string, unknown>,
  interactive: boolean
): Promise<ToolCallResult> {
  if (interactive && DESTRUCTIVE_TOOLS.includes(name)) {
    const approved = await promptApproval(name, args);
    if (!approved) {
      return { error: 'Tool execution cancelled by user' };
    }
  }
  return executeTool(name, args);
}

async function promptApproval(name: string, args: Record<string, unknown>): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`\nTool call: ${name}(${JSON.stringify(args).slice(0, 100)})`);
    process.stdout.write('Allow? [y/N/a=always/s=skip]: ');
    
    process.stdin.once('data', (data) => {
      const answer = data.toString().trim().toLowerCase();
      resolve(answer === 'y' || answer === 'yes' || answer === 'a');
    });
  });
}
```

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
│  │  │ files   │ │ delegate │ │  grep   │ │  execute    │  │   │
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
│  │  on('tool_call') │ on('tool_result') │ on('delegation') │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

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
| Recursive delegation | `test/integration/delegation.test.ts` | Results flow back |
| Error recovery | `test/integration/errors.test.ts` | Graceful handling |
| Session persistence | `test/integration/persistence.test.ts` | State survives restart |

### Test Utilities

```typescript
// Example: Delegation test
describe('Delegation', () => {
  it('returns sub-agent result to calling context', async () => {
    const harness = await TestHarness.create({
      llm: new MockLLM({
        patterns: [
          { match: /delegate/, respond: () => 'use delegate' },
          { match: /summarize/, respond: () => 'Summary: core module handles agent logic' }
        ]
      })
    });

    const result = await harness.query('Analyze the core module');
    
    expect(result).toContain('core module');
    expect(harness.delegationCount).toBeGreaterThan(0);
  });
});
```

---

## Success Metrics

| Metric | Current | Target | Measure |
|--------|---------|--------|---------|
| Delegation end-to-end | ❌ | ✅ | Integration test passes |
| Tool execution rate | 90% | 99% | Successful tool calls / total |
| Error message helpfulness | 30% | 95% | User survey / error clarity score |
| Time to first response | <5s | <2s | Benchmark with mock LLM |
| Test coverage | 70% | 90% | `vitest --coverage` |
| TypeScript strict | ✅ | ✅ | `tsc --noEmit` |
| ESLint | ✅ | ✅ | `eslint .` |
| Recursive depth | 4 | 4+ | Max delegation depth |
| Parallel delegations | 0 | 10 | Max concurrent sub-agents |

---

## Contributing

### Before Starting

1. Read this PLAN.md thoroughly
2. Check existing tests for patterns
3. Review similar implementations

### When Adding Features

1. Write tests first (TDD)
2. Update PLAN.md with completion status
3. Add JSDoc comments to public APIs
4. Update README.md if user-facing
5. Run `pnpm lint && pnpm typecheck && pnpm test`

### Commit Convention

```
feat: add grep tool for file content search
fix: delegation results now return to caller
docs: update README with parallel delegation
test: add integration test for delegation flow
refactor: extract error formatting to separate module
```