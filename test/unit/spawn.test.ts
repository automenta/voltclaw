import { describe, it, expect, vi } from 'vitest';
import { SpawnManager } from '../../src/core/spawn.js';
import { VoltClawAgent } from '../../src/core/agent.js';

describe('SpawnManager', () => {
  const mockAgent = {
    query: vi.fn().mockResolvedValue('OK')
  } as unknown as VoltClawAgent;

  it('should spawn a task', async () => {
    const manager = new SpawnManager(mockAgent);
    const id = await manager.spawnTask('Test Task');

    expect(id).toBeDefined();
    expect(manager.getTasks()).toHaveLength(1);
    expect(manager.getTasks()[0].task).toBe('Test Task');

    // Wait for async execution
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockAgent.query).toHaveBeenCalledWith(expect.stringContaining('Test Task'));
    expect(manager.getTasks()[0].status).toBe('completed');
  });

  it('should handle failed tasks', async () => {
    const failingAgent = {
      query: vi.fn().mockRejectedValue(new Error('Failed'))
    } as unknown as VoltClawAgent;

    const manager = new SpawnManager(failingAgent);
    const id = await manager.spawnTask('Test Task');

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(manager.getTasks()[0].status).toBe('failed');
    expect(manager.getTasks()[0].error).toBe('Failed');
  });
});
