/**
 * background/scan-queue.ts – Concurrency limit, in-flight dedupe and auto-scan rate cap.
 *
 * The service worker funnels every scan (lens click, auto-scan, context menu) through here.
 */

/** Max scans running at once. */
export const MAX_CONCURRENT_SCANS = 2;
/** Max automatic scans started per minute. */
export const AUTO_SCANS_PER_MINUTE = 10;

export class ScanQueue {
  private running = 0;
  private waiting: Array<() => void> = [];
  private inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly maxConcurrent: number = MAX_CONCURRENT_SCANS) {}

  /** Number of tasks currently executing. */
  get active(): number {
    return this.running;
  }

  /** Number of tasks waiting for a slot. */
  get queued(): number {
    return this.waiting.length;
  }

  /**
   * Runs `task` when a slot is free. Concurrent calls with the same `key` share one run
   * and one result, so a double click or a re-render never uploads the same media twice.
   */
  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = this.acquire()
      .then(task)
      .finally(() => {
        this.release();
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, promise);
    return promise;
  }

  private acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    const next = this.waiting.shift();
    // Hand the slot straight to the next waiter; otherwise free it.
    if (next) next();
    else this.running--;
  }
}

/** Sliding one-minute window for automatic scans. */
export class AutoScanLimiter {
  private starts: number[] = [];

  constructor(
    private readonly perMinute: number = AUTO_SCANS_PER_MINUTE,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a start and returns true if under the cap; false (and no record) if over. */
  tryAcquire(): boolean {
    const t = this.now();
    this.starts = this.starts.filter((s) => t - s < 60_000);
    if (this.starts.length >= this.perMinute) return false;
    this.starts.push(t);
    return true;
  }
}

export const scanQueue = new ScanQueue();
export const autoScanLimiter = new AutoScanLimiter();
