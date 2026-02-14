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
      return { error: `Invalid arguments: ${parsed.error.issues[0]?.message}` };
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
