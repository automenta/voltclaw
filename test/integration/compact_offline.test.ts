import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startCommand } from '../../src/cli/commands/start.js';
import * as config from '../../src/cli/config.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock dependencies
vi.mock('../../src/core/agent.js', () => {
  return {
    VoltClawAgent: vi.fn().mockImplementation((opts) => ({
      start: vi.fn().mockRejectedValue(new Error('TestBreak')), // Break execution flow
      stop: vi.fn(),
      queryStream: vi.fn(),
      on: vi.fn(),
      // Store options for verification if needed, though we check constructor call
      options: opts
    }))
  };
});

vi.mock('readline', () => ({
  default: {
    createInterface: () => ({
      on: vi.fn(),
      prompt: vi.fn(),
      close: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn()
    })
  }
}));

// Mock fetch for LLM check
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({})
});

describe('Start Command with Compact Offline Config', () => {
  const tmpDir = path.join(os.tmpdir(), `voltclaw-start-test-${Date.now()}`);

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });

    // Mock fs.stat to pretend config file exists
    vi.spyOn(fs, 'stat').mockResolvedValue({} as any);

    // Mock config loading
    vi.spyOn(config, 'loadConfig').mockResolvedValue({
      channels: [],
      llm: {
        provider: 'ollama',
        model: 'llama3.2',
        baseUrl: 'http://localhost:11434'
      },
      call: {
        maxDepth: 2,
        maxCalls: 10,
        budgetUSD: 0.1,
        timeoutMs: 10000
      },
      history: {
        maxMessages: 20,
        contextWindowSize: 20
      },
      errors: {
        type: 'memory',
        enableTools: false
      },
      permissions: {
        policy: 'allow_all'
      }
    });

    vi.spyOn(config, 'loadOrGenerateKeys').mockResolvedValue({
      publicKey: 'test-pub',
      secretKey: 'test-sec'
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should initialize agent with Stdio channel and Compact history settings', async () => {
    const { VoltClawAgent } = await import('../../src/core/agent.js');

    try {
      await startCommand(false);
    } catch (e: any) {
      if (e.message !== 'TestBreak') throw e;
    }

    expect(VoltClawAgent).toHaveBeenCalledTimes(1);
    const args = (VoltClawAgent as any).mock.calls[0][0];

    // Verify Channel: Should have added Stdio because channels were empty
    expect(args.channel).toBeDefined();
    // channels is array of { type: 'stdio' }
    expect(args.channel).toHaveLength(1);
    expect(args.channel[0]).toMatchObject({ type: 'stdio' });

    // Verify History Settings
    expect(args.history).toBeDefined();
    expect(args.history.maxMessages).toBe(20);
    expect(args.history.contextWindowSize).toBe(20);

    // Verify LLM Provider (Ollama)
    expect(args.llm.constructor.name).toBe('OllamaProvider');
  });
});
