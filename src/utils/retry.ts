import pino from 'pino';

const logger = pino({ name: 'retry' });

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  timeoutMs?: number;
  retryableErrors?: (error: unknown) => boolean;
  label?: string;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'timeoutMs' | 'retryableErrors' | 'label'>> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

function addJitter(delayMs: number): number {
  // +/- 20% jitter
  const jitterFactor = 0.8 + Math.random() * 0.4;
  return Math.round(delayMs * jitterFactor);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_OPTIONS.maxRetries;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_OPTIONS.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_OPTIONS.maxDelayMs;
  const backoffMultiplier = options.backoffMultiplier ?? DEFAULT_OPTIONS.backoffMultiplier;
  const label = options.label ?? 'operation';

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = options.timeoutMs
        ? await withTimeout(fn(), options.timeoutMs)
        : await fn();
      return result;
    } catch (error) {
      lastError = error;

      // Check if this is the last attempt
      if (attempt >= maxRetries) {
        break;
      }

      // Check if error is retryable
      const isRetryable = options.retryableErrors
        ? options.retryableErrors(error)
        : isRetryableApiError(error);

      if (!isRetryable) {
        logger.debug({ error, label }, 'Non-retryable error, failing immediately');
        break;
      }

      // Calculate delay with exponential backoff + jitter
      const rawDelay = baseDelayMs * Math.pow(backoffMultiplier, attempt);
      const cappedDelay = Math.min(rawDelay, maxDelayMs);
      const delay = addJitter(cappedDelay);

      logger.warn(
        { attempt: attempt + 1, maxRetries, delay, label },
        `Retrying after error`
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

export function isRetryableApiError(error: unknown): boolean {
  if (!error) return false;

  // Timeout errors are retryable
  if (error instanceof Error && error.message.includes('timed out')) {
    return true;
  }

  // Network errors are retryable
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Check for common network error codes
  if (isNodeError(error)) {
    const retryableCodes = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND'];
    if (error.code && retryableCodes.includes(error.code)) {
      return true;
    }
  }

  // Check HTTP status codes from API errors
  const statusCode = extractStatusCode(error);
  if (statusCode !== null) {
    // 429 (rate limit) and 5xx (server errors) are retryable
    if (statusCode === 429 || (statusCode >= 500 && statusCode <= 504)) {
      return true;
    }
    // 400, 401, 403, 404 are NOT retryable
    if (statusCode >= 400 && statusCode < 500) {
      return false;
    }
  }

  // AbortError (from timeouts) is retryable
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }

  // Default: not retryable for unknown errors
  return false;
}

interface NodeError extends Error {
  code?: string;
}

function isNodeError(error: unknown): error is NodeError {
  return error instanceof Error && 'code' in error;
}

function extractStatusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;

  // Anthropic SDK errors have a `status` property
  if ('status' in error && typeof (error as any).status === 'number') {
    return (error as any).status;
  }

  // OpenAI SDK errors
  if ('statusCode' in error && typeof (error as any).statusCode === 'number') {
    return (error as any).statusCode;
  }

  // Generic HTTP response errors
  if ('response' in error && (error as any).response?.status) {
    return (error as any).response.status;
  }

  return null;
}
