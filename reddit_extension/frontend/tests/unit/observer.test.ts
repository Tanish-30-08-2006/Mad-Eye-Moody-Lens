// @vitest-environment happy-dom
/**
 * tests/unit/observer.test.ts – Post observer (SYNTHETIC fixtures, happy-dom, fake IntersectionObserver).
 * Label: RUNTIME (DOM simulation, not a real browser).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPostObserver, DEBOUNCE_MS } from '../../src/adapters/reddit/observer';
import { PROCESSED_MARKER } from '../../src/adapters/reddit/selectors';
import { FakeIntersectionObserver, makeFeed, makePost } from '../helpers/synthetic-posts';

/** Lets MutationObserver microtasks run. */
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  FakeIntersectionObserver.reset();
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('createPostObserver', () => {
  it('scans existing posts immediately but only processes them once visible', () => {
    const post = makePost({ id: 't3_a', type: 'image' });
    document.body.appendChild(makeFeed([post]));
    const onPost = vi.fn();
    const obs = createPostObserver({ onPost });
    obs.start();

    expect(onPost).not.toHaveBeenCalled();
    FakeIntersectionObserver.latest.show(post);
    expect(onPost).toHaveBeenCalledTimes(1);
    expect(post.getAttribute(PROCESSED_MARKER)).toBe('1');
    obs.stop();
  });

  it('debounces added posts and processes each exactly once', async () => {
    const onPost = vi.fn();
    const obs = createPostObserver({ onPost });
    obs.start();
    const feed = makeFeed([]);
    document.body.appendChild(feed);
    const posts = [makePost({ id: 't3_1' }), makePost({ id: 't3_2' })];
    for (const p of posts) {
      const article = document.createElement('article');
      article.appendChild(p);
      feed.appendChild(article);
    }
    await settle();

    // Nothing is observed for visibility until the debounce elapses.
    expect(FakeIntersectionObserver.latest.observed.size).toBe(0);
    vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    expect(FakeIntersectionObserver.latest.observed.size).toBe(0);
    vi.advanceTimersByTime(1);
    expect(FakeIntersectionObserver.latest.observed.size).toBe(2);

    FakeIntersectionObserver.latest.show(...posts);
    FakeIntersectionObserver.latest.show(...posts); // duplicate notification
    expect(onPost).toHaveBeenCalledTimes(2);
    obs.stop();
  });

  it('ignores re-added posts that were already handled and non-post nodes', async () => {
    const post = makePost({ id: 't3_x' });
    const onPost = vi.fn();
    const obs = createPostObserver({ onPost });
    obs.start();
    document.body.appendChild(document.createElement('div'));
    document.body.appendChild(post);
    await settle();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    FakeIntersectionObserver.latest.show(post);
    // Moving the same node (still connected) must not re-process it.
    document.body.appendChild(post);
    await settle();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    FakeIntersectionObserver.latest.show(post);
    expect(onPost).toHaveBeenCalledTimes(1);
    obs.stop();
  });

  it('finds posts nested inside an added container', async () => {
    const obs = createPostObserver({ onPost: vi.fn() });
    obs.start();
    document.body.appendChild(makeFeed([makePost({ id: 't3_n1' }), makePost({ id: 't3_n2' })]));
    await settle();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(FakeIntersectionObserver.latest.observed.size).toBe(2);
    obs.stop();
  });

  it('stop() removes markers, runs disposers, disconnects and ignores later mutations', async () => {
    const post = makePost({ id: 't3_s' });
    document.body.appendChild(post);
    const dispose = vi.fn();
    const onPost = vi.fn(() => dispose);
    const obs = createPostObserver({ onPost });
    obs.start();
    FakeIntersectionObserver.latest.show(post);
    expect(post.hasAttribute(PROCESSED_MARKER)).toBe(true);

    obs.stop();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(post.hasAttribute(PROCESSED_MARKER)).toBe(false);
    expect(FakeIntersectionObserver.latest.disconnected).toBe(true);

    document.body.appendChild(makePost({ id: 't3_late' }));
    await settle();
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    expect(onPost).toHaveBeenCalledTimes(1);
  });

  it('start() and stop() are idempotent', () => {
    const obs = createPostObserver({ onPost: vi.fn() });
    obs.start();
    obs.start();
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    obs.stop();
    obs.stop();
    obs.start();
    expect(FakeIntersectionObserver.instances).toHaveLength(2);
    obs.stop();
  });

  it('disposes UI of posts Reddit removed from the DOM', async () => {
    const post = makePost({ id: 't3_gone' });
    document.body.appendChild(post);
    const dispose = vi.fn();
    const obs = createPostObserver({ onPost: () => dispose });
    obs.start();
    FakeIntersectionObserver.latest.show(post);
    post.remove();
    document.body.appendChild(makePost({ id: 't3_other' }));
    await settle();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(dispose).toHaveBeenCalledTimes(1);
    obs.stop();
  });

  it('handles 500 posts: one processing each, one disposer each, clean stop', async () => {
    const onPost = vi.fn();
    const disposers: ReturnType<typeof vi.fn>[] = [];
    const obs = createPostObserver({
      onPost: (p) => {
        onPost(p);
        const d = vi.fn();
        disposers.push(d);
        return d;
      },
    });
    obs.start();
    const posts = Array.from({ length: 500 }, (_, i) => makePost({ id: `t3_${i}`, type: 'image' }));
    document.body.appendChild(makeFeed(posts));
    await settle();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    const io = FakeIntersectionObserver.latest;
    expect(io.observed.size).toBe(500);

    io.show(...posts);
    io.show(...posts);
    expect(onPost).toHaveBeenCalledTimes(500);
    expect(obs.processedCount()).toBe(500);

    obs.stop();
    expect(disposers.every((d) => d.mock.calls.length === 1)).toBe(true);
    expect(document.querySelectorAll(`[${PROCESSED_MARKER}]`)).toHaveLength(0);
  });
});
