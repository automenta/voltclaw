import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeartbeatManager } from '../../src/core/heartbeat.js';
import { VoltClawAgent } from '../../src/core/agent.js';
import * as fs from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises', async () => {
    return {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        join: vi.fn(),
    }
});

describe('HeartbeatManager', () => {
  const mockAgent = {
    query: vi.fn().mockResolvedValue('OK')
  } as unknown as VoltClawAgent;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute tasks from HEARTBEAT.md', async () => {
    // Mock file content
    vi.mocked(fs.readFile).mockResolvedValue('# Tasks\n- [ ] Task 1\n- Task 2');

    const manager = new HeartbeatManager(mockAgent, 1000);
    manager.start();

    // Fast forward time
    await vi.advanceTimersByTimeAsync(1100);

    expect(mockAgent.query).toHaveBeenCalledWith(expect.stringContaining('Task 1'), expect.any(Object));
    expect(mockAgent.query).toHaveBeenCalledWith(expect.stringContaining('Task 2'), expect.any(Object));

    manager.stop();
  });

  it('should do nothing if HEARTBEAT.md is empty', async () => {
    // Mock empty file content
    vi.mocked(fs.readFile).mockResolvedValue('');

    const manager = new HeartbeatManager(mockAgent, 1000);
    manager.start();

    await vi.advanceTimersByTimeAsync(1100);

    expect(mockAgent.query).not.toHaveBeenCalled();

    manager.stop();
  });
});
