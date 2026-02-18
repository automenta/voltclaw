import type { Tool, ToolCallResult } from '../core/types.js';
import type { GraphManager } from '../memory/graph.js';

export function createGraphTools(manager: GraphManager): Tool[] {
  return [
    {
      name: 'graph_extract',
      description: 'Extract entities and relationships from text and add them to the knowledge graph',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The text to analyze'
          }
        },
        required: ['text']
      },
      execute: async (args: { text: string }) => {
        try {
          await manager.extractAndStore(args.text);
          return { result: 'Graph extraction successful' };
        } catch (error) {
          return { error: String(error) };
        }
      }
    },
    {
      name: 'graph_query',
      description: 'Find neighbors and relationships of a specific entity in the graph',
      parameters: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'string',
            description: 'The ID (name) of the node to query'
          }
        },
        required: ['nodeId']
      },
      execute: async (args: { nodeId: string }) => {
        const result = await manager.getNeighbors(args.nodeId);
        return {
          nodes: result.nodes.map(n => `${n.id} (${n.label})`),
          edges: result.edges.map(e => `${e.source} --[${e.relation}]--> ${e.target}`)
        };
      }
    },
    {
      name: 'graph_search',
      description: 'Search for nodes in the knowledge graph by name or label',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term'
          }
        },
        required: ['query']
      },
      execute: async (args: { query: string }) => {
        const nodes = await manager.search(args.query);
        return {
          matches: nodes.map(n => ({ id: n.id, label: n.label }))
        };
      }
    }
  ];
}
