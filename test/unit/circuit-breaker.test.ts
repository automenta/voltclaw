import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitState } from '../../src/core/circuit-breaker.js';
import { CircuitOpenError } from '../../src/core/errors.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;
  const config = {
    failureThreshold: 3,
    resetTimeoutMs: 100
  };

  beforeEach(() => {
    breaker = new CircuitBreaker(config);
  });

  it('should start in CLOSED state', () => {
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('should execute function successfully', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await breaker.execute(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalled();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('should count failures and open circuit', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    // Fail 3 times
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
    }

    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('should fail fast when open', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
    }

    // Next call should throw CircuitOpenError without calling fn
    await expect(breaker.execute(fn)).rejects.toThrow(CircuitOpenError);
    expect(fn).toHaveBeenCalledTimes(3); // Should not increase
  });

  it('should transition to HALF_OPEN after timeout', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    // Open circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
    }

    // Wait for timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    // Next call should be allowed (HALF_OPEN checks on call)
    // If we call it, it will transition to HALF_OPEN then try execution

    // Let's make it succeed this time
    fn.mockResolvedValueOnce('success');

    const result = await breaker.execute(fn);
    expect(result).toBe('success');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('should reopen if HALF_OPEN fails', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    // Open circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fn)).rejects.toThrow('fail');
    }

    // Wait for timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    // Next call fails
    await expect(breaker.execute(fn)).rejects.toThrow('fail');

    // Should be OPEN again
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('should use fallback if provided when OPEN', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const fallback = vi.fn().mockResolvedValue('fallback');

    // Force OPEN state (hacky or use failures)
    // Using failures
    const failFn = vi.fn().mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');
    }

    expect(breaker.getState()).toBe(CircuitState.OPEN);

    const result = await breaker.execute(fn, fallback);
    expect(result).toBe('fallback');
    expect(fn).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalled();
  });
});
