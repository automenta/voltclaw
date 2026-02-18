import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VoltClawAgent } from '../../src/core/agent.js';
import type { LLMProvider, ChatMessage, ChatResponse } from '../../src/core/types.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Documentation Integration', () => {
  const cwd = process.cwd();
  const docsDir = path.join(cwd, 'docs', 'tools');
  const docPath = path.join(docsDir, 'test_tool.md');
  const srcDir = path.join(cwd, 'src', 'tools');
  const srcPath = path.join(srcDir, 'test_tool.ts');

  // Ensure cleanup
  beforeEach(() => {
    if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir, { recursive: true });
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

    // Create dummy tool source
    fs.writeFileSync(srcPath, 'export const tool = { name: "test_tool" };');
  });

  afterEach(() => {
    if (fs.existsSync(docPath)) fs.unlinkSync(docPath);
    if (fs.existsSync(srcPath)) fs.unlinkSync(srcPath);
  });

  const mockLLM: LLMProvider = {
    name: 'mock',
    model: 'mock',
    chat: async (messages: ChatMessage[]): Promise<ChatResponse> => {
      const content = messages[messages.length - 1].content || '';

      if (content.includes('Generate comprehensive Markdown documentation')) {
        return {
          content: '# Test Tool\n\n## Description\nA test tool.\n'
        };
      }

      if (content.includes('Explain the following code')) {
        return {
          content: 'This code exports a tool object.'
        };
      }

      return { content: '' };
    }
  };

  const mockChannel = {
    type: 'memory',
    identity: { publicKey: 'test' },
    start: async () => {},
    stop: async () => {},
    send: async () => {},
    subscribe: () => () => {},
    on: () => {}
  };

  const mockStore = {
    type: 'memory',
    get: () => ({ history: [], subTasks: {}, callCount: 0, estCostUSD: 0, actualTokensUsed: 0, depth: 0, topLevelStartedAt: 0 }),
    getAll: () => ({}),
    load: async () => {},
    save: async () => {},
    clear: () => {}
  };

  it('should generate documentation file', async () => {
    const agent = new VoltClawAgent({
      llm: mockLLM,
      channel: mockChannel as any,
      persistence: mockStore as any
    });

    // Execute document_tool
    const result = await agent.executeTool('document_tool', { toolName: 'test_tool' }, {} as any, 'self');

    expect(result.error).toBeUndefined();
    expect(fs.existsSync(docPath)).toBe(true);

    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toContain('# Test Tool');
  });

  it('should explain code', async () => {
    const agent = new VoltClawAgent({
      llm: mockLLM,
      channel: mockChannel as any,
      persistence: mockStore as any
    });

    // Execute explain_code
    const result = await agent.executeTool('explain_code', { filePath: srcPath }, {} as any, 'self');

    expect(result.error).toBeUndefined();
    expect(result.result).toContain('This code exports a tool object');
  });
});
