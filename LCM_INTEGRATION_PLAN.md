# LCM Integration Plan for VoltClaw

## Executive Summary

**LCM (Lossless Context Management)** from Voltropy offers a complementary approach to VoltClaw's existing RLM (Record-Label-Model) architecture. This document outlines how to integrate LCM's key innovations while preserving VoltClaw's RLM foundation.

---

## Key Insights from LCM Paper

### 1. Core Problem LCM Solves

**Context Loss in Recursive Operations**: Traditional recursive agent systems lose information during context passing between parent and child agents. This leads to:
- Sub-agents lacking critical context
- Parent agents losing track of sub-task details
- Information degradation through recursion chains
- Token waste from re-explaining context

### 2. LCM vs RLM: Complementary Approaches

| Aspect | RLM (VoltClaw) | LCM (Voltropy) | Integration Opportunity |
|--------|----------------|----------------|------------------------|
| **Recursion Model** | Symbolic recursion (LLM writes scripts) | Native recursion with context preservation | Combine both approaches |
| **Context Handling** | Manual context passing via `summary` | Automatic context capture/restoration | Add LCM-style context management |
| **State Management** | Session-based with `sharedData` | Structured context objects | Enhance with LCM patterns |
| **Memory Efficiency** | Basic summarization | Lossless compression via references | Adopt LCM reference system |

### 3. Key LCM Mechanisms

#### A. Context References (Not Copies)
Instead of copying full context into each sub-agent:
```typescript
// Current RLM approach (copying)
const context = { files: [...], decisions: [...] };
const summary = `Context: ${JSON.stringify(context)}`;

// LCM approach (references)
const contextRef = contextManager.createReference(['files', 'decisions']);
const summary = `Context refs: ${contextRef}`;
```

#### B. Hierarchical Context Stack
```
Parent Context (Level 0)
  ├─ Sub-agent 1 Context (Level 1) - inherits parent refs
  ├─ Sub-agent 2 Context (Level 1) - inherits parent refs
  └─ Sub-agent 3 Context (Level 1) - inherits parent refs
       └─ Nested Context (Level 2) - inherits L1 + L0 refs
```

#### C. Lossless Compression
- Store full context once in shared memory
- Pass lightweight references between agents
- Resolve references on-demand (lazy loading)
- Automatic garbage collection of unused context

---

## Integration Architecture

### Phase 1: Context Reference System (Weeks 1-2)

#### 1.1 Context Reference Manager

```typescript
// src/core/context-manager.ts (enhanced)

interface ContextReference {
  id: string;
  keys: string[];
  createdAt: number;
  expiresAt?: number;
  accessCount: number;
}

export class ContextReferenceManager {
  private references: Map<string, ContextReference> = new Map();
  private contextStore: Map<string, any> = new Map();

  /**
   * Create a reference to context data without copying it
   */
  createReference(keys: string[], sessionId: string): string {
    const refId = `ctx_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const ref: ContextReference = {
      id: refId,
      keys,
      createdAt: Date.now(),
      accessCount: 0
    };
    this.references.set(refId, ref);
    return refId;
  }

  /**
   * Resolve a context reference to actual data
   */
  async resolveReference(refId: string, session: Session): Promise<Record<string, any>> {
    const ref = this.references.get(refId);
    if (!ref) throw new Error(`Context reference not found: ${refId}`);

    ref.accessCount++;
    const result: Record<string, any> = {};

    for (const key of ref.keys) {
      // Try shared data first (RLM-style)
      if (session.sharedData?.[key]) {
        result[key] = session.sharedData[key];
      }
      // Try memory store
      else if (session.memory) {
        const memories = await session.memory.recall({ key });
        if (memories?.length) {
          result[key] = memories.map(m => m.content).join('\n');
        }
      }
    }

    return result;
  }

  /**
   * Clean up expired references
   */
  cleanup(maxAge: number = 3600000): void {
    const now = Date.now();
    for (const [refId, ref] of this.references.entries()) {
      if (ref.expiresAt && now > ref.expiresAt) {
        this.references.delete(refId);
      }
    }
  }
}
```

#### 1.2 Enhanced rlm_call with Context References

```typescript
// src/tools/rlm-helpers.ts (enhanced)

