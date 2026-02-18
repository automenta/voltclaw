import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SQLiteStore } from '../../src/memory/sqlite.js';
import { GraphManager } from '../../src/memory/graph.js';
import type { LLMProvider } from '../../src/core/types.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Knowledge Graph Integration', () => {
  const dbPath = path.join(__dirname, 'test-graph.db');

  const mockLLM: LLMProvider = {
    name: 'mock',
    model: 'mock-model',
    chat: async (messages) => {
        // Mock extraction response
        const content = messages[messages.length - 1].content ?? '';
        if (content.includes('Extract entities')) {
            return {
                content: JSON.stringify({
                    nodes: [
                        { id: 'Alice', label: 'Person' },
                        { id: 'Bob', label: 'Person' },
                        { id: 'Wonderland', label: 'Place' }
                    ],
                    edges: [
                        { source: 'Alice', target: 'Bob', relation: 'KNOWS' },
                        { source: 'Alice', target: 'Wonderland', relation: 'LOCATED_IN' }
                    ]
                })
            };
        }
        return { content: '' };
    }
  };

  beforeEach(() => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('should add nodes and edges manually', async () => {
    const store = new SQLiteStore({ path: dbPath });
    const manager = new GraphManager(store);
    await store.load();

    await manager.addNode({ id: 'Node1', label: 'TypeA' });
    await manager.addNode({ id: 'Node2', label: 'TypeB' });

    await manager.addEdge({
      id: 'edge1',
      source: 'Node1',
      target: 'Node2',
      relation: 'LINKS_TO'
    });

    const neighbors = await manager.getNeighbors('Node1');
    expect(neighbors.nodes).toHaveLength(2); // Node1 and Node2 (because getNeighbors returns both ends if they exist in store logic)
    // Wait, getNeighbors fetches edges where source=Node1 OR target=Node1.
    // Edge is Node1->Node2.
    // Then it fetches nodes for all IDs involved.
    // So it should return Node1 and Node2.

    const edge = neighbors.edges.find(e => e.id === 'edge1');
    expect(edge).toBeDefined();
    expect(edge?.relation).toBe('LINKS_TO');
  });

  it('should extract entities using LLM', async () => {
    const store = new SQLiteStore({ path: dbPath });
    const manager = new GraphManager(store, mockLLM);
    await store.load();

    await manager.extractAndStore('Alice knows Bob and is in Wonderland');

    const aliceNeighbors = await manager.getNeighbors('Alice');
    expect(aliceNeighbors.nodes.map(n => n.id)).toContain('Bob');
    expect(aliceNeighbors.nodes.map(n => n.id)).toContain('Wonderland');

    const edges = aliceNeighbors.edges;
    expect(edges).toHaveLength(2);
    expect(edges.find(e => e.relation === 'KNOWS')).toBeDefined();
    expect(edges.find(e => e.relation === 'LOCATED_IN')).toBeDefined();
  });

  it('should search nodes', async () => {
    const store = new SQLiteStore({ path: dbPath });
    const manager = new GraphManager(store);
    await store.load();

    await manager.addNode({ id: 'Apple', label: 'Fruit' });
    await manager.addNode({ id: 'Pineapple', label: 'Fruit' });

    const results = await manager.search('apple');
    expect(results).toHaveLength(2);
  });
});
