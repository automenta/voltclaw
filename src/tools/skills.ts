import { z } from 'zod';
import type { Tool, ToolCallResult } from './types.js';
import { SkillManager } from '../core/skills.js';
import { formatToolError } from './errors.js';

const InstallSkillSchema = z.object({
  url: z.string().url().describe('Direct URL to the skill file (.js or .ts)'),
  name: z.string().optional().describe('Name for the skill file')
});

export const createSkillTools = (): Tool[] => {
  const manager = new SkillManager();

  return [
    {
      name: 'install_skill',
      description: 'Install a new skill (tool) from a remote URL. The skill becomes available on next restart.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to the raw JavaScript/TypeScript file' },
          name: { type: 'string', description: 'Optional filename' }
        },
        required: ['url']
      },
      execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
        try {
          const { url, name } = InstallSkillSchema.parse(args);
          const filename = await manager.installSkill(url, name);
          return { status: 'success', message: `Skill installed to ${filename}. Restart required to load.` };
        } catch (error) {
          return { error: formatToolError('install_skill', error, args) };
        }
      }
    }
  ];
};
