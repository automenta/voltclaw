import type { Tool, VoltClawAgent } from '../core/types.js';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function createTestTools(agent: VoltClawAgent): Tool[] {
  return [
    {
      name: 'self_test',
      description: 'Generate and run a self-test to verify functionality.',
      parameters: {
        type: 'object',
        properties: {
          plan: { type: 'string', description: 'Description of what to test' },
          code: { type: 'string', description: 'Optional explicit test code (Vitest format)' }
        },
        required: ['plan']
      },
      execute: async (args) => {
        const plan = args.plan as string;
        let code = args.code as string | undefined;

        const tempDir = path.join(process.cwd(), 'test', 'temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const timestamp = Date.now();
        const testPath = path.join(tempDir, `test-${timestamp}.test.ts`);

        try {
          if (!code) {
            // Generate test code using LLM
            // Cast agent to any to access llm, assuming VoltClawAgent structure
            const llm = (agent as any).llm;
            if (!llm || !llm.chat) {
              return { error: 'LLM not available for test generation' };
            }

            const prompt = `Write a Vitest test file for the following plan: "${plan}".
Return ONLY the code block. Use 'import { describe, it, expect } from "vitest";'.
Do not use backticks or markdown formatting in the response, just raw code.`;

            const response = await llm.chat([
              { role: 'user', content: prompt }
            ]);
            code = response.content.replace(/```typescript|```/g, '').trim();
          }

          fs.writeFileSync(testPath, code);

          // Run the test
          // Use npx vitest run with json reporter to parse results easier, or just capture stdout
          const { stdout, stderr } = await execAsync(`npx vitest run ${testPath} --no-color`);

          return {
            status: 'passed',
            output: stdout,
            error: stderr
          };

        } catch (error: any) {
          return {
            status: 'failed',
            error: error.message,
            output: error.stdout,
            details: error.stderr
          };
        } finally {
          // Cleanup
          if (fs.existsSync(testPath)) {
            fs.unlinkSync(testPath);
          }
        }
      }
    }
  ];
}
