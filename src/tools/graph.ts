import type { Tool } from '../core/types.js';
import type { GraphManager } from '../memory/graph.js';

export function createGraphTools(graph: GraphManager): Tool[] {
  return [
    {
      name: 'graph_query',
      description: 'Query the knowledge graph for related entities.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The ID of the node to start from' }
        },
        required: ['nodeId']
      },
      execute: async (args) => {
        const neighbors = await graph.getNeighbors(args.nodeId as string);
        return { status: 'found', count: neighbors.length, neighbors };
      }
    },
    {
      name: 'graph_extract',
      description: 'Manually trigger knowledge graph extraction from text.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Text content to extract entities from' }
        },
        required: ['content']
      },
      execute: async (args) => {
        // We can't await this if we want it backgrounded, but for a tool, we probably want to await completion or at least initiation
        await graph.extractAndStore(args.content as string);
        return { status: 'extraction_started' };
      }
    }
  ];
}
