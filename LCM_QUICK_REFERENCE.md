# LCM Quick Reference

## Import

```typescript
import { 
  ContextReferenceManager, 
  HierarchicalContext,
  createContextChain,
  extendChain
} from 'voltclaw';
```

## ContextReferenceManager

### Create Reference
```typescript
const manager = new ContextReferenceManager(agent.memory, session);

const refId = await manager.createReference({
  keys: ['key1', 'key2'],
  expiresIn: 3600000,     // Optional: 1 hour
  tags: ['tag1', 'tag2'], // Optional
  compress: true          // Optional: auto-compress large values
});
```

### Resolve Reference
```typescript
const context = await manager.resolveReference(refId, {
  keys: ['key1'],      // Optional: specific keys only
  decompress: true     // Optional: decompress if compressed (default: true)
});
```

### Delete Reference
```typescript
manager.deleteReference(refId);
```

### Get Stats
```typescript
const stats = manager.getStats();
// { totalReferences, totalAccesses, expiredReferences }
```

### Cleanup Expired
```typescript
manager.cleanup(3600000); // Clean up refs older than 1 hour
```

## HierarchicalContext

### Basic Usage
```typescript
const ctx = new HierarchicalContext();
ctx.set('key', 'value');
const value = ctx.get('key');
```

### Create Child (Inherits Parent)
```typescript
const parent = new HierarchicalContext();
parent.set('project', 'VoltClaw');

const child = parent.createChild();
child.set('subtask', 'LCM integration');

console.log(child.get('project')); // 'VoltClaw' (inherited)
console.log(child.get('subtask')); // 'LCM integration' (local)
```

### Context Chain
```typescript
const chain = createContextChain();
chain.root.set('task', 'Analyze codebase');

const level1 = extendChain(chain);
level1.set('module', 'core');

const level2 = extendChain(chain);
level2.set('file', 'agent.ts');

// Each level inherits from all parents
console.log(level2.get('task'));   // 'Analyze codebase'
console.log(level2.get('module')); // 'core'
console.log(level2.get('file'));   // 'agent.ts'
```

### Get All Data
```typescript
const allKeys = ctx.getAllKeys();
const allData = ctx.getAll();
const localData = ctx.getLocal();
```

### Merge Contexts
```typescript
const merged = mergeContexts([ctx1, ctx2], true); // true = override on conflict
```

### Extract Subset
```typescript
const subset = ctx.extract(['key1', 'key2']);
```

### Serialization
```typescript
const json = ctx.toJSON();
const restored = HierarchicalContext.fromJSON(json);
```

### Visualization
```typescript
console.log(ctx.visualize());
// Context[hctx_123_abc] (depth: 1)
//   Local:
//     key: value
```

## LCM Tools

### context_create
```typescript
const result = await agent.executeTool('context_create', {
  name: 'project-context',
  keys: ['requirements', 'decisions'],
  expiresIn: 3600000,
  tags: ['project-x']
});
// { refId, name, keys, expiresIn, tags }
```

### context_resolve
```typescript
const result = await agent.executeTool('context_resolve', {
  refId: 'ctx_123_abc',
  keys: ['requirements'], // Optional: specific keys
  decompress: true
});
// { success: true, context: {...} }
```

### context_delete
```typescript
const result = await agent.executeTool('context_delete', {
  refId: 'ctx_123_abc'
});
// { success: true, refId: 'ctx_123_abc' }
```

### context_stats
```typescript
const result = await agent.executeTool('context_stats', {});
// { totalReferences, totalAccesses, expiredReferences }
```

## RLM-LCM Hybrid Patterns

### Pattern 1: Context Reference in rlm_call
```typescript
const refId = await contextManager.createReference({
  keys: ['codebase', 'requirements']
});

const result = await rlm_call(
  "Analyze the code",
  { contextRef: refId } // Instead of copying full context
);
```

