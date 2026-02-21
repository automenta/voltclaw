import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileErrorQueue, FailedOperation } from '../../src/core/error-queue.js';
import { createErrorQueueTools } from '../../src/tools/error_queue.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('FileErrorQueue', () => {
  const tmpDir = path.join(os.tmpdir(), `voltclaw-error-queue-test-${Date.now()}`);
  const queuePath = path.join(tmpDir, 'errors.json');

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should save and list operations', async () => {
    const queue = new FileErrorQueue(queuePath);
    const op: FailedOperation = {
      id: 'test-id',
      tool: 'grep',
      args: { pattern: 'foo' },
      error: 'failed',
      timestamp: new Date(),
      retryCount: 0
    };

    await queue.save(op);

    const items = await queue.list();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('test-id');
    expect(items[0].tool).toBe('grep');
  });

  it('should persist to file', async () => {
    const queue1 = new FileErrorQueue(queuePath);
    const op: FailedOperation = {
      id: 'test-id',
      tool: 'grep',
      args: { pattern: 'foo' },
      error: 'failed',
      timestamp: new Date(),
      retryCount: 0
    };

    await queue1.save(op);

    const queue2 = new FileErrorQueue(queuePath);
    const items = await queue2.list();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('test-id');
  });

  it('should remove operation', async () => {
    const queue = new FileErrorQueue(queuePath);
    const op: FailedOperation = {
      id: 'test-id',
      tool: 'grep',
      args: { pattern: 'foo' },
      error: 'failed',
      timestamp: new Date(),
      retryCount: 0
    };

    await queue.save(op);
    await queue.remove('test-id');

    const items = await queue.list();
    expect(items).toHaveLength(0);
  });

  it('should reload data from file on list', async () => {
    const queue1 = new FileErrorQueue(queuePath);
    const op: FailedOperation = {
      id: 'test-id',
      tool: 'grep',
      args: { pattern: 'foo' },
      error: 'failed',
      timestamp: new Date(),
      retryCount: 0
    };
    await queue1.save(op);

    // Simulate another process adding an item
    const queue2 = new FileErrorQueue(queuePath);
    const op2: FailedOperation = {
      id: 'test-id-2',
      tool: 'grep',
      args: { pattern: 'bar' },
      error: 'failed',
      timestamp: new Date(),
      retryCount: 0
    };
    await queue2.save(op2);

    // queue1 should see both items
    const items = await queue1.list();
    expect(items).toHaveLength(2);
    expect(items.find(i => i.id === 'test-id-2')).toBeDefined();
  });
});

describe('ErrorQueue Tools', () => {
  const mockQueue = {
    list: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    push: vi.fn()
  };

  const mockAgent = {
    errors: mockQueue,
    retryTool: vi.fn()
  };

  const tools = createErrorQueueTools(mockAgent as any);
  const toolMap = new Map(tools.map(t => [t.name, t]));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('errors_list should return items', async () => {
    const items = [
      {
        id: '1',
        tool: 'grep',
        args: {},
        error: 'err',
        timestamp: new Date(),
        retryCount: 0
      }
    ];
    mockQueue.list.mockResolvedValue(items);

    const result = await toolMap.get('errors_list')!.execute({});
    expect(result.count).toBe(1);
    expect(result.items[0].id).toBe('1');
  });

  it('errors_retry should call retryTool and remove from queue on success', async () => {
    const item = {
      id: '1',
      tool: 'grep',
      args: { pattern: 'foo' },
      error: 'err',
      timestamp: new Date(),
      retryCount: 0
    };
    mockQueue.get.mockResolvedValue(item);
    mockAgent.retryTool.mockResolvedValue({ status: 'ok' });

    const result = await toolMap.get('errors_retry')!.execute({ id: '1' });

    expect(mockAgent.retryTool).toHaveBeenCalledWith('grep', { pattern: 'foo' });
    expect(mockQueue.remove).toHaveBeenCalledWith('1');
    expect(result.status).toBe('success');
  });

  it('errors_retry should return error if item not found', async () => {
    mockQueue.get.mockResolvedValue(undefined);

    const result = await toolMap.get('errors_retry')!.execute({ id: '1' });
    expect(result.error).toContain('not found');
  });

  it('errors_retry should remove old item even if retry fails', async () => {
    const item = {
      id: '1',
      tool: 'grep',
      args: { pattern: 'foo' },
      error: 'err',
      timestamp: new Date(),
      retryCount: 0
    };
    mockQueue.get.mockResolvedValue(item);
    mockAgent.retryTool.mockResolvedValue({ error: 'failed again' });

    const result = await toolMap.get('errors_retry')!.execute({ id: '1' });

    expect(mockAgent.retryTool).toHaveBeenCalledWith('grep', { pattern: 'foo' });
    expect(mockQueue.remove).toHaveBeenCalledWith('1'); // Should still remove
    expect(result.status).toBe('failed_again');
  });
});
