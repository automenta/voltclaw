import { type Store, type LLMProvider, type GraphNode, type GraphEdge } from '../core/types.js';

interface ExtractionResult {
  nodes: { id: string; label: string; type: string; metadata?: any }[];
  edges: { source: string; target: string; relation: string; weight?: number }[];
}

export class GraphManager {
  private readonly store: Store;
  private readonly llm?: LLMProvider;

  constructor(store: Store, llm?: LLMProvider) {
    this.store = store;
    this.llm = llm;
  }

  async extractAndStore(content: string): Promise<void> {
    if (!this.llm || !this.store.addGraphNode || !this.store.addGraphEdge) {
      return;
    }

    const prompt = `Extract entities (nodes) and relationships (edges) from the following text.
Return JSON format:
{
  "nodes": [{ "id": "unique_id_slug", "label": "Readable Name", "type": "Person|Concept|Project|...", "metadata": {} }],
  "edges": [{ "source": "node_id", "target": "node_id", "relation": "VERB_PHRASE", "weight": 1.0 }]
}

Text:
${content}`;

    try {
      // Use chat or a simple completion if available. Assuming chat for now.
      const response = await this.llm.chat([{ role: 'user', content: prompt }]);
      const jsonStr = this.extractJSON(response.content);

      if (!jsonStr) return;

      const data = JSON.parse(jsonStr) as ExtractionResult;

      // Store nodes first
      if (data.nodes) {
        for (const node of data.nodes) {
          if (node.id) {
            await this.store.addGraphNode!({
              id: this.sanitizeId(node.id),
              label: node.label || node.id,
              type: node.type || 'Concept',
              metadata: node.metadata
            });
          }
        }
      }

      // Store edges
      if (data.edges) {
        for (const edge of data.edges) {
          if (edge.source && edge.target) {
            await this.store.addGraphEdge!({
              source: this.sanitizeId(edge.source),
              target: this.sanitizeId(edge.target),
              relation: edge.relation || 'related_to',
              weight: edge.weight ?? 1.0
            });
          }
        }
      }

    } catch (e) {
      console.error('Graph extraction failed:', e);
    }
  }

  async getNeighbors(nodeId: string): Promise<GraphEdge[]> {
    if (!this.store.getGraphNeighbors) return [];
    return this.store.getGraphNeighbors(this.sanitizeId(nodeId));
  }

  private extractJSON(text: string): string | null {
    // Basic JSON extraction - finds first { ... } block
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return text.slice(firstBrace, lastBrace + 1);
    }
    return null;
  }

  private sanitizeId(id: string): string {
    return id.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  }
}