ctxObj.rlm_call = async (subtask: string, options: RLLOptions = {}) => {
  const { contextKeys = [], schema, useReference = true } = options;

  let summary: string;

  if (useReference && contextKeys.length > 0) {
    // LCM-style: Create context reference instead of copying
    const contextRef = contextManager.createReference(contextKeys, session.id);
    summary = `Context Reference: ${contextRef}`;

    // Also store in memory for persistence
    if (agent.memory && contextKeys.length > 2) {
      const extracted = extractContext(contextKeys, session);
      await agent.memory.storeMemory(
        JSON.stringify(extracted),
        'working',
        ['rlm_context', `ref:${contextRef}`],
        8
      );
    }
  } else {
    // Fallback to RLM-style inline context
    summary = buildInlineContext(contextKeys, session);
  }

  return executeCall(subtask, summary, schema);
};
```

### Phase 2: Hierarchical Context Inheritance (Weeks 3-4)

#### 2.1 Context Inheritance Chain

```typescript
// src/core/context-manager.ts

export class HierarchicalContext {
  private parentContext?: HierarchicalContext;
  private localData: Map<string, any> = new Map();
  private inheritedKeys: Set<string> = new Set();

  constructor(parent?: HierarchicalContext) {
    this.parentContext = parent;
    // Automatically inherit all parent keys
    if (parent) {
      for (const key of parent.getAllKeys()) {
        this.inheritedKeys.add(key);
      }
    }
  }

  /**
   * Set a value in local context
   */
  set(key: string, value: any): void {
    this.localData.set(key, value);
  }

  /**
   * Get a value, checking local then inherited context
   */
  get(key: string): any {
    if (this.localData.has(key)) {
      return this.localData.get(key);
    }
    if (this.parentContext) {
      return this.parentContext.get(key);
    }
    return undefined;
  }

  /**
   * Get all accessible keys (local + inherited)
   */
  getAllKeys(): Set<string> {
    const keys = new Set(this.localData.keys());
    if (this.parentContext) {
      for (const key of this.parentContext.getAllKeys()) {
        keys.add(key);
      }
    }
    return keys;
  }

  /**
   * Create a child context that inherits from this one
   */
  createChild(): HierarchicalContext {
    return new HierarchicalContext(this);
  }

  /**
   * Export context as a reference object
   */
  toReference(): ContextReference {
    return {
      keys: Array.from(this.getAllKeys()),
      sessionId: this.sessionId
    };
  }
}
```

#### 2.2 Session Context Enhancement

```typescript
// src/core/types.ts (Session interface enhancement)

interface Session {
  // ... existing fields ...

  // LCM integration
  context?: HierarchicalContext;
  contextReferences?: string[];
  inheritedContext?: Record<string, any>;
}
```

### Phase 3: Lossless Context Compression (Weeks 5-6)

#### 3.1 Context Compression Strategy

```typescript
// src/core/context-compressor.ts

export class ContextCompressor {
  private readonly memory: MemoryManager;
  private readonly threshold: number;

  constructor(memory: MemoryManager, threshold: number = 1000) {
    this.memory = memory;
    this.threshold = threshold; // characters
  }

  /**
   * Compress context by replacing large values with memory references
   */
  async compress(context: Record<string, any>): Promise<CompressedContext> {
    const compressed: Record<string, string | any> = {};
    const largeValues: Map<string, string> = new Map();

    for (const [key, value] of Object.entries(context)) {
      const str = typeof value === 'string' ? value : JSON.stringify(value);

      if (str.length > this.threshold) {
        // Store large value in memory, keep reference
        const memoryId = await this.memory.storeMemory(
          str,
          'working',
          ['compressed_context', key],
          7
        );
        compressed[key] = `mem:${memoryId}`;
        largeValues.set(key, memoryId);
      } else {
        compressed[key] = value;
      }
    }

    return {
      data: compressed,
      largeValues: Object.fromEntries(largeValues),
      originalSize: JSON.stringify(context).length,
      compressedSize: JSON.stringify(compressed).length
    };
  }

