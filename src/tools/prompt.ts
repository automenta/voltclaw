import type { Tool } from '../core/types.js';
import type { PromptManager } from '../core/prompt-manager.js';

export function createPromptTools(manager: PromptManager): Tool[] {
  return [
    {
      name: 'prompt_get',
      description: 'Get the content of a prompt template.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Template ID' },
          version: { type: 'number', description: 'Version number (optional, defaults to latest)' }
        },
        required: ['id']
      },
      execute: async (args: { id: string; version?: number }) => {
        try {
          const content = await manager.getPrompt(args.id, args.version);
          return { result: content };
        } catch (error) {
          return { error: String(error) };
        }
      }
    },
    {
      name: 'prompt_create',
      description: 'Create a new prompt template.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique Template ID' },
          description: { type: 'string', description: 'Description of the prompt purpose' },
          content: { type: 'string', description: 'Initial prompt content' }
        },
        required: ['id', 'description', 'content']
      },
      execute: async (args: { id: string; description: string; content: string }) => {
        try {
          await manager.createTemplate(args.id, args.description, args.content);
          return { result: `Prompt template ${args.id} created successfully.` };
        } catch (error) {
          return { error: String(error) };
        }
      }
    },
    {
      name: 'prompt_update',
      description: 'Update an existing prompt template with a new version.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Template ID' },
          content: { type: 'string', description: 'New prompt content' },
          changelog: { type: 'string', description: 'Description of changes' }
        },
        required: ['id', 'content', 'changelog']
      },
      execute: async (args: { id: string; content: string; changelog: string }) => {
        try {
          await manager.updatePrompt(args.id, args.content, args.changelog);
          return { result: `Prompt ${args.id} updated successfully.` };
        } catch (error) {
          return { error: String(error) };
        }
      }
    },
    {
      name: 'prompt_optimize',
      description: 'Use AI to suggest optimizations for a prompt based on feedback.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Template ID' },
          feedback: { type: 'string', description: 'Feedback or goals for optimization' }
        },
        required: ['id', 'feedback']
      },
      execute: async (args: { id: string; feedback: string }) => {
        try {
          const optimized = await manager.optimizePrompt(args.id, args.feedback);
          return { result: optimized };
        } catch (error) {
          return { error: String(error) };
        }
      }
    }
  ];
}
