import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStore } from '../../src/memory/sqlite.js';
import { PromptManager } from '../../src/core/prompt-manager.js';
import type { LLMProvider } from '../../src/core/types.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Prompt Manager Integration', () => {
  const dbPath = path.join(__dirname, 'test-prompts.db');

  beforeEach(() => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  const mockLLM: LLMProvider = {
    name: 'mock',
    model: 'mock',
    chat: async (messages) => {
        const content = messages[messages.length - 1].content || '';
        if (content.includes('Optimize the following prompt')) {
            return { content: 'Optimized Content' };
        }
        return { content: '' };
    }
  };

  it('should create and retrieve a prompt template', async () => {
    const store = new SQLiteStore({ path: dbPath });
    const manager = new PromptManager(store, mockLLM);
    await store.load();

    await manager.createTemplate('test-prompt', 'A test prompt', 'Initial content');

    const content = await manager.getPrompt('test-prompt');
    expect(content).toBe('Initial content');

    const templates = await manager.listTemplates();
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe('test-prompt');
  });

  it('should update and version a prompt', async () => {
    const store = new SQLiteStore({ path: dbPath });
    const manager = new PromptManager(store, mockLLM);
    await store.load();

    await manager.createTemplate('test-prompt', 'A test prompt', 'v1');
    await manager.updatePrompt('test-prompt', 'v2', 'Updated to v2');

    const latest = await manager.getPrompt('test-prompt');
    expect(latest).toBe('v2');

    const v1 = await manager.getPrompt('test-prompt', 1);
    expect(v1).toBe('v1');
  });

  it('should optimize a prompt using LLM', async () => {
    const store = new SQLiteStore({ path: dbPath });
    const manager = new PromptManager(store, mockLLM);
    await store.load();

    await manager.createTemplate('opt-prompt', 'To be optimized', 'Bad content');

    const optimized = await manager.optimizePrompt('opt-prompt', 'Make it better');
    expect(optimized).toBe('Optimized Content');
  });
});
