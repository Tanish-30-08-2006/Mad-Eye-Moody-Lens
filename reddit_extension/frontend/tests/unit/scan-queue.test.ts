/**
 * tests/unit/scan-queue.test.ts – Queue concurrency, in-flight dedupe, auto-scan rate cap. Label: RUNTIME (fake timers/promises).
 */
import { describe, it, expect } from 'vitest';
import { AutoScanLimiter, ScanQueue } from '../../src/background/scan-queue';

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('ScanQueue', () => {
  it('runs at most 2 tasks at once and starts the next as slots free up', async () => {
    const q = new ScanQueue(2);
    const gates = [deferred(), deferred(), deferred(), deferred()];
    let running = 0;
    let peak = 0;
    const started: number[] = [];
    const results = gates.map((g, i) =>
      q.run(`k${i}`, async () => {
        running++;
        peak = Math.max(peak, running);
        started.push(i);
        await g.promise;
        running--;
        return i;
      }),
    );
    await tick();
    expect(started).toEqual([0, 1]);
    expect(q.active).toBe(2);
    expect(q.queued).toBe(2);

    gates[0]!.resolve();
    await tick();
    expect(started).toEqual([0, 1, 2]);
    gates[1]!.resolve();
    gates[2]!.resolve();
    await tick();
    gates[3]!.resolve();
    expect(await Promise.all(results)).toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
    expect(q.active).toBe(0);
  });

  it('dedupes concurrent calls with the same key into one run', async () => {
    const q = new ScanQueue(2);
    const gate = deferred<string>();
    let runs = 0;
    const task = async () => {
      runs++;
      return gate.promise;
    };
    const a = q.run('same', task);
    const b = q.run('same', task);
    gate.resolve('verdict');
    expect(await a).toBe('verdict');
    expect(await b).toBe('verdict');
    expect(runs).toBe(1);
  });

  it('allows a fresh run once the key finished, and frees the slot after a failure', async () => {
    const q = new ScanQueue(1);
    await expect(q.run('k', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(q.active).toBe(0);
    expect(await q.run('k', async () => 'again')).toBe('again');
  });
});

describe('AutoScanLimiter', () => {
  it('allows N per rolling minute, then refuses, then recovers', () => {
    let now = 0;
    const limiter = new AutoScanLimiter(3, () => now);
    expect([limiter.tryAcquire(), limiter.tryAcquire(), limiter.tryAcquire()]).toEqual([true, true, true]);
    expect(limiter.tryAcquire()).toBe(false);
    now = 59_000;
    expect(limiter.tryAcquire()).toBe(false);
    now = 60_001;
    expect(limiter.tryAcquire()).toBe(true);
  });
});
