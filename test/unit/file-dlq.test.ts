import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileDLQ, FailedOperation } from '../../src/core/dlq.js';
import { createDLQTools } from '../../src/tools/dlq.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('FileDLQ', () => {
  const tmpDir = path.join(os.tmpdir(), `voltclaw-dlq-test-${Date.now()}`);
  const dlqPath = path.join(tmpDir, 'dlq.json');

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should save and list operations', async () => {
    const dlq = new FileDLQ(dlqPath);
    const op: FailedOperation = {
      id: 'test-id',
      tool: 'grep',
      args: { pattern: 'foo' },
      error: 'failed',
      timestamp: new Date(),
      retryCount: 0
    };

    await dlq.save(op);

    const items = await dlq.list();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('test-id');
    expect(items[0].tool).toBe('grep');
  });

  it('should persist to file', async () => {
    const dlq1 = new FileDLQ(dlqPath);
    const op: FailedOperation = {
      id: 'test-id',
      tool: 'grep',
      args: { pattern: 'foo' },
      error: 'failed',
      timestamp: new Date(),
      retryCount: 0
    };

    await dlq1.save(op);

    const dlq2 = new FileDLQ(dlqPath);
    const items = await dlq2.list();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('test-id');
  });

  it('should remove operation', async () => {
    const dlq = new FileDLQ(dlqPath);
    const op: FailedOperation = {
      id: 'test-id',
      tool: 'grep',
      args: { pattern: 'foo' },
      error: 'failed',
      timestamp: new Date(),
      retryCount: 0
    };

    await dlq.save(op);
    await dlq.remove('test-id');

    const items = await dlq.list();
    expect(items).toHaveLength(0);
  });

  it('should reload data from file on list', async () => {
    const dlq1 = new FileDLQ(dlqPath);
    const op: FailedOperation = {
      id: 'test-id',
      tool: 'grep',
      args: { pattern: 'foo' },
      error: 'failed',
      timestamp: new Date(),
      retryCount: 0
    };
    await dlq1.save(op);

    // Simulate another process adding an item
    const dlq2 = new FileDLQ(dlqPath);
    const op2: FailedOperation = {
      id: 'test-id-2',
      tool: 'grep',
      args: { pattern: 'bar' },
      error: 'failed',
      timestamp: new Date(),
      retryCount: 0
    };
    await dlq2.save(op2);

    // dlq1 should see both items
    const items = await dlq1.list();
    expect(items).toHaveLength(2);
    expect(items.find(i => i.id === 'test-id-2')).toBeDefined();
  });
});

describe('DLQ Tools', () => {
  const mockDLQ = {
    list: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    push: vi.fn()
  };

  const mockAgent = {
    dlq: mockDLQ,
    retryTool: vi.fn()
  };

  const tools = createDLQTools(mockAgent as any);
  const toolMap = new Map(tools.map(t => [t.name, t]));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dlq_list should return items', async () => {
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
    mockDLQ.list.mockResolvedValue(items);

    const result = await toolMap.get('dlq_list')!.execute({});
    expect(result.count).toBe(1);
    expect(result.items[0].id).toBe('1');
  });

  it('dlq_retry should call retryTool and remove from DLQ on success', async () => {
    const item = {
      id: '1',
      tool: 'grep',
      args: { pattern: 'foo' },
      error: 'err',
      timestamp: new Date(),
      retryCount: 0
    };
    mockDLQ.get.mockResolvedValue(item);
    mockAgent.retryTool.mockResolvedValue({ status: 'ok' });

    const result = await toolMap.get('dlq_retry')!.execute({ id: '1' });

    expect(mockAgent.retryTool).toHaveBeenCalledWith('grep', { pattern: 'foo' });
    expect(mockDLQ.remove).toHaveBeenCalledWith('1');
    expect(result.status).toBe('success');
  });

  it('dlq_retry should return error if item not found', async () => {
    mockDLQ.get.mockResolvedValue(undefined);

    const result = await toolMap.get('dlq_retry')!.execute({ id: '1' });
    expect(result.error).toContain('not found');
  });

  it('dlq_retry should remove old item even if retry fails', async () => {
    const item = {
      id: '1',
      tool: 'grep',
      args: { pattern: 'foo' },
      error: 'err',
      timestamp: new Date(),
      retryCount: 0
    };
    mockDLQ.get.mockResolvedValue(item);
    mockAgent.retryTool.mockResolvedValue({ error: 'failed again' });

    const result = await toolMap.get('dlq_retry')!.execute({ id: '1' });

    expect(mockAgent.retryTool).toHaveBeenCalledWith('grep', { pattern: 'foo' });
    expect(mockDLQ.remove).toHaveBeenCalledWith('1'); // Should still remove
    expect(result.status).toBe('failed_again');
  });
});
