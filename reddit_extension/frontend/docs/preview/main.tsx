/**
 * docs/preview/main.tsx – Static UI self-check page: lens states, popover in every state, popup/options look.
 *
 * Built by scripts/build-preview.mjs into docs/ui-preview.html. It uses the real components and CSS; only chrome.* is faked.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import stylesCss from '../../src/ui/styles.css?inline';
import pagesCss from '../../src/entrypoints/pages.css?inline';
import { createLensButton, type LensState } from '../../src/ui/lens-button';
import { VerdictPopover, type PopoverView } from '../../src/ui/VerdictPopover';
import { App as Popup } from '../../src/entrypoints/popup/App';
import { App as Options } from '../../src/entrypoints/options/App';
import { App as History } from '../../src/entrypoints/scan-history/App';
import type { DetectionJob } from '../../src/core/schema';

// ── Fake chrome.* so the real pages render without an extension ──
const store: Record<string, unknown> = {
  moody_consent: { accepted: true, at: 1 },
  moody_history: [
    { postId: 't3_a', permalink: 'https://www.reddit.com/r/pics/comments/a/x/', kind: 'image', score: 0.91, label: 'likely_fake', mock: false, time: Date.now() - 6e4 },
    { postId: 't3_b', permalink: 'https://www.reddit.com/r/aww/comments/b/y/', kind: 'video', score: 0.12, label: 'likely_real', mock: false, time: Date.now() - 36e5 },
    { postId: 't3_c', permalink: 'https://www.reddit.com/r/art/comments/c/z/', kind: 'gallery', score: 0.52, label: 'inconclusive', mock: true, time: Date.now() - 864e5 },
  ],
};
const area = () => ({
  get: async (k?: string | string[]) => (typeof k === 'string' ? { [k]: store[k] } : Array.isArray(k) ? Object.fromEntries(k.map((x) => [x, store[x]])) : { ...store }),
  set: async (v: Record<string, unknown>) => void Object.assign(store, v),
  remove: async () => undefined,
  getKeys: async () => Object.keys(store),
});
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: { local: area(), sync: area(), session: area(), onChanged: { addListener() {} } },
  permissions: { contains: async () => true, request: async () => true },
  runtime: {
    id: 'preview',
    getManifest: () => ({ version: '0.1.0' }),
    getURL: (p: string) => p,
    openOptionsPage() {},
    sendMessage(m: { type: string }, cb: (r: unknown) => void) {
      if (m.type === 'CHECK_HEALTH') cb({ type: 'HEALTH', health: { status: 'ok', version: '1', models_available: [], mock: true } });
      else if (m.type === 'GET_BRAIN_STATUS') cb({ type: 'BRAIN_STATUS', brain: { name: 'stub', version: '1', is_mock: true, capabilities: { image: true, video: true, audio: true, explain: false } } });
      else cb({ type: 'OK' });
    },
  },
  tabs: {
    query: async () => [{ id: 1, url: 'https://www.reddit.com/r/pics/' }],
    sendMessage: async () => ({ type: 'PAGE_STATUS', postsSeen: 14, lensButtons: 6, visibleImages: 3 }),
    create() {},
  },
};

// ── Helpers ──
function shadow(parent: HTMLElement, css: string): ShadowRoot {
  const host = document.createElement('div');
  parent.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;
  root.appendChild(style);
  return root;
}

const base: DetectionJob = {
  job_id: 'j', status: 'completed', overall_score: 0.86, label: 'likely_fake', cache_key: 'a'.repeat(64),
  models: { image: { score: 0.9, label: 'fake', confidence: 0.8 }, face: { score: 0.78, label: 'fake', confidence: 0.7 }, audio: null },
  signals: [
    { kind: 'texture', text: 'Skin texture looks unusually smooth.', severity: 'medium' },
    { kind: 'lighting', text: 'Shadows disagree with the main light source.', severity: 'high' },
  ],
  timeline: Array.from({ length: 12 }, (_, i) => ({ start: i, end: i + 1, score: Math.min(1, 0.15 + (i % 5) * 0.18 + (i > 7 ? 0.2 : 0)) })),
  created_at: 'now', updated_at: 'now',
};
const th = { realBelow: 0.3, fakeAbove: 0.7 };
const ctx = { permalink: 'https://www.reddit.com/r/pics/comments/a/x/', sourceUrls: ['https://i.redd.it/a.jpg'], mediaKind: 'image' as const };
const meta = { hints: [{ kind: 'tool_name' as const, text: 'Metadata mentions "Midjourney".' }] };

const popoverViews: [string, PopoverView][] = [
  ['Loading', { kind: 'loading' }],
  ['Likely manipulated', { kind: 'result', job: base, meta, thresholds: th, context: ctx }],
  ['Likely authentic', { kind: 'result', job: { ...base, overall_score: 0.12, label: 'likely_real', timeline: null, signals: null }, thresholds: th, context: ctx }],
  ['Inconclusive', { kind: 'result', job: { ...base, overall_score: 0.5, label: 'inconclusive', timeline: null }, thresholds: th, context: ctx }],
  ['Demo data', { kind: 'result', job: { ...base, mock: true }, thresholds: th, context: ctx }],
  ['Error', { kind: 'error', message: "Couldn't reach the Moody Lens backend. Check that it is running.", code: 'NETWORK_ERROR' }],
  ['Consent', { kind: 'error', message: 'Consent is needed before anything is uploaded.', code: 'CONSENT_REQUIRED' }],
  ['Local only', { kind: 'local', hints: meta.hints }],
];

const lensStates: [string, LensState][] = [
  ['Idle', { kind: 'idle' }],
  ['Scanning', { kind: 'scanning' }],
  ['Likely manipulated', { kind: 'done', label: 'likely_fake', mock: false }],
  ['Likely authentic', { kind: 'done', label: 'likely_real', mock: false }],
  ['Inconclusive', { kind: 'done', label: 'inconclusive', mock: false }],
  ['Demo data', { kind: 'done', label: 'likely_fake', mock: true }],
  ['Error', { kind: 'error' }],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      <div className="grid">{children}</div>
    </section>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure>
      <div className="cell">{children}</div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

/** Mounts imperative DOM or a React tree inside a shadow root. */
function InShadow({ css, render, className }: { css: string; render: (mount: HTMLElement) => void; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!ref.current) return;
    const root = shadow(ref.current, css);
    const mount = document.createElement('div');
    if (className) mount.className = className;
    root.appendChild(mount);
    render(mount);
  }, []);
  return <div ref={ref} />;
}

