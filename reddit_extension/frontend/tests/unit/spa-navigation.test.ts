// @vitest-environment happy-dom
/**
 * tests/unit/spa-navigation.test.ts – SPA navigation watcher (fake Navigation API, no history patching).
 * Label: RUNTIME (DOM simulation).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { watchNavigation } from '../../src/adapters/reddit/spa-navigation';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('watchNavigation', () => {
  it('fires once per URL change after navigatesuccess, debounced', () => {
    const nav = new EventTarget();
    let href = 'https://www.reddit.com/';
    const cb = vi.fn();
    const stop = watchNavigation(cb, { navigation: nav, getHref: () => href });

    href = 'https://www.reddit.com/r/a/';
    nav.dispatchEvent(new Event('navigatesuccess'));
    nav.dispatchEvent(new Event('navigatesuccess'));
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('https://www.reddit.com/r/a/');
    stop();
  });

  it('ignores events when the URL did not change', () => {
    const nav = new EventTarget();
    const cb = vi.fn();
    const stop = watchNavigation(cb, { navigation: nav, getHref: () => 'https://www.reddit.com/' });
    nav.dispatchEvent(new Event('navigatesuccess'));
    vi.advanceTimersByTime(500);
    expect(cb).not.toHaveBeenCalled();
    stop();
  });

  it('falls back to polling location.href without the Navigation API', () => {
    let href = 'https://www.reddit.com/';
    const cb = vi.fn();
    const stop = watchNavigation(cb, { navigation: null, getHref: () => href });
    href = 'https://www.reddit.com/r/b/';
    vi.advanceTimersByTime(1300);
    expect(cb).toHaveBeenCalledTimes(1);
    stop();
  });

  it('cleanup removes listeners and timers', () => {
    const nav = new EventTarget();
    let href = 'https://www.reddit.com/';
    const cb = vi.fn();
    const stop = watchNavigation(cb, { navigation: nav, getHref: () => href });
    stop();
    href = 'https://www.reddit.com/r/c/';
    nav.dispatchEvent(new Event('navigatesuccess'));
    vi.advanceTimersByTime(5000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('does not patch history', () => {
    const push = history.pushState;
    const stop = watchNavigation(vi.fn(), { navigation: null, getHref: () => 'x' });
    expect(history.pushState).toBe(push);
    stop();
  });
});
