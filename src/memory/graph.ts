import type { Store, LLMProvider, GraphNode, GraphEdge } from '../core/types.js';

export class GraphManager {
  private readonly store: Store;
  private readonly llm?: LLMProvider;

  constructor(store: Store, llm?: LLMProvider) {
    this.store = store;
    this.llm = llm;
  }

  async addNode(node: Omit<GraphNode, 'createdAt' | 'updatedAt'>): Promise<void> {
    if (!this.store.addGraphNode) throw new Error('Store does not support graph operations');

    await this.store.addGraphNode({
      ...node,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  async addEdge(edge: Omit<GraphEdge, 'createdAt'>): Promise<void> {
    if (!this.store.addGraphEdge) throw new Error('Store does not support graph operations');

    await this.store.addGraphEdge({
      ...edge,
      createdAt: Date.now()
    });
  }

  async extractAndStore(text: string): Promise<void> {
    if (!this.llm) throw new Error('LLM required for extraction');
    if (!this.store.addGraphNode || !this.store.addGraphEdge) throw new Error('Store does not support graph operations');

    const prompt = `
      Extract entities and relationships from the following text.
      Return a JSON object with two arrays: "nodes" and "edges".

      Nodes format: { "id": "UniqueName", "label": "Type" }
      Edges format: { "source": "SourceNodeID", "target": "TargetNodeID", "relation": "RELATION_TYPE" }

      Keep IDs consistent. Use UPPER_CASE for relations.

      Text: "${text}"
    `;

    try {
      const response = await this.llm.chat([
        { role: 'system', content: 'You are a knowledge graph extractor. Output valid JSON only.' },
        { role: 'user', content: prompt }
      ], {
        maxTokens: 1000,
        temperature: 0
      });

      const jsonStr = response.content.replace(/```json\n?|\n?```/g, '').trim();
      const data = JSON.parse(jsonStr) as {
        nodes: { id: string; label: string }[],
        edges: { source: string; target: string; relation: string }[]
      };

      for (const node of data.nodes) {
        await this.addNode({ id: node.id, label: node.label });
      }

      for (const edge of data.edges) {
        const id = `${edge.source}_${edge.relation}_${edge.target}`;
        await this.addEdge({
          id,
          source: edge.source,
          target: edge.target,
          relation: edge.relation
        });
      }
    } catch (error) {
      console.error('Graph extraction failed:', error);
      throw error;
    }
  }

  async getNeighbors(nodeId: string): Promise<{ nodes: GraphNode[], edges: GraphEdge[] }> {
    if (!this.store.getGraphEdges || !this.store.getGraphNode) return { nodes: [], edges: [] };

    // Get outgoing edges
    const outEdges = await this.store.getGraphEdges({ source: nodeId });
    // Get incoming edges
    const inEdges = await this.store.getGraphEdges({ target: nodeId });

    const edges = [...outEdges, ...inEdges];
    const nodeIds = new Set<string>();

    for (const edge of edges) {
      nodeIds.add(edge.source);
      nodeIds.add(edge.target);
    }

    const nodes: GraphNode[] = [];
    for (const id of nodeIds) {
      const node = await this.store.getGraphNode(id);
      if (node) nodes.push(node);
    }

    return { nodes, edges };
  }

  async search(query: string): Promise<GraphNode[]> {
    if (!this.store.searchGraphNodes) return [];
    return this.store.searchGraphNodes(query);
  }
}