### Pattern 2: Context Inheritance in rlm_map
```typescript
const refId = await contextManager.createReference({
  keys: ['sharedData', 'decisions']
});

const results = await rlm_map(items, (item) => ({
  task: `Process ${item}`,
  contextRef: refId // All parallel calls share context
}));
```

### Pattern 3: Hierarchical Context for Recursion
```typescript
function createSubtaskContext(parent: HierarchicalContext, task: string) {
  const child = parent.createChild();
  child.set('currentTask', task);
  child.setMetadata('createdAt', Date.now());
  return child;
}
```

### Pattern 4: Cross-Session Context
```typescript
// Store in long-term memory
await agent.memory.storeMemory(
  JSON.stringify(projectContext),
  'long-term',
  ['project-context', 'architecture'],
  9 // High importance
);

// Create reference for sharing
const refId = await contextManager.createReference({
  keys: ['architecture', 'decisions'],
  expiresIn: 7200000, // 2 hours
  tags: ['cross-session']
});
```

## Performance Tips

### ✅ DO: Use Context References
```typescript
// Good: ~50 tokens
const refId = await contextManager.createReference({ keys: ['files'] });
await call({ task: 'Analyze', contextRef: refId });
```

### ❌ DON'T: Copy Full Context
```typescript
// Bad: ~5000+ tokens
const summary = `Files: ${JSON.stringify(files)}`;
await call({ task: 'Analyze', summary });
```

### ✅ DO: Use Hierarchical Inheritance
```typescript
// Good: Automatic inheritance
const child = parent.createChild();
// Child has access to all parent data
```

### ❌ DON'T: Manually Pass Context
```typescript
// Bad: Error-prone and verbose
const childContext = { ...parentContext, ...newData };
```

### ✅ DO: Enable Compression for Large Data
```typescript
// Good: Automatic compression
const manager = new ContextReferenceManager(memory, session, {
  enableCompression: true,
  compressionThreshold: 1000
});
```

## Common Patterns

### Pattern: Project Context
```typescript
const projectCtx = new HierarchicalContext();
projectCtx.set('project', 'VoltClaw');
projectCtx.set('version', '2.0.0');
projectCtx.set('goals', ['LCM integration', 'Testing']);
projectCtx.setMetadata('createdAt', new Date().toISOString());

// Use throughout session
const refId = await contextManager.createReference({
  keys: ['project', 'version', 'goals'],
  tags: ['project-context']
});
```

### Pattern: Decision Tracking
```typescript
const decisions = new HierarchicalContext();
decisions.set('decisions', []);

function addDecision(decision: string) {
  const current = decisions.get('decisions') || [];
  decisions.set('decisions', [...current, decision]);
}
```

### Pattern: Task Decomposition
```typescript
const rootTask = new HierarchicalContext();
rootTask.set('goal', 'Analyze codebase');

const subtasks = [
  'Analyze core module',
  'Analyze LLM module',
  'Analyze tools module'
].map(task => {
  const ctx = rootTask.createChild();
  ctx.set('subtask', task);
  return ctx;
});
```

## Error Handling

```typescript
try {
  const context = await manager.resolveReference(refId);
} catch (error) {
  if (error.message.includes('not found')) {
    // Reference doesn't exist
  } else if (error.message.includes('expired')) {
    // Reference expired, recreate
  }
}
```

## Best Practices

1. **Set Expiration**: Always set `expiresIn` for temporary contexts
2. **Use Tags**: Tag contexts for easier debugging and cleanup
3. **Compress Large Data**: Enable compression for values > 1KB
4. **Clean Up**: Call `cleanup()` periodically in long-running sessions
5. **Inherit When Possible**: Use hierarchical contexts instead of copying
6. **Reference Over Copy**: Always prefer references over copying data

---

**For More Info**: See [LCM_INTEGRATION_PLAN.md](./LCM_INTEGRATION_PLAN.md) and [LCM_INTEGRATION_SUMMARY.md](./LCM_INTEGRATION_SUMMARY.md)
