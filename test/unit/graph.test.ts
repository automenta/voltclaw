import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphManager } from '../../src/memory/graph.js';
import type { Store, LLMProvider } from '../../src/core/types.js';

describe('GraphManager', () => {
  const mockStore = {
    addGraphNode: vi.fn().mockResolvedValue(undefined),
    addGraphEdge: vi.fn().mockResolvedValue(undefined),
    getGraphNeighbors: vi.fn().mockResolvedValue([
        { source: 'a', target: 'b', relation: 'test', weight: 1 }
    ])
  } as unknown as Store;

  const mockLLM = {
    chat: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        nodes: [
          { id: 'Alice', label: 'Alice', type: 'Person' },
          { id: 'Bob', label: 'Bob', type: 'Person' }
        ],
        edges: [
          { source: 'Alice', target: 'Bob', relation: 'knows' }
        ]
      })
    })
  } as unknown as LLMProvider;

  let graph: GraphManager;

  beforeEach(() => {
    vi.clearAllMocks();
    graph = new GraphManager(mockStore, mockLLM);
  });

  it('should extract and store graph data', async () => {
    await graph.extractAndStore('Alice knows Bob');

    expect(mockLLM.chat).toHaveBeenCalled();

    // Check nodes (sanitized IDs)
    expect(mockStore.addGraphNode).toHaveBeenCalledWith(expect.objectContaining({
      id: 'alice',
      label: 'Alice',
      type: 'Person'
    }));
    expect(mockStore.addGraphNode).toHaveBeenCalledWith(expect.objectContaining({
      id: 'bob',
      label: 'Bob',
      type: 'Person'
    }));

    // Check edges
    expect(mockStore.addGraphEdge).toHaveBeenCalledWith(expect.objectContaining({
      source: 'alice',
      target: 'bob',
      relation: 'knows'
    }));
  });

  it('should query neighbors', async () => {
    const results = await graph.getNeighbors('alice');
    expect(mockStore.getGraphNeighbors).toHaveBeenCalledWith('alice');
    expect(results).toHaveLength(1);
    expect(results[0].relation).toBe('test');
  });

  it('should handle invalid JSON from LLM gracefully', async () => {
    const badLLM = {
        chat: vi.fn().mockResolvedValue({ content: 'Not JSON' })
    } as unknown as LLMProvider;
    const badGraph = new GraphManager(mockStore, badLLM);

    await badGraph.extractAndStore('test');
    expect(mockStore.addGraphNode).not.toHaveBeenCalled();
  });
});
