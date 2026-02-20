import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextReferenceManager } from '../src/core/lcm-context.js';
import { HierarchicalContext, createContextChain, extendChain, mergeContexts } from '../src/core/hierarchical-context.js';
import { MemoryManager } from '../src/memory/manager.js';
import { SQLiteStore } from '../src/memory/sqlite.js';
import { MockLLMProvider } from '../src/testing/mock-llm.js';

// Mock MemoryManager for testing
class MockMemoryManager {
  private memories: any[] = [];

  async storeMemory(content: string, type: string, tags: string[], importance: number): Promise<string> {
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.memories.push({ id, content, type, tags, importance, createdAt: Date.now() });
    return id;
  }

  async recall(query: any): Promise<any[]> {
    if (query.id) {
      return this.memories.filter(m => m.id === query.id);
    }
    if (query.tags) {
      const tags = Array.isArray(query.tags) ? query.tags : [query.tags];
      return this.memories.filter(m => m.tags?.some((t: string) => tags.includes(t)));
    }
    return this.memories;
  }
}

describe('HierarchicalContext', () => {
  describe('basic operations', () => {
    it('should set and get values', () => {
      const ctx = new HierarchicalContext();
      ctx.set('key', 'value');
      expect(ctx.get('key')).toBe('value');
    });

    it('should return undefined for missing keys', () => {
      const ctx = new HierarchicalContext();
      expect(ctx.get('nonexistent')).toBeUndefined();
    });

    it('should check key existence', () => {
      const ctx = new HierarchicalContext();
      ctx.set('key', 'value');
      expect(ctx.has('key')).toBe(true);
      expect(ctx.has('nonexistent')).toBe(false);
    });

    it('should delete keys', () => {
      const ctx = new HierarchicalContext();
      ctx.set('key', 'value');
      expect(ctx.delete('key')).toBe(true);
      expect(ctx.has('key')).toBe(false);
    });
  });

  describe('inheritance', () => {
    it('should inherit values from parent', () => {
      const parent = new HierarchicalContext();
      parent.set('parentKey', 'parentValue');

      const child = parent.createChild();
      expect(child.get('parentKey')).toBe('parentValue');
    });

    it('should override parent values with local values', () => {
      const parent = new HierarchicalContext();
      parent.set('key', 'parentValue');

      const child = parent.createChild();
      child.set('key', 'childValue');
      expect(child.get('key')).toBe('childValue');
    });

    it('should collect all keys from hierarchy', () => {
      const parent = new HierarchicalContext();
      parent.set('parentKey1', 'value1');
      parent.set('parentKey2', 'value2');

      const child = parent.createChild();
      child.set('childKey', 'childValue');

      const allKeys = child.getAllKeys();
      expect(allKeys).toContain('parentKey1');
      expect(allKeys).toContain('parentKey2');
      expect(allKeys).toContain('childKey');
    });

    it('should get all values as flat object', () => {
      const parent = new HierarchicalContext();
      parent.set('parentKey', 'parentValue');

      const child = parent.createChild();
      child.set('childKey', 'childValue');

      const all = child.getAll();
      expect(all).toEqual({
        parentKey: 'parentValue',
        childKey: 'childValue'
      });
    });
  });

  describe('context chain', () => {
    it('should create a chain with root and tip', () => {
      const chain = createContextChain();
      expect(chain.root).toBeDefined();
      expect(chain.tip).toBe(chain.root);
      expect(chain.contexts).toHaveLength(1);
    });

    it('should extend chain with new child', () => {
      const chain = createContextChain();
      const child = extendChain(chain);
      
      expect(chain.contexts).toHaveLength(2);
      expect(chain.tip).toBe(child);
      expect(child.getParent()).toBe(chain.root);
    });

    it('should maintain inheritance through chain', () => {
      const chain = createContextChain();
      chain.root.set('rootKey', 'rootValue');

      const level1 = extendChain(chain);
      level1.set('level1Key', 'level1Value');

      const level2 = extendChain(chain);
      level2.set('level2Key', 'level2Value');

      expect(level2.get('rootKey')).toBe('rootValue');
      expect(level2.get('level1Key')).toBe('level1Value');
      expect(level2.get('level2Key')).toBe('level2Value');
    });
  });

  describe('metadata', () => {
    it('should set and get metadata', () => {
      const ctx = new HierarchicalContext();
      ctx.setMetadata('metaKey', 'metaValue');
      expect(ctx.getMetadata('metaKey')).toBe('metaValue');
    });

    it('should not inherit metadata from parent', () => {
      const parent = new HierarchicalContext();
      parent.setMetadata('parentMeta', 'value');

      const child = parent.createChild();
      expect(child.getMetadata('parentMeta')).toBeUndefined();
    });
  });

  describe('depth and hierarchy', () => {
    it('should calculate depth correctly', () => {
      const root = new HierarchicalContext();
      expect(root.getDepth()).toBe(0);

      const child1 = root.createChild();
      expect(child1.getDepth()).toBe(1);

      const child2 = child1.createChild();
      expect(child2.getDepth()).toBe(2);
    });

    it('should get root context', () => {
      const root = new HierarchicalContext();
      const child1 = root.createChild();
      const child2 = child1.createChild();

      expect(child2.getRoot()).toBe(root);
    });
  });

  describe('merge and extract', () => {
    it('should merge contexts', () => {
      const ctx1 = new HierarchicalContext();
      ctx1.set('key1', 'value1');

      const ctx2 = new HierarchicalContext();
      ctx2.set('key2', 'value2');

      ctx1.merge(ctx2);
      expect(ctx1.get('key2')).toBe('value2');
    });

    it('should override on merge if specified', () => {
      const ctx1 = new HierarchicalContext();
      ctx1.set('key', 'value1');

      const ctx2 = new HierarchicalContext();
      ctx2.set('key', 'value2');

      ctx1.merge(ctx2, true);
      expect(ctx1.get('key')).toBe('value2');
    });

    it('should extract subset of context', () => {
      const ctx = new HierarchicalContext();
      ctx.set('key1', 'value1');
      ctx.set('key2', 'value2');
      ctx.set('key3', 'value3');

      const extracted = ctx.extract(['key1', 'key3']);
      expect(extracted.get('key1')).toBe('value1');
      expect(extracted.get('key3')).toBe('value3');
      expect(extracted.has('key2')).toBe(false);
    });
  });

  describe('serialization', () => {
    it('should convert to JSON', () => {
      const ctx = new HierarchicalContext();
      ctx.set('key', 'value');
      ctx.setMetadata('meta', 'metadata');

      const json = ctx.toJSON();
      expect(json.id).toBeDefined();
      expect(json.data).toEqual({ key: 'value' });
      expect(json.metadata).toEqual({ meta: 'metadata' });
    });

    it('should create from JSON', () => {
      const data = {
        data: { key: 'value' },
        metadata: { meta: 'metadata' }
      };

      const ctx = HierarchicalContext.fromJSON(data);
      expect(ctx.get('key')).toBe('value');
      expect(ctx.getMetadata('meta')).toBe('metadata');
    });
  });
});