  /**
   * Decompress context by resolving memory references
   */
  async decompress(compressed: CompressedContext): Promise<Record<string, any>> {
    const result = { ...compressed.data };

    for (const [key, memId] of Object.entries(compressed.largeValues)) {
      const memories = await this.memory.recall({ id: memId });
      if (memories?.length) {
        result[key] = JSON.parse(memories[0].content);
      }
    }

    return result;
  }
}
```

### Phase 4: RLM-LCM Hybrid Operations (Weeks 7-8)

#### 4.1 Enhanced RLM Map with Context Inheritance

```typescript
// src/tools/rlm-helpers.ts

ctxObj.rlm_map = async (items: any[], mapper: (item: any, index: number) => any) => {
  // LCM enhancement: Share context across all parallel calls
  const contextRef = contextManager.createReference(
    ['sharedData', 'workspaceContext', 'decisions'],
    session.id
  );

  const tasks: any[] = [];
  for (let i = 0; i < items.length; i++) {
    const def = mapper(items[i], i);
    const taskObj = typeof def === 'string' ? { task: def } : def;

    // Inject context reference into each task
    taskObj.contextReference = contextRef;
    taskObj.inheritedKeys = ['sharedData', 'workspaceContext'];

    tasks.push(taskObj);
  }

  return ctxObj.rlm_call_parallel(tasks);
};
```

#### 4.2 Context-Aware rlm_reduce

```typescript
ctxObj.rlm_reduce = async (items: any[], reducer: (acc: any, item: any) => any, initialValue: any) => {
  let acc = initialValue;

  // LCM: Maintain accumulator in shared context for visibility
  const accKey = `reduce_acc_${session.id}_${Date.now()}`;
  await ctxObj.rlm_shared_set(accKey, acc);

  for (let i = 0; i < items.length; i++) {
    const def = reducer(acc, items[i]);
    const task = typeof def === 'string' ? def : def.task;

    // Pass accumulator via context reference
    const options = {
      contextKeys: [accKey],
      ... (typeof def === 'object' ? def : {})
    };

    const res = await ctxObj.rlm_call(task, options);
    acc = res;

    // Update shared accumulator
    await ctxObj.rlm_shared_set(accKey, acc);
  }

  // Cleanup
  await ctxObj.rlm_shared_set(accKey, undefined);
  return acc;
};
```

---

## Performance Benefits

### Expected Improvements

| Metric | Current RLM | With LCM Integration | Improvement |
|--------|-------------|---------------------|-------------|
| Context Token Usage | O(n²) in recursion depth | O(n) with references | 50-80% reduction |
| Sub-agent Context Accuracy | ~70% (manual passing) | ~95% (automatic inheritance) | +25% |
| Large Context Handling | Limited by token window | Unlimited (memory-backed) | 10x+ |
| Cross-session Knowledge | Manual copy/paste | Automatic via references | Significant |

### Token Savings Example

**Before (RLM-only)**:
```
Parent: "Analyze these 10 files" [5000 tokens of file content]
  ├─ Child 1: "Analyze file1" [5000 tokens copied]
  ├─ Child 2: "Analyze file2" [5000 tokens copied]
  └─ ... (50000 tokens total)
```

**After (RLM+LCM)**:
```
Parent: "Analyze these 10 files" [5000 tokens in shared memory]
  ├─ Child 1: "Analyze file1" [ref:ctx_123 = 50 tokens]
  ├─ Child 2: "Analyze file2" [ref:ctx_123 = 50 tokens]
  └─ ... (500 tokens total for context passing)
