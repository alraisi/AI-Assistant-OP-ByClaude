import { getConfig } from '../config/index.js';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private windowMs: number;
  private maxMessages: number;

  constructor(windowMs?: number, maxMessages?: number) {
    const config = getConfig();
    this.windowMs = windowMs || config.rateLimitWindowMs;
    this.maxMessages = maxMessages || config.rateLimitMaxMessages;
  }

  isRateLimited(key: string): boolean {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry) {
      return false;
    }

    // Check if window has expired
    if (now - entry.windowStart > this.windowMs) {
      this.limits.delete(key);
      return false;
    }

    return entry.count >= this.maxMessages;
  }

  recordMessage(key: string): void {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || now - entry.windowStart > this.windowMs) {
      // Start new window
      this.limits.set(key, { count: 1, windowStart: now });
    } else {
      // Increment existing window
      entry.count++;
    }
  }

  getRemainingMessages(key: string): number {
    const entry = this.limits.get(key);

    if (!entry) {
      return this.maxMessages;
    }

    const now = Date.now();
    if (now - entry.windowStart > this.windowMs) {
      return this.maxMessages;
    }

    return Math.max(0, this.maxMessages - entry.count);
  }

  getResetTime(key: string): number | null {
    const entry = this.limits.get(key);

    if (!entry) {
      return null;
    }

    const resetTime = entry.windowStart + this.windowMs;
    const now = Date.now();

    if (now >= resetTime) {
      return null;
    }

    return resetTime - now;
  }

  reset(key: string): void {
    this.limits.delete(key);
  }

  resetAll(): void {
    this.limits.clear();
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (now - entry.windowStart > this.windowMs) {
        this.limits.delete(key);
      }
    }
  }
}

let instance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!instance) {
    instance = new RateLimiter();
  }
  return instance;
}

// Cleanup old entries periodically
setInterval(() => {
  if (instance) {
    instance.cleanup();
  }
}, 60000); // Every minute
