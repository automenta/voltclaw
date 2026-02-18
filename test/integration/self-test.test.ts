import { describe, it, expect, vi, afterEach } from 'vitest';
import { VoltClawAgent } from '../../src/core/agent.js';
import { createTestTools } from '../../src/tools/test.js';
import fs from 'fs';
import path from 'path';

describe('Self-Testing Tool', () => {
  const mockLLM = {
    name: 'mock',
    model: 'mock',
    chat: vi.fn().mockResolvedValue({ content: 'import { describe, it, expect } from "vitest"; describe("generated", () => { it("passes", () => { expect(true).toBe(true); }); });' })
  };

  const mockStore = {
    get: vi.fn(),
    createMemory: vi.fn()
  };

  const agent = new VoltClawAgent({
    llm: mockLLM as any,
    persistence: mockStore as any,
    channel: { subscribe: vi.fn(), identity: { publicKey: 'me' } } as any,
    enableSelfTest: true
  });

  const tools = createTestTools(agent);
  const selfTest = tools.find(t => t.name === 'self_test')!;

  afterEach(() => {
    // Cleanup temp dir
    const tempDir = path.join(process.cwd(), 'test', 'temp');
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should run provided code', async () => {
    const result = await selfTest.execute({
      plan: 'Manual test',
      code: `
        import { describe, it, expect } from 'vitest';
        describe('manual', () => {
          it('works', () => {
            expect(1 + 1).toBe(2);
          });
        });
      `
    }, agent, {} as any, 'admin');

    expect(result).toHaveProperty('status', 'passed');
    expect((result as any).output).toContain('1 passed');
  });

  it('should generate and run test code if code not provided', async () => {
    const result = await selfTest.execute({
      plan: 'Test truth'
    }, agent, {} as any, 'admin');

    expect(mockLLM.chat).toHaveBeenCalled();
    expect(result).toHaveProperty('status', 'passed');
  });

  it('should report failure for bad tests', async () => {
    const result = await selfTest.execute({
      plan: 'Fail test',
      code: `
        import { describe, it, expect } from 'vitest';
        describe('fail', () => {
          it('fails', () => {
            expect(1 + 1).toBe(3);
          });
        });
      `
    }, agent, {} as any, 'admin');

    expect(result).toHaveProperty('status', 'failed');
    expect((result as any).error).toBeDefined();
  });
});
