/**
 * Per-file async mutex using promise chains.
 * Ensures that concurrent writes to the same file are serialized.
 */
export class WriteQueue {
  private queues = new Map<string, Promise<void>>();

  async enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
    // Get the current tail of the queue for this key
    const currentTail = this.queues.get(key) ?? Promise.resolve();

    // Chain our operation after the current tail
    let result: T;
    const newTail = currentTail
      .then(async () => {
        result = await operation();
      })
      .catch(() => {
        // Previous operation failed, but we still run ours
        return operation().then((r) => {
          result = r;
        });
      });

    // Store the new tail (without error propagation to avoid breaking the chain)
    this.queues.set(key, newTail.catch(() => {}));

    // Wait for our operation to complete
    await newTail;
    return result!;
  }

  clear(): void {
    this.queues.clear();
  }
}

let instance: WriteQueue | null = null;

export function getWriteQueue(): WriteQueue {
  if (!instance) {
    instance = new WriteQueue();
  }
  return instance;
}
