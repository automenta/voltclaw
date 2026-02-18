import type { Tool } from '../core/types.js';
import type { DocumentationManager } from '../core/documentation.js';
import fs from 'fs/promises';
import path from 'path';
import { VOLTCLAW_DIR } from '../core/bootstrap.js';

export function createDocumentationTools(manager: DocumentationManager): Tool[] {
  return [
    {
      name: 'document_tool',
      description: 'Generates documentation for a tool from its source code.',
      parameters: {
        type: 'object',
        properties: {
          toolName: {
            type: 'string',
            description: 'Name of the tool to document'
          },
          sourcePath: {
            type: 'string',
            description: 'Path to source file (optional, defaults to src/tools/{toolName}.ts)'
          }
        },
        required: ['toolName']
      },
      execute: async (args: { toolName: string; sourcePath?: string }) => {
        try {
          const cwd = process.cwd();
          let sourcePath = args.sourcePath;

          if (!sourcePath) {
            // Try standard location
            const candidate = path.join(cwd, 'src', 'tools', `${args.toolName}.ts`);
            try {
                await fs.access(candidate);
                sourcePath = candidate;
            } catch {
                return { error: `Source file not found for ${args.toolName} at ${candidate}. Please specify sourcePath.` };
            }
          }

          const content = await fs.readFile(sourcePath, 'utf-8');
          const docs = await manager.generateToolDocumentation(args.toolName, content);

          // Write to docs folder (ensure it exists)
          // We can write to a 'docs' folder in CWD or VOLTCLAW_DIR.
          // Let's use 'docs/tools' in CWD for project documentation.
          const docDir = path.join(cwd, 'docs', 'tools');
          await fs.mkdir(docDir, { recursive: true });

          const docPath = path.join(docDir, `${args.toolName}.md`);
          await fs.writeFile(docPath, docs);

          return { result: `Documentation written to ${docPath}` };
        } catch (error) {
          return { error: String(error) };
        }
      }
    },
    {
      name: 'explain_code',
      description: 'Explains a code snippet from a file.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file'
          },
          startLine: {
            type: 'number',
            description: 'Start line number (1-based, optional)'
          },
          endLine: {
            type: 'number',
            description: 'End line number (1-based, optional)'
          }
        },
        required: ['filePath']
      },
      execute: async (args: { filePath: string; startLine?: number; endLine?: number }) => {
        try {
          const content = await fs.readFile(args.filePath, 'utf-8');
          let snippet = content;

          if (args.startLine !== undefined && args.endLine !== undefined) {
            const lines = content.split('\n');
            // Adjust for 0-based index
            snippet = lines.slice(args.startLine - 1, args.endLine).join('\n');
          }

          const explanation = await manager.generateCodeExplanation(snippet);
          return { result: explanation };
        } catch (error) {
          return { error: String(error) };
        }
      }
    }
  ];
}