```

**Savings: ~99% reduction in context passing overhead**

---

## Implementation Checklist

### Phase 1: Context Reference System
- [ ] Implement `ContextReferenceManager` class
- [ ] Add `createReference()` and `resolveReference()` methods
- [ ] Update `rlm_call` to use context references
- [ ] Add reference cleanup/garbage collection
- [ ] Write tests for reference lifecycle

### Phase 2: Hierarchical Context
- [ ] Implement `HierarchicalContext` class
- [ ] Add context inheritance to session creation
- [ ] Update sub-agent spawning to inherit context
- [ ] Add context visualization/debugging tools
- [ ] Document context inheritance patterns

### Phase 3: Context Compression
- [ ] Implement `ContextCompressor` class
- [ ] Add automatic compression for large contexts
- [ ] Integrate with memory manager for storage
- [ ] Add decompression on context access
- [ ] Benchmark compression ratios

### Phase 4: Hybrid Operations
- [ ] Enhance `rlm_map` with context inheritance
- [ ] Enhance `rlm_filter` with context inheritance
- [ ] Enhance `rlm_reduce` with shared accumulator
- [ ] Add new LCM-specific tools:
  - [ ] `context_create`: Create named context
  - [ ] `context_share`: Share context with session
  - [ ] `context_resolve`: Resolve context reference
  - [ ] `context_compress`: Compress large context
- [ ] Update documentation with LCM patterns

---

## New Tools for LCM

### context_create
```typescript
{
  name: 'context_create',
  description: 'Create a named context from current session data',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Context name' },
      keys: { type: 'array', items: { type: 'string' }, description: 'Keys to include' }
    },
    required: ['name', 'keys']
  }
}
```

### context_share
```typescript
{
  name: 'context_share',
  description: 'Share a context with a sub-agent or session',
  parameters: {
    type: 'object',
    properties: {
      contextRef: { type: 'string', description: 'Context reference ID' },
      target: { type: 'string', description: 'Target session or agent' }
    },
    required: ['contextRef']
  }
}
```

### context_resolve
```typescript
{
  name: 'context_resolve',
  description: 'Resolve a context reference to actual data',
  parameters: {
    type: 'object',
    properties: {
      contextRef: { type: 'string', description: 'Context reference ID' },
      keys: { type: 'array', items: { type: 'string' }, description: 'Specific keys to resolve' }
    },
    required: ['contextRef']
  }
}
```

---

## Migration Guide

### For Existing RLM Code

**Before (Pure RLM)**:
```typescript
const result = await rlm_call(
  "Analyze this code",
  ["codebase", "requirements"]
);
```

**After (RLM + LCM)**:
```typescript
// Option 1: Automatic (no code change needed)
const result = await rlm_call(
  "Analyze this code",
  { contextKeys: ["codebase", "requirements"], useReference: true }
);

// Option 2: Explicit context management
const ctxRef = await context_create("analysis", ["codebase", "requirements"]);
const result = await rlm_call(
  "Analyze this code",
  { contextRef: ctxRef }
);
```

### Backward Compatibility

All existing RLM patterns continue to work. LCM features are opt-in via:
- `useReference: true` flag in rlm_call options
- Explicit context management tools
- Configuration option `contextManagement: 'lcm' | 'rlm' | 'hybrid'`

---

## Testing Strategy

### Unit Tests
- Context reference creation and resolution
- Hierarchical context inheritance
- Compression/decompression round-trips
- Memory-backed context storage

### Integration Tests
- Multi-level recursion with context preservation
- Large context handling (>100k tokens)
- Cross-session context sharing
- Context garbage collection

### Performance Tests
- Token usage comparison (RLM vs RLM+LCM)
- Context passing latency
- Memory usage under load
- Reference resolution speed

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Context reference leaks | Medium | Implement reference expiration and cleanup |
| Memory bloat from stored contexts | Medium | Automatic pruning of old contexts |
| Broken references in long sessions | Low | Reference validation before resolution |
| Complexity for users | Low | Keep RLM patterns working, LCM is opt-in |
| Performance overhead | Low | Benchmark and optimize hot paths |

---

## Conclusion

Integrating LCM's lossless context management with VoltClaw's RLM foundation creates a **hybrid system** that:

1. **Preserves RLM strengths**: Symbolic recursion, shared data, simple patterns
2. **Adds LCM benefits**: Context references, hierarchical inheritance, compression
3. **Maintains backward compatibility**: Existing code continues to work
4. **Enables new capabilities**: Large context handling, efficient recursion, cross-session knowledge

The integration follows VoltClaw's philosophy of **recursive leverage** - using the system's own capabilities to enhance itself, while adopting LCM's insight that **context should be referenced, not copied**.

---

## Next Steps

1. **Review and approve** this integration plan
2. **Prioritize phases** based on immediate needs
3. **Create GitHub issues** for each implementation task
4. **Start with Phase 1** (Context Reference System)
5. **Measure and iterate** based on real-world usage

---

## References

- LCM Paper: https://papers.voltropy.com/LCM
- RLM Architecture: VoltClaw docs
- Context Management Patterns: AI Engineering best practices
