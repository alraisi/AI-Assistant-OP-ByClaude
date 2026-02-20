import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from './rate-limiter.js';

// Mock getConfig to avoid loading .env
vi.mock('../config/index.js', () => ({
  getConfig: vi.fn(() => ({
    rateLimitWindowMs: 60000,
    rateLimitMaxMessages: 20,
  })),
}));

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    // Pass explicit params to bypass getConfig()
    limiter = new RateLimiter(60000, 5);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isRateLimited', () => {
    it('should not be rate limited initially', () => {
      expect(limiter.isRateLimited('user1')).toBe(false);
    });

    it('should not be rate limited after recording fewer messages than limit', () => {
      limiter.recordMessage('user1');
      limiter.recordMessage('user1');
      expect(limiter.isRateLimited('user1')).toBe(false);
    });

    it('should be rate limited after exceeding max messages', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordMessage('user1');
      }
      expect(limiter.isRateLimited('user1')).toBe(true);
    });

    it('should not rate limit different users independently', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordMessage('user1');
      }
      expect(limiter.isRateLimited('user1')).toBe(true);
      expect(limiter.isRateLimited('user2')).toBe(false);
    });

    it('should reset after window expires', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordMessage('user1');
      }
      expect(limiter.isRateLimited('user1')).toBe(true);

      // Advance past the window
      vi.advanceTimersByTime(61000);
      expect(limiter.isRateLimited('user1')).toBe(false);
    });
  });

  describe('recordMessage', () => {
    it('should start a new window for first message', () => {
      limiter.recordMessage('user1');
      expect(limiter.getRemainingMessages('user1')).toBe(4);
    });

    it('should increment count within same window', () => {
      limiter.recordMessage('user1');
      limiter.recordMessage('user1');
      limiter.recordMessage('user1');
      expect(limiter.getRemainingMessages('user1')).toBe(2);
    });

    it('should start a new window after expiry', () => {
      limiter.recordMessage('user1');
      limiter.recordMessage('user1');

      vi.advanceTimersByTime(61000);

      limiter.recordMessage('user1');
      expect(limiter.getRemainingMessages('user1')).toBe(4);
    });
  });

  describe('getRemainingMessages', () => {
    it('should return max for unknown user', () => {
      expect(limiter.getRemainingMessages('unknown')).toBe(5);
    });

    it('should return correct remaining count', () => {
      limiter.recordMessage('user1');
      expect(limiter.getRemainingMessages('user1')).toBe(4);
    });

    it('should return 0 when limit reached', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordMessage('user1');
      }
      expect(limiter.getRemainingMessages('user1')).toBe(0);
    });

    it('should return 0 when limit exceeded', () => {
      for (let i = 0; i < 10; i++) {
        limiter.recordMessage('user1');
      }
      expect(limiter.getRemainingMessages('user1')).toBe(0);
    });

    it('should return max after window expires', () => {
      limiter.recordMessage('user1');
      vi.advanceTimersByTime(61000);
      expect(limiter.getRemainingMessages('user1')).toBe(5);
    });
  });

  describe('getResetTime', () => {
    it('should return null for unknown user', () => {
      expect(limiter.getResetTime('unknown')).toBeNull();
    });

    it('should return remaining time in window', () => {
      limiter.recordMessage('user1');
      vi.advanceTimersByTime(10000);
      const resetTime = limiter.getResetTime('user1');
      expect(resetTime).not.toBeNull();
      expect(resetTime!).toBeLessThanOrEqual(50000);
      expect(resetTime!).toBeGreaterThan(0);
    });

    it('should return null after window expires', () => {
      limiter.recordMessage('user1');
      vi.advanceTimersByTime(61000);
      expect(limiter.getResetTime('user1')).toBeNull();
    });
  });

  describe('reset', () => {
    it('should clear rate limit for specific user', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordMessage('user1');
      }
      expect(limiter.isRateLimited('user1')).toBe(true);

      limiter.reset('user1');
      expect(limiter.isRateLimited('user1')).toBe(false);
      expect(limiter.getRemainingMessages('user1')).toBe(5);
    });

    it('should not affect other users', () => {
      limiter.recordMessage('user1');
      limiter.recordMessage('user2');
      limiter.reset('user1');
      expect(limiter.getRemainingMessages('user1')).toBe(5);
      expect(limiter.getRemainingMessages('user2')).toBe(4);
    });
  });

  describe('resetAll', () => {
    it('should clear all rate limits', () => {
      limiter.recordMessage('user1');
      limiter.recordMessage('user2');
      limiter.resetAll();
      expect(limiter.getRemainingMessages('user1')).toBe(5);
      expect(limiter.getRemainingMessages('user2')).toBe(5);
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', () => {
      limiter.recordMessage('user1');
      limiter.recordMessage('user2');

      vi.advanceTimersByTime(61000);

      limiter.cleanup();

      // After cleanup, remaining should be max (entries removed)
      expect(limiter.getRemainingMessages('user1')).toBe(5);
      expect(limiter.getRemainingMessages('user2')).toBe(5);
    });

    it('should not remove active entries', () => {
      limiter.recordMessage('user1');

      vi.advanceTimersByTime(30000);

      limiter.recordMessage('user2');

      vi.advanceTimersByTime(31000); // user1 expired, user2 still active

      limiter.cleanup();

      expect(limiter.getRemainingMessages('user1')).toBe(5); // cleaned up
      expect(limiter.getRemainingMessages('user2')).toBe(4); // still active
    });
  });
});
