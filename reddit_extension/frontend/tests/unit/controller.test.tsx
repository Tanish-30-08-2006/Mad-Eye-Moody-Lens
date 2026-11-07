// @vitest-environment happy-dom
/**
 * tests/unit/controller.test.tsx – Content controller end to end (SYNTHETIC posts, real adapter,
 * real popover, fake service worker). Covers: buttons only on media posts, click -> spinner ->
 * verdict, error + retry, consent accept, no duplicates, navigation cleanup, auto-scan.
 * Label: RUNTIME (DOM simulation, not real Chrome/Reddit).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createController, type Controller, type MountedLens } from '../../src/content/controller';
import { redditAdapter } from '../../src/adapters/reddit';
import { createLensButton } from '../../src/ui/lens-button';
import { createPopoverHost, type PopoverApi } from '../../src/ui/popover-host';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '../../src/core/settings';
import type { ExtensionMessage, ExtensionResponse } from '../../src/core/messaging';
import type { DetectionJob } from '../../src/core/schema';
import { FakeIntersectionObserver, makeFeed, makePost } from '../helpers/synthetic-posts';
import { act } from '../helpers/react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const job = (over: Partial<DetectionJob> = {}): DetectionJob => ({
  job_id: 'j1',
  status: 'completed',
  overall_score: 0.9,
  label: 'likely_fake',
  models: { image: { score: 0.9, label: 'fake', confidence: 0.8 }, face: null, audio: null },
  created_at: 'now',
  updated_at: 'now',
  ...over,
});

let controller: Controller;
let popover: PopoverApi;
let popoverContainer: HTMLElement;
let sent: ExtensionMessage[];
let respond: (m: ExtensionMessage) => Promise<ExtensionResponse>;
let settings: ExtensionSettings;
let removed: number;

const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
};

async function boot(posts: HTMLElement[]) {
  document.body.appendChild(makeFeed(posts));
  controller.start();
  await flush();
  FakeIntersectionObserver.latest.show(...posts);
  await flush();
}

const lensOf = (post: HTMLElement) => post.querySelector<HTMLButtonElement>('button.moody-lens-btn');

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL('https://www.reddit.com/');
  (window as unknown as { navigation: EventTarget }).navigation = new EventTarget();
  FakeIntersectionObserver.reset();
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

  sent = [];
  removed = 0;
  settings = { ...DEFAULT_SETTINGS };
  respond = async () => ({ type: 'JOB_STATUS', status: 'completed', result: job() });

  popoverContainer = document.createElement('div');
  document.body.appendChild(popoverContainer);
  popover = createPopoverHost(popoverContainer);

  controller = createController({
    adapter: redditAdapter,
    popover,
    getSettings: () => settings,
    send: async (m) => {
      sent.push(m);
      return respond(m);
    },
    // Stand-in for the WXT shadow-root mount: same lens button, plain element host.
    mountLens: async ({ anchor, postId, onActivate }): Promise<MountedLens> => {
      const button = createLensButton({ postId, onActivate });
      anchor.appendChild(button.element);
      return { button, remove: () => { button.element.remove(); removed++; } };
    },
  });
});

afterEach(async () => {
  await act(async () => {
    controller.stop();
    popover.destroy();
  });
  delete (window as unknown as { navigation?: EventTarget }).navigation;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('content controller', () => {
  it('adds a lens to media posts only, never to text or link posts, and never twice', async () => {
    const image = makePost({ id: 't3_img', type: 'image', contentHref: 'https://i.redd.it/a.jpg' });
    const gallery = makePost({ id: 't3_gal', type: 'gallery', inner: '<img src="https://preview.redd.it/1.jpg">' });
    const video = makePost({ id: 't3_vid', type: 'video', inner: '<video src="https://v.redd.it/x/DASH_480.mp4"></video>' });
    const text = makePost({ id: 't3_txt', type: 'text' });
    const link = makePost({ id: 't3_lnk', type: 'link', contentHref: 'https://example.com/story' });
    await boot([image, gallery, video, text, link]);
    FakeIntersectionObserver.latest.show(image, gallery, video, text, link); // duplicate notifications
    await flush();

    expect([image, gallery, video].map((p) => p.querySelectorAll('button.moody-lens-btn').length)).toEqual([1, 1, 1]);
    expect(lensOf(text)).toBeNull();
    expect(lensOf(link)).toBeNull();
    expect(controller.stats().lensButtons).toBe(3);
  });

  it('click -> spinner -> verdict popover, and a re-click re-opens without rescanning', async () => {
    const post = makePost({ id: 't3_img', type: 'image', contentHref: 'https://i.redd.it/a.jpg' });
    let finish!: (r: ExtensionResponse) => void;
    respond = () => new Promise((resolve) => (finish = resolve));
    await boot([post]);

    await act(async () => lensOf(post)!.click());
    expect(popoverContainer.querySelector('.moody-lens-spinner')).not.toBeNull();
    expect(lensOf(post)!.dataset.state).toBe('scanning');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: 'SCAN_MEDIA',
      payload: { mediaUrls: ['https://i.redd.it/a.jpg'], postId: 't3_img', mediaType: 'image', origin: 'manual' },
    });

    await act(async () => finish({ type: 'JOB_STATUS', status: 'completed', result: job() }));
    expect(popoverContainer.textContent).toContain('Likely manipulated');
    expect(lensOf(post)!.dataset.verdict).toBe('likely_fake');

    await act(async () => popover.hide());
    await act(async () => lensOf(post)!.click());
    expect(popoverContainer.textContent).toContain('Likely manipulated');
    expect(sent).toHaveLength(1);
  });

  it('shows DEMO on the chip and the popover for mock verdicts', async () => {
    respond = async () => ({ type: 'JOB_STATUS', status: 'completed', result: job({ mock: true }) });
    const post = makePost({ id: 't3_m', type: 'image', contentHref: 'https://i.redd.it/m.jpg' });
    await boot([post]);
    await act(async () => lensOf(post)!.click());
    expect(lensOf(post)!.textContent).toContain('DEMO');
    expect(popoverContainer.textContent).toContain('DEMO DATA');
  });

  it('shows an error and retries on request', async () => {
    let calls = 0;
    respond = async () => (++calls === 1
      ? { type: 'ERROR', error: 'Backend down', code: 'NETWORK_ERROR' }
      : { type: 'JOB_STATUS', status: 'completed', result: job() });
    const post = makePost({ id: 't3_e', type: 'image', contentHref: 'https://i.redd.it/e.jpg' });
    await boot([post]);
    await act(async () => lensOf(post)!.click());
    expect(popoverContainer.textContent).toContain('Backend down');
    expect(lensOf(post)!.dataset.state).toBe('error');

    const retry = Array.from(popoverContainer.querySelectorAll('button')).find((b) => b.textContent === 'Retry')!;
    await act(async () => retry.click());
    expect(popoverContainer.textContent).toContain('Likely manipulated');
    expect(calls).toBe(2);
  });

  it('asks for consent, saves it, then rescans', async () => {
    let consented = false;
    respond = async (m) => {
      if (m.type === 'SET_CONSENT') { consented = true; return { type: 'CONSENT', accepted: true }; }
      return consented
        ? { type: 'JOB_STATUS', status: 'completed', result: job() }
        : { type: 'ERROR', error: 'Needs permission', code: 'CONSENT_REQUIRED' };
    };
    const post = makePost({ id: 't3_c', type: 'image', contentHref: 'https://i.redd.it/c.jpg' });
    await boot([post]);
    await act(async () => lensOf(post)!.click());
    const agree = Array.from(popoverContainer.querySelectorAll('button')).find((b) => b.textContent === 'I agree')!;
    await act(async () => { agree.click(); await vi.advanceTimersByTimeAsync(10); });
    expect(sent.map((m) => m.type)).toEqual(['SCAN_MEDIA', 'SET_CONSENT', 'SCAN_MEDIA']);
    expect(popoverContainer.textContent).toContain('Likely manipulated');
  });

  it('video scans send all candidate renditions plus the audio URL', async () => {
    const post = makePost({
      id: 't3_v',
      type: 'video',
      inner: '<video src="https://v.redd.it/v/DASH_720.mp4"></video><shreddit-player src="https://v.redd.it/v/DASH_audio.mp4"></shreddit-player>',
    });
    await boot([post]);
    await act(async () => lensOf(post)!.click());
    expect(sent[0]).toMatchObject({ payload: { mediaType: 'video', audioUrl: 'https://v.redd.it/v/DASH_audio.mp4' } });
  });

  it('a media post with nothing in the DOM asks the worker to resolve it from the post JSON', async () => {
    const post = makePost({ id: 't3_empty', type: 'image' });
    await boot([post]);
    await act(async () => lensOf(post)!.click());
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'SCAN_MEDIA', payload: { postId: 't3_empty', mediaUrls: [], resolve: true } });
  });

  it('SPA navigation closes the popover and removes every lens', async () => {
    const post = makePost({ id: 't3_n', type: 'image', contentHref: 'https://i.redd.it/n.jpg' });
    await boot([post]);
    await act(async () => lensOf(post)!.click());
    expect(popover.isOpen()).toBe(true);

    (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL('https://www.reddit.com/r/next/');
    await act(async () => {
      (window as unknown as { navigation: EventTarget }).navigation.dispatchEvent(new Event('navigatesuccess'));
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(popover.isOpen()).toBe(false);
    expect(document.querySelectorAll('button.moody-lens-btn')).toHaveLength(0);
    expect(removed).toBe(1);
    expect(controller.stats().lensButtons).toBe(0);
  });

  it('stop() removes lenses and markers', async () => {
    const post = makePost({ id: 't3_s', type: 'image', contentHref: 'https://i.redd.it/s.jpg' });
    await boot([post]);
    await act(async () => controller.stop());
    expect(document.querySelectorAll('button.moody-lens-btn')).toHaveLength(0);
    expect(post.hasAttribute('data-moody-lens')).toBe(false);
  });

  it('auto-scan is off by default and, when on, scans images only (never video)', async () => {
    const image = makePost({ id: 't3_ai', type: 'image', contentHref: 'https://i.redd.it/ai.jpg' });
    const video = makePost({ id: 't3_av', type: 'video', inner: '<video src="https://v.redd.it/a/DASH_360.mp4"></video>' });
    await boot([image, video]);
    expect(sent).toHaveLength(0);
    await act(async () => controller.stop());
    document.body.innerHTML = '';

    settings = { ...settings, enableAutoScan: true };
    const image2 = makePost({ id: 't3_ai2', type: 'image', contentHref: 'https://i.redd.it/ai2.jpg' });
    const video2 = makePost({ id: 't3_av2', type: 'video', inner: '<video src="https://v.redd.it/a2/DASH_360.mp4"></video>' });
    await boot([image2, video2]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ payload: { postId: 't3_ai2', origin: 'auto' } });
    // Auto result lights the chip but does not open the popover.
    expect(popover.isOpen()).toBe(false);
    expect(lensOf(image2)!.dataset.verdict).toBe('likely_fake');
  });

  it('showExternal renders context-menu results with no anchor', async () => {
    await act(async () => controller.showExternal({ state: 'result', job: job() }));
    expect(popoverContainer.textContent).toContain('Likely manipulated');
    await act(async () => controller.showExternal({ state: 'loading' }));
    expect(popoverContainer.querySelector('.moody-lens-spinner')).not.toBeNull();
  });
});