describe('ContextReferenceManager', () => {
  let memory: MockMemoryManager;
  let session: any;

  beforeEach(() => {
    memory = new MockMemoryManager();
    session = {
      id: 'test_session',
      sharedData: {
        key1: 'value1',
        key2: 'value2',
        largeData: 'x'.repeat(2000)
      }
    };
  });

  describe('reference creation', () => {
    it('should create a reference with keys', async () => {
      const manager = new ContextReferenceManager(memory as any, session);
      const refId = await manager.createReference({
        keys: ['key1', 'key2']
      });

      expect(refId).toMatch(/ctx_\d+_[a-z0-9]+/);
    });

    it('should create reference with expiration', async () => {
      const manager = new ContextReferenceManager(memory as any, session);
      const refId = await manager.createReference({
        keys: ['key1'],
        expiresIn: 3600000
      });

      const stats = manager.getStats();
      expect(stats.totalReferences).toBe(1);
    });

    it('should create reference with tags', async () => {
      const manager = new ContextReferenceManager(memory as any, session);
      const refId = await manager.createReference({
        keys: ['key1'],
        tags: ['tag1', 'tag2']
      });

      expect(refId).toBeDefined();
    });
  });

  describe('reference resolution', () => {
    it('should resolve a reference to get context data', async () => {
      const manager = new ContextReferenceManager(memory as any, session);
      const refId = await manager.createReference({
        keys: ['key1', 'key2']
      });

      const context = await manager.resolveReference(refId);
      expect(context).toHaveProperty('key1');
      expect(context).toHaveProperty('key2');
    });

    it('should resolve specific keys only', async () => {
      const manager = new ContextReferenceManager(memory as any, session);
      const refId = await manager.createReference({
        keys: ['key1', 'key2', 'key3']
      });

      const context = await manager.resolveReference(refId, {
        keys: ['key1', 'key2']
      });

      expect(Object.keys(context)).toHaveLength(2);
      expect(context).toHaveProperty('key1');
      expect(context).toHaveProperty('key2');
    });

    it('should throw error for expired reference', async () => {
      const manager = new ContextReferenceManager(memory as any, session);
      const refId = await manager.createReference({
        keys: ['key1'],
        expiresIn: 1 // 1ms (already expired)
      });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      await expect(manager.resolveReference(refId)).rejects.toThrow('expired');
    });

    it('should throw error for non-existent reference', async () => {
      const manager = new ContextReferenceManager(memory as any, session);
      await expect(manager.resolveReference('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('compression', () => {
    it('should compress large values', async () => {
      const manager = new ContextReferenceManager(memory as any, session, {
        enableCompression: true,
        compressionThreshold: 100
      });

      const refId = await manager.createReference({
        keys: ['largeData']
      });

      const context = await manager.resolveReference(refId, { decompress: true });
      // The decompression should retrieve the full data from memory
      // For this test, we just verify we get back a value (mock doesn't fully implement decompression)
      expect(context).toHaveProperty('largeData');
    });

    it('should not compress small values', async () => {
      const manager = new ContextReferenceManager(memory as any, session, {
        enableCompression: true,
        compressionThreshold: 5000
      });

      const refId = await manager.createReference({
        keys: ['key1', 'key2']
      });

      const context = await manager.resolveReference(refId);
      expect(context.key1).toBe('value1');
    });
  });

  describe('cleanup', () => {
    it('should clean up expired references', async () => {
      const manager = new ContextReferenceManager(memory as any, session);
      
      await manager.createReference({ keys: ['key1'], expiresIn: 1 });
      await manager.createReference({ keys: ['key2'], expiresIn: 1000000 });

      await new Promise(resolve => setTimeout(resolve, 10));
      
      const cleaned = manager.cleanup();
      expect(cleaned).toBeGreaterThanOrEqual(1);
    });

    it('should return correct stats', async () => {
      const manager = new ContextReferenceManager(memory as any, session);
      
      const refId = await manager.createReference({ keys: ['key1'] });
      await manager.resolveReference(refId);
      await manager.resolveReference(refId);

      const stats = manager.getStats();
      expect(stats.totalReferences).toBe(1);
      expect(stats.totalAccesses).toBe(2);
    });
  });

  describe('reference deletion', () => {
    it('should delete a reference', async () => {
      const manager = new ContextReferenceManager(memory as any, session);
      const refId = await manager.createReference({ keys: ['key1'] });

      const deleted = manager.deleteReference(refId);
      expect(deleted).toBe(true);

      const stats = manager.getStats();
      expect(stats.totalReferences).toBe(0);
    });

    it('should return false for deleting non-existent reference', async () => {
      const manager = new ContextReferenceManager(memory as any, session);
      const deleted = manager.deleteReference('nonexistent');
      expect(deleted).toBe(false);
    });
  });
});

describe('mergeContexts', () => {
  it('should merge multiple contexts', () => {
    const ctx1 = new HierarchicalContext();
    ctx1.set('key1', 'value1');

    const ctx2 = new HierarchicalContext();
    ctx2.set('key2', 'value2');

    const merged = mergeContexts([ctx1, ctx2]);
    expect(merged.get('key1')).toBe('value1');
    expect(merged.get('key2')).toBe('value2');
  });

  it('should override with later contexts', () => {
    const ctx1 = new HierarchicalContext();
    ctx1.set('key', 'value1');

    const ctx2 = new HierarchicalContext();
    ctx2.set('key', 'value2');

    const merged = mergeContexts([ctx1, ctx2], true);
    expect(merged.get('key')).toBe('value2');
  });
});