const pagesPreviewCss = `${pagesCss}\n.save-bar{position:static!important}\n.page{min-height:0!important}`;
const popoverCss = `${stylesCss}\n.moody-lens-popover{position:static!important;animation:none!important;margin:0}`;

function App() {
  return (
    <>
      <h1>Moody Lens UI preview</h1>
      <p className="note">Real components and CSS; only chrome.* is faked. Follows your OS light/dark setting. Results are automated estimates, not proof.</p>

      <Section title="Lens button over media">
        {lensStates.map(([name, state]) => (
          <Cell key={name} label={name}>
            <div className="media">
              <InShadow
                css={stylesCss}
                render={(mount) => {
                  const lens = createLensButton({ postId: 't3_x', onActivate: () => {} });
                  lens.setState(state);
                  const host = document.createElement('moody-lens-button-host');
                  host.appendChild(lens.element);
                  mount.appendChild(host);
                }}
              />
            </div>
          </Cell>
        ))}
      </Section>

      <Section title="Popover">
        {popoverViews.map(([name, view]) => (
          <Cell key={name} label={name}>
            <InShadow css={popoverCss} render={(mount) => createRoot(mount).render(<VerdictPopover view={view} onClose={() => {}} onRetry={() => {}} onAcceptConsent={() => {}} onFeedback={async () => true} />)} />
          </Cell>
        ))}
      </Section>

      <Section title="Extension pages">
        <Cell label="Popup (340 px)">
          <InShadow css={pagesPreviewCss} className="popup" render={(mount) => { mount.style.width = '340px'; createRoot(mount).render(<Popup />); }} />
        </Cell>
        <Cell label="Options">
          <InShadow css={pagesPreviewCss} render={(mount) => { mount.style.width = '640px'; createRoot(mount).render(<Options />); }} />
        </Cell>
        <Cell label="History">
          <InShadow css={pagesPreviewCss} render={(mount) => { mount.style.width = '760px'; createRoot(mount).render(<History />); }} />
        </Cell>
      </Section>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
