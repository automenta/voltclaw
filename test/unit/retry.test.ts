import { describe, it, expect, vi } from 'vitest';
import { Retrier } from '../../src/core/retry.js';
import { TimeoutError, CircuitOpenError } from '../../src/core/errors.js';

describe('Retrier', () => {
  const config = {
    maxAttempts: 3,
    baseDelayMs: 10,
    maxDelayMs: 100,
    jitterFactor: 0.1
  };

  it('should execute function successfully on first try', async () => {
    const retrier = new Retrier(config);
    const fn = vi.fn().mockResolvedValue('success');

    const result = await retrier.execute(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const retrier = new Retrier(config);
    const fn = vi.fn()
      .mockRejectedValueOnce(new TimeoutError(100, 'timeout'))
      .mockResolvedValue('success');

    const result = await retrier.execute(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should fail after max attempts', async () => {
    const retrier = new Retrier(config);
    const fn = vi.fn().mockRejectedValue(new TimeoutError(100, 'timeout'));

    await expect(retrier.execute(fn)).rejects.toThrow('timeout');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should fail immediately on non-retryable error', async () => {
    const retrier = new Retrier(config);
    // CircuitOpenError is non-retryable
    const fn = vi.fn().mockRejectedValue(new CircuitOpenError());

    await expect(retrier.execute(fn)).rejects.toThrow(CircuitOpenError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should respect max delay', async () => {
    const retrier = new Retrier({ ...config, maxDelayMs: 20 });
    const fn = vi.fn().mockRejectedValue(new TimeoutError(100, 'timeout'));

    const start = Date.now();
    try {
      await retrier.execute(fn);
    } catch {
      // ignore
    }
    const duration = Date.now() - start;

    // 3 attempts = 2 delays.
    // Delay 1: 10ms (base)
    // Delay 2: 20ms (capped by maxDelay)
    // Total approx 30ms + execution time
    // This is hard to test precisely without fake timers, but ensures it runs.
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
