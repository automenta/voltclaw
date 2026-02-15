import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { healthCommand } from '../../src/cli/commands/health.js';
import { FileStore } from '../../src/memory/index.js';
import { NostrClient } from '../../src/channels/nostr/index.js';
import * as configModule from '../../src/cli/config.js';

// Mock dependencies
// When using vi.mock with factory, we need to ensure the mocked module exports a class constructor that returns an object with the methods.
// The error "llm.chat is not a function" implies that createLLMProvider returned something where chat is missing or not a function.
// vi.fn().mockImplementation(() => ({ ... })) should work if called with new.

vi.mock('../../src/llm/index.js', () => {
  const OllamaProvider = vi.fn();
  OllamaProvider.prototype.chat = vi.fn().mockResolvedValue({ content: 'pong' });

  return {
    OllamaProvider,
    OpenAIProvider: vi.fn(),
    AnthropicProvider: vi.fn()
  };
});

vi.mock('../../src/channels/nostr/index.js', () => {
  const NostrClient = vi.fn();
  NostrClient.prototype.start = vi.fn().mockResolvedValue(undefined);
  NostrClient.prototype.stop = vi.fn().mockResolvedValue(undefined);
  NostrClient.prototype.identity = { publicKey: 'test-pubkey' };

  return {
    NostrClient,
    generateNewKeyPair: vi.fn()
  };
});

vi.mock('../../src/memory/index.js', () => {
  return {
    FileStore: class {
      async load() { return Promise.resolve(); }
      getAll() { return { 'session1': {} }; }
    }
  };
});

describe('Health Command', () => {
  let consoleSpy: any;
  let exitSpy: any;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    // Mock config loading
    vi.spyOn(configModule, 'loadConfig').mockResolvedValue({
      relays: ['wss://test.relay'],
      llm: { provider: 'ollama', model: 'test' },
      delegation: { maxDepth: 1, maxCalls: 1, budgetUSD: 1, timeoutMs: 1000 }
    });

    vi.spyOn(configModule, 'loadOrGenerateKeys').mockResolvedValue({
      publicKey: 'pub',
      secretKey: 'sec'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs all checks successfully', async () => {
    await healthCommand(false);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('LLM'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Channel'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Storage'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('All systems healthy'));
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('outputs JSON when requested', async () => {
    await healthCommand(true);

    // In the test environment, consoleSpy might be called multiple times if there is async logic leaking or setup
    // But since we mock everything, it should be the only call for this test instance ideally.
    // However, consoleSpy.mock.calls[0][0] gets the FIRST call.
    // Let's verify what was logged.
    // Actually, healthCommand logs ONCE for json output.

    const lastCall = consoleSpy.mock.lastCall?.[0];
    // If undefined, it failed to log
    if (!lastCall) throw new Error('No console output');

    const json = JSON.parse(lastCall);

    // Debug
    // console.error(JSON.stringify(json, null, 2));

    // Due to the issue with mocking and the health command maybe not resolving strictly in test env:
    // Actually, checks.every(c => c.healthy) should be true if all checks are true.
    // The previous run failure says: expected false to be true.
    // This implies one of the checks failed.
    // Let's inspect the checks in the failure message if we could, or just assert on checks first.

    expect(json.checks).toBeDefined();
    if (!json.healthy) {
       // Identify which check failed
       const failed = json.checks.filter((c: any) => !c.healthy);
       console.error('Failed checks:', failed);
    }

    expect(json.healthy).toBe(true);
    expect(json.checks).toHaveLength(3);
    expect(json.checks[0].name).toBe('LLM');
  });
});
