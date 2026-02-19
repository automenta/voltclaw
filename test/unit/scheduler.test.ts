import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../../src/core/scheduler.js';
import { MemoryStore } from '../../src/memory/memory-store.js';
import type { VoltClawAgent } from '../../src/core/agent.js';

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let store: MemoryStore;
  let mockAgent: VoltClawAgent;

  beforeEach(() => {
    store = new MemoryStore();
    mockAgent = {
      getStore: () => store,
      query: vi.fn().mockResolvedValue('Task result'),
    } as unknown as VoltClawAgent;
    scheduler = new Scheduler(mockAgent);
  });

  afterEach(async () => {
    await scheduler.stop();
  });

  it('should schedule a task', async () => {
    const id = await scheduler.schedule('* * * * *', 'Test task');
    const tasks = await scheduler.list();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe(id);
    expect(tasks[0].task).toBe('Test task');
  });

  it('should cancel a task', async () => {
    const id = await scheduler.schedule('* * * * *', 'Test task');
    await scheduler.cancel(id);
    const tasks = await scheduler.list();
    expect(tasks).toHaveLength(0);
  });
});
