import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, withTimeout, isRetryableApiError } from './retry.js';

describe('isRetryableApiError', () => {
  it('should return false for null/undefined', () => {
    expect(isRetryableApiError(null)).toBe(false);
    expect(isRetryableApiError(undefined)).toBe(false);
  });

  it('should return true for timeout errors', () => {
    expect(isRetryableApiError(new Error('Operation timed out after 5000ms'))).toBe(true);
  });

  it('should return true for fetch TypeError', () => {
    expect(isRetryableApiError(new TypeError('fetch failed'))).toBe(true);
  });

  it('should return true for ECONNRESET', () => {
    const err = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    expect(isRetryableApiError(err)).toBe(true);
  });

  it('should return true for ECONNREFUSED', () => {
    const err = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
    expect(isRetryableApiError(err)).toBe(true);
  });

  it('should return true for ETIMEDOUT', () => {
    const err = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    expect(isRetryableApiError(err)).toBe(true);
  });

  it('should return true for EPIPE', () => {
    const err = Object.assign(new Error('pipe'), { code: 'EPIPE' });
    expect(isRetryableApiError(err)).toBe(true);
  });

  it('should return true for ENOTFOUND', () => {
    const err = Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    expect(isRetryableApiError(err)).toBe(true);
  });

  it('should return true for 429 status (rate limit)', () => {
    expect(isRetryableApiError({ status: 429 })).toBe(true);
  });

  it('should return true for 500 status', () => {
    expect(isRetryableApiError({ status: 500 })).toBe(true);
  });

  it('should return true for 502 status', () => {
    expect(isRetryableApiError({ status: 502 })).toBe(true);
  });

  it('should return true for 503 status', () => {
    expect(isRetryableApiError({ status: 503 })).toBe(true);
  });

  it('should return true for 504 status', () => {
    expect(isRetryableApiError({ status: 504 })).toBe(true);
  });

  it('should return false for 400 status', () => {
    expect(isRetryableApiError({ status: 400 })).toBe(false);
  });

  it('should return false for 401 status', () => {
    expect(isRetryableApiError({ status: 401 })).toBe(false);
  });

  it('should return false for 403 status', () => {
    expect(isRetryableApiError({ status: 403 })).toBe(false);
  });

  it('should return false for 404 status', () => {
    expect(isRetryableApiError({ status: 404 })).toBe(false);
  });

  it('should handle statusCode property (OpenAI SDK)', () => {
    expect(isRetryableApiError({ statusCode: 429 })).toBe(true);
    expect(isRetryableApiError({ statusCode: 400 })).toBe(false);
  });

  it('should handle response.status property', () => {
    expect(isRetryableApiError({ response: { status: 502 } })).toBe(true);
    expect(isRetryableApiError({ response: { status: 401 } })).toBe(false);
  });

  it('should return true for AbortError', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(isRetryableApiError(err)).toBe(true);
  });

  it('should return false for unknown error types', () => {
    expect(isRetryableApiError(new Error('random error'))).toBe(false);
  });

  it('should return false for non-error objects', () => {
    expect(isRetryableApiError({ message: 'not an error' })).toBe(false);
  });
});

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve if promise completes before timeout', async () => {
    const promise = Promise.resolve('success');
    const result = await withTimeout(promise, 1000);
    expect(result).toBe('success');
  });

  it('should reject with timeout error if promise takes too long', async () => {
    vi.useRealTimers(); // Use real timers to avoid unhandled rejection from stale setTimeout
    const promise = new Promise((resolve) => setTimeout(resolve, 5000));
    await expect(withTimeout(promise, 50)).rejects.toThrow('Operation timed out after 50ms');
  });

  it('should propagate the original error if promise rejects before timeout', async () => {
    const promise = Promise.reject(new Error('original error'));
    await expect(withTimeout(promise, 1000)).rejects.toThrow('original error');
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // deterministic jitter: factor = 0.8 + 0.5*0.4 = 1.0
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable error and succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValue('success');

    const retryPromise = withRetry(fn, { maxRetries: 3 });

    // Advance past the first retry delay
    await vi.advanceTimersByTimeAsync(2000);

    const result = await retryPromise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400 });

    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toEqual({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw after exhausting all retries', { retry: 0 }, async () => {
    vi.useRealTimers(); // Use real timers to avoid unhandled rejection races
    const fn = vi.fn().mockRejectedValue(new Error('timed out'));

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 20 })
    ).rejects.toThrow('timed out');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('should use custom retryableErrors function', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('custom error'));
    const retryableErrors = vi.fn().mockReturnValue(false);

    await expect(
      withRetry(fn, { maxRetries: 3, retryableErrors })
    ).rejects.toThrow('custom error');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(retryableErrors).toHaveBeenCalledTimes(1);
  });

  it('should respect maxRetries option', { retry: 0 }, async () => {
    vi.useRealTimers(); // Use real timers to avoid unhandled rejection races
    const fn = vi.fn().mockRejectedValue(new Error('timed out'));

    await expect(
      withRetry(fn, { maxRetries: 1, baseDelayMs: 10, maxDelayMs: 20 })
    ).rejects.toThrow('timed out');
    expect(fn).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });

  it('should apply exponential backoff', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 500 })
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValue('success');

    const retryPromise = withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 1000,
      backoffMultiplier: 2,
    });

    // First retry: 1000ms * 1.0 (jitter) = 1000ms
    await vi.advanceTimersByTimeAsync(1100);
    // Second retry: 2000ms * 1.0 (jitter) = 2000ms
    await vi.advanceTimersByTimeAsync(2100);

    const result = await retryPromise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should cap delay at maxDelayMs', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValue('success');

    const retryPromise = withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 50000,
      maxDelayMs: 1000,
    });

    // Should be capped at maxDelayMs (1000 * jitter 1.0 = 1000ms)
    await vi.advanceTimersByTimeAsync(1200);

    const result = await retryPromise;
    expect(result).toBe('success');
  });

  it('should use timeout when specified', { retry: 0 }, async () => {
    vi.useRealTimers(); // Use real timers for timeout test
    const fn = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('late'), 5000))
    );

    await expect(
      withRetry(fn, { maxRetries: 0, timeoutMs: 50 })
    ).rejects.toThrow('timed out');
  });
});
