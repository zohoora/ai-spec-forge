// Retry utilities with exponential backoff per spec 6.3

export interface RetryOptions {
  maxRetries?: number;
  maxDuration?: number; // Max retry window in ms (default: 5 minutes)
  baseDelay?: number;   // Base delay in ms
  maxDelay?: number;    // Max delay between retries
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'shouldRetry' | 'onRetry'>> = {
  maxRetries: 5,
  maxDuration: 5 * 60 * 1000, // 5 minutes
  baseDelay: 1000,
  maxDelay: 60000,
};

/**
 * Check if an error is a rate limit (HTTP 429)
 */
export function isRateLimitError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('too many requests')
  );
}

/**
 * Check if an error is transient and should be retried
 */
export function isTransientError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    isRateLimitError(error) ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('socket hang up') ||
    message.includes('503') ||
    message.includes('502') ||
    message.includes('504')
  );
}

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateDelay(
  attempt: number,
  isRateLimit: boolean,
  options: Required<Omit<RetryOptions, 'shouldRetry' | 'onRetry'>>
): number {
  // Use longer base delay for rate limits
  const baseDelay = isRateLimit ? 10000 : options.baseDelay;

  // Exponential backoff: baseDelay * 2^(attempt-1)
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, options.maxDelay);

  // Add random jitter (0-1000ms)
  const jitter = Math.random() * 1000;

  return cappedDelay + jitter;
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let attempt = 0;
  let lastError: Error | null = null;

  while (true) {
    attempt++;

    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const shouldRetry = opts.shouldRetry
        ? opts.shouldRetry(lastError)
        : isTransientError(lastError);

      if (!shouldRetry) {
        throw lastError;
      }

      // Check if we've exceeded max retries
      if (attempt >= opts.maxRetries) {
        throw new Error(
          `Max retries (${opts.maxRetries}) exceeded. Last error: ${lastError.message}`
        );
      }

      // Check if we've exceeded max duration
      const elapsed = Date.now() - startTime;
      if (elapsed >= opts.maxDuration) {
        throw new Error(
          `Retry window (${opts.maxDuration / 1000}s) exceeded. Last error: ${lastError.message}`
        );
      }

      // Calculate delay
      const isRateLimit = isRateLimitError(lastError);
      const delay = calculateDelay(attempt, isRateLimit, opts);

      // Check if delay would exceed remaining time
      const remainingTime = opts.maxDuration - elapsed;
      if (delay > remainingTime) {
        throw new Error(
          `Retry would exceed time limit. Last error: ${lastError.message}`
        );
      }

      // Notify of retry
      opts.onRetry?.(attempt, lastError, delay);

      // Wait before retry
      await sleep(delay);
    }
  }
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a timeout promise that rejects after specified duration
 */
export function timeout<T>(
  promise: Promise<T>,
  ms: number,
  message?: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message || `Operation timed out after ${ms}ms`));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
