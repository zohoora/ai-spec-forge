// Concurrency limiting utilities per spec FR-23

export interface ConcurrencyLimiterOptions {
  limit: number;
  onStart?: (taskId: string) => void;
  onComplete?: (taskId: string, error?: Error) => void;
}

interface QueuedTask<T> {
  id: string;
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/**
 * Concurrency limiter for parallel operations
 * Used for consultant calls per spec FR-23 (default limit: 5)
 */
export class ConcurrencyLimiter {
  private limit: number;
  private running: number = 0;
  private queue: QueuedTask<unknown>[] = [];
  private onStart?: (taskId: string) => void;
  private onComplete?: (taskId: string, error?: Error) => void;

  constructor(options: ConcurrencyLimiterOptions) {
    this.limit = options.limit;
    this.onStart = options.onStart;
    this.onComplete = options.onComplete;
  }

  /**
   * Execute a task, respecting the concurrency limit
   */
  async execute<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        id,
        fn,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.processQueue();
    });
  }

  /**
   * Execute multiple tasks in parallel, respecting the concurrency limit
   */
  async executeAll<T>(
    tasks: Array<{ id: string; fn: () => Promise<T> }>
  ): Promise<Array<{ id: string; result?: T; error?: Error }>> {
    const results = await Promise.all(
      tasks.map(async (task) => {
        try {
          const result = await this.execute(task.id, task.fn);
          return { id: task.id, result };
        } catch (error) {
          return {
            id: task.id,
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }
      })
    );
    return results;
  }

  private processQueue(): void {
    while (this.running < this.limit && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.runTask(task);
    }
  }

  private async runTask<T>(task: QueuedTask<T>): Promise<void> {
    this.running++;
    this.onStart?.(task.id);

    try {
      const result = await task.fn();
      task.resolve(result);
      this.onComplete?.(task.id);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      task.reject(err);
      this.onComplete?.(task.id, err);
    } finally {
      this.running--;
      this.processQueue();
    }
  }

  /**
   * Get current number of running tasks
   */
  get runningCount(): number {
    return this.running;
  }

  /**
   * Get current queue length
   */
  get queueLength(): number {
    return this.queue.length;
  }

  /**
   * Clear the queue (running tasks will complete)
   */
  clearQueue(): void {
    const cleared = this.queue.splice(0);
    for (const task of cleared) {
      task.reject(new Error('Queue cleared'));
    }
  }
}

/**
 * Create a default concurrency limiter for consultant calls
 */
export function createConsultantLimiter(
  onStart?: (modelId: string) => void,
  onComplete?: (modelId: string, error?: Error) => void
): ConcurrencyLimiter {
  return new ConcurrencyLimiter({
    limit: 5, // Default per spec FR-23
    onStart,
    onComplete,
  });
}

/**
 * Run tasks with a concurrency limit (simpler API)
 */
export async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const executing: Promise<void>[] = [];

  async function runNext(): Promise<void> {
    const currentIndex = index++;
    if (currentIndex >= items.length) return;

    results[currentIndex] = await fn(items[currentIndex], currentIndex);
    await runNext();
  }

  // Start up to `limit` concurrent executions
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    executing.push(runNext());
  }

  await Promise.all(executing);
  return results;
}

/**
 * Run tasks in parallel with individual error handling
 */
export async function runParallelWithErrors<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<Array<{ success: true; result: R } | { success: false; error: Error }>> {
  const results: Array<{ success: true; result: R } | { success: false; error: Error }> =
    new Array(items.length);
  let index = 0;
  const executing: Promise<void>[] = [];

  async function runNext(): Promise<void> {
    const currentIndex = index++;
    if (currentIndex >= items.length) return;

    try {
      const result = await fn(items[currentIndex], currentIndex);
      results[currentIndex] = { success: true, result };
    } catch (error) {
      results[currentIndex] = {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
    await runNext();
  }

  for (let i = 0; i < Math.min(limit, items.length); i++) {
    executing.push(runNext());
  }

  await Promise.all(executing);
  return results;
}
