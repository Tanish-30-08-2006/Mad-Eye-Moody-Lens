/**
 * tests/e2e/smoke.spec.ts – Optional Playwright smoke test: loads the BUILT extension into Chrome
 * and exercises it on a SYNTHETIC fake Reddit page (route-intercepted https://www.reddit.com).
 *
 * Flow: lens appears only on the media post -> click -> consent -> scan via the local mock
 * server -> verdict popover with DEMO DATA. Skipped when no Chrome that can load extensions is
 * available (set CHROME_PATH), or the extension has not been built.
 * Label: RUNTIME (real Chrome + real service worker; Reddit markup is synthetic, backend is the mock server).
 */

import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { server } from '../mock-server/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION = path.resolve(here, '../../.output/chrome-mv3');
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';

// 1x1 transparent PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const FAKE_PAGE = `<!doctype html><html><body>
<shreddit-feed>
  <article><shreddit-post id="t3_img" permalink="/r/test/comments/t3_img/synthetic/" post-type="image" content-href="https://i.redd.it/synthetic.png" post-title="Synthetic image post">
    <div slot="post-media-container"><img src="https://i.redd.it/synthetic.png" width="400" height="300"></div>
  </shreddit-post></article>
  <article><shreddit-post id="t3_txt" permalink="/r/test/comments/t3_txt/synthetic/" post-type="text" post-title="Synthetic text post">Just words.</shreddit-post></article>
</shreddit-feed></body></html>`;

// Lets context.route() also intercept the extension service worker's fetches (experimental in Playwright 1.52).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

let context: BrowserContext | undefined;
let profile: string | undefined;

test.beforeAll(async () => {
  if (!fs.existsSync(path.join(EXTENSION, 'manifest.json')) || !fs.existsSync(CHROME)) return;
  await new Promise<void>((resolve) => server.listen(8000, '127.0.0.1', resolve));
  try {
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-e2e-'));
    context = await chromium.launchPersistentContext(profile, {
      executablePath: CHROME,
      headless: false,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    await context.route('https://i.redd.it/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await context.route('https://www.reddit.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: FAKE_PAGE }));
  } catch {
    context = undefined; // Chrome cannot load extensions here: the test below skips.
  }
});

test.afterAll(async () => {
  await context?.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('ml-e2e-')) {
    fs.rmSync(profile, { recursive: true, force: true });
  }
  server.close();
});

test('lens on media posts only; click -> consent -> DEMO verdict popover', async () => {
  test.skip(!context, 'No Chrome able to load the built extension (build first, or set CHROME_PATH).');
  const page = await context!.newPage();
  await page.goto('https://www.reddit.com/r/test/');

  // Exactly one lens, on the image post; none on the text post.
  const lens = page.locator('moody-lens-button-host button.moody-lens-btn');
  await expect(lens).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('shreddit-post#t3_txt moody-lens-button-host')).toHaveCount(0);

  await lens.click();
  const popover = page.locator('moody-lens-popover-host');
  await popover.getByRole('button', { name: 'I agree' }).click();
  await expect(popover.getByText('DEMO DATA')).toBeVisible({ timeout: 20_000 });
  await expect(popover.getByText('Likely authentic', { exact: true }).first()).toBeVisible();

  // Esc closes the shared popover.
  await page.keyboard.press('Escape');
  await expect(popover.getByRole('dialog')).toHaveCount(0);
});

test('infinite scroll adds no duplicate lenses; SPA navigation resets without duplicates', async () => {
  test.skip(!context, 'No Chrome able to load the built extension (build first, or set CHROME_PATH).');
  const page = await context!.newPage();
  await page.goto('https://www.reddit.com/r/test/');
  const lens = page.locator('moody-lens-button-host');
  await expect(lens).toHaveCount(1, { timeout: 15_000 });

  // Simulate infinite scroll: Reddit appends more media posts to the feed.
  await page.evaluate(() => {
    const feed = document.querySelector('shreddit-feed')!;
    for (let i = 0; i < 20; i++) {
      const article = document.createElement('article');
      article.innerHTML = `<shreddit-post id="t3_more${i}" permalink="/r/test/comments/t3_more${i}/s/" post-type="image" content-href="https://i.redd.it/m${i}.png" post-title="more"><div slot="post-media-container" style="height:300px"><img src="https://i.redd.it/m${i}.png" width="400" height="300"></div></shreddit-post>`;
      feed.appendChild(article);
    }
  });
  await page.waitForTimeout(1500);
  const duplicates = await page.evaluate(() =>
    Array.from(document.querySelectorAll('shreddit-post')).filter((p) => p.querySelectorAll('moody-lens-button-host').length > 1).length,
  );
  expect(duplicates).toBe(0);
  // Only on-screen posts are processed, not all 21.
  expect(await lens.count()).toBeLessThan(21);

  // Client-side navigation: everything is torn down and rebuilt once, never doubled.
  await page.evaluate(() => history.pushState({}, '', '/r/other/'));
  await page.waitForTimeout(1500);
  const afterNav = await page.evaluate(() =>
    Array.from(document.querySelectorAll('shreddit-post')).filter((p) => p.querySelectorAll('moody-lens-button-host').length > 1).length,
  );
  expect(afterNav).toBe(0);
  await expect(page.locator('shreddit-post#t3_img moody-lens-button-host')).toHaveCount(1);
});

test('verification workflows use the built extension and continue when inference is unavailable', async () => {
  test.skip(!context, 'No Chrome able to load the built extension (build first, or set CHROME_PATH).');
  const browser = context!;
  const worker = browser.serviceWorkers()[0] ?? await browser.waitForEvent('serviceworker');
  const page = await browser.newPage({ viewport: { width: 430, height: 820 } });
  await page.goto(new URL('/options.html', worker.url()).href);
  await page.getByLabel('Participating subreddits').fill('test');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  const post = (id: string, kind: string, source: string) =>
    '<shreddit-post style="display:block;position:relative;min-height:110px" id="t3_' + id + '" permalink="/r/test/comments/' + id + '/" post-type="' + kind +
    '" post-title="Changed title">' + source + '</shreddit-post>';
  const verifyPage = '<!doctype html><meta name="viewport" content="width=device-width"><main>' +
    post('repost', 'crosspost', '<shreddit-post-share-button><button onclick="this.textContent=\'Share opened\'">Share</button></shreddit-post-share-button>') +
    post('first', 'image', '<img width="200" height="100" src="https://i.redd.it/first.png">') +
    post('second', 'image', '<img width="200" height="100" src="https://i.redd.it/second.png">') +
    post('gallery', 'gallery', '<gallery-carousel><img width="200" height="100" src="https://i.redd.it/skip.png"><img width="200" height="100" src="https://i.redd.it/checked.png"></gallery-carousel>') +
    '</main>';
  await browser.route('https://www.reddit.com/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/r/test/verification/') return route.fulfill({ contentType: 'text/html', body: verifyPage });
    if (pathname === '/submit') return route.fulfill({
      contentType: 'text/html', body: '<main><shreddit-composer><select name="sr"><option value="test">Test</option><option value="other">Other</option></select><button role="tab" aria-selected="true">Images &amp; Video</button><textarea aria-label="Reddit draft">Keep my draft</textarea><input aria-label="Reddit attachment" type="file"><button type="button" name="flair" aria-haspopup="dialog" onclick="this.textContent=\'Flair opened\'">Flair</button></shreddit-composer></main>',
    });
    if (pathname.includes('/about/rules.json')) {
      const rule = pathname.includes('/r/test/')
        ? { short_name: 'AI flair', description: 'AI art posts must use the AI Art flair.' }
        : { short_name: 'Image policy', description: 'AI-generated images are prohibited.' };
      return route.fulfill({ json: { rules: [rule] } });
    }
    if (pathname.includes('/api/link_flair_v2.json')) return route.fulfill({ json: [{ text: 'AI Art' }] });
    if (pathname.endsWith('.json')) {
      const permalink = pathname.replace(/\.json$/, '');
      const current: Record<string, unknown> = { permalink, title: 'Changed title' };
      if (pathname.includes('/repost/')) {
        current.crosspost_parent = 't3_original';
        current.crosspost_parent_list = [{ id: 'original', permalink: '/r/art/comments/original/', title: '[AI-generated] My picture', link_flair_text: 'AI Art' }];
      }
      return route.fulfill({ json: [{ data: { children: [{ data: current }] } }] });
    }
    return route.fulfill({ status: 404 });
  });
  await browser.route('https://i.redd.it/skip.png', (route) => route.fulfill({ status: 404 }));
  await browser.route('http://localhost:8000/api/v1/detect', (route) => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await browser.route('http://localhost:8000/api/v1/detect/batch', (route) => route.fulfill({ status: 202, json: { job_id: 'fixture-gallery' } }));
  await browser.route('http://localhost:8000/api/v1/jobs/fixture-gallery', (route) => route.fulfill({ json: {
    job_id: 'fixture-gallery', status: 'completed', mock: false, overall_score: 0.91, created_at: 'now', updated_at: 'now',
    items: [{ index: 0, status: 'completed', mock: false, overall_score: 0.91, models: { image: { score: 0.91, label: 'fake', confidence: 0.82 } } }],
  } }));

  await page.goto('https://www.reddit.com/r/test/verification/');
  await page.emulateMedia({ colorScheme: 'light' });
  const popover = page.locator('moody-lens-popover-host');
  const lens = (id: string) => page.locator('#t3_' + id + ' moody-lens-button-host button');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Share opened' })).toBeVisible();
  await page.locator('#t3_repost moody-lens-share-host button').click();
  const share = popover.getByRole('textbox', { name: 'Copy with context preview' });
  await expect(share).toHaveValue(/Reddit-linked original.*\n.*author’s title label: \[AI-generated\]/);
  const original = popover.getByRole('link', { name: 'Original post', exact: true });
  await expect(original).toHaveCSS('color', 'rgb(168, 50, 0)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(original).toHaveCSS('color', 'rgb(255, 106, 58)');
  await page.keyboard.press('Tab');
  await expect(popover.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await popover.getByRole('button', { name: 'Copy with context' }).click();
  await expect(popover.getByRole('status')).toContainText(/Copied|Clipboard unavailable/);
  await page.keyboard.press('Escape');

  await lens('first').click();
  await expect(popover.getByText('not ready', { exact: false })).toBeVisible();
  // The source worker proceeds even if the scan fails. Wait for the first image observation to be stored.
  await expect.poll(async () => worker.evaluate(async () => ((await chrome.storage.local.get('moodyLensImageObservations')).moodyLensImageObservations ?? []).length)).toBe(1);
  await page.keyboard.press('Escape');
  await lens('second').click();
  await expect(popover.getByRole('link', { name: 'Possible earlier match' })).toHaveAttribute('href', /\/comments\/first\/$/);
  await page.mouse.click(1, 1);
  await expect(popover.getByRole('dialog')).toHaveCount(0);

  await lens('gallery').click();
  await expect(popover.getByRole('button', { name: /Image 2: Likely manipulated/ })).toBeVisible();
  await popover.getByText('Prepare review note', { exact: true }).click();
  const review = popover.getByRole('textbox', { name: 'Copy review note preview' });
  await expect(review).toHaveValue(/Gallery item 2 .*flagged for possible manipulation/);
  await review.fill((await review.inputValue()) + ' Please compare the original context.');
  await popover.getByRole('button', { name: 'Copy review note' }).click();
  await expect(review).toHaveValue(/Reviewer notes: Please compare/);

  await page.goto('https://www.reddit.com/submit');
  const composer = page.locator('moody-lens-composer-host');
  await expect(composer.getByText('AI art posts must use', { exact: false })).toBeVisible();
  await composer.getByRole('button', { name: 'Open Reddit flair picker' }).click();
  await expect(page.getByRole('button', { name: 'Flair opened' })).toBeVisible();
  await page.getByRole('combobox').first().selectOption('other');
  await expect(composer.getByText('AI-generated images are prohibited', { exact: false })).toBeVisible();
  await page.getByLabel('Reddit attachment').setInputFiles({ name: 'draft.png', mimeType: 'image/png', buffer: PNG });
  await composer.getByText('Scan attachment', { exact: true }).click();
  await composer.getByRole('button', { name: 'Review upload' }).click();
  await composer.getByRole('button', { name: 'Upload and scan' }).click();
  await expect(composer.getByRole('status')).toContainText('not ready');
  await composer.getByText('Prepare your disclosure', { exact: true }).click();
  await composer.getByLabel('Disclosure wording').selectOption('AI-assisted editing');
  await composer.getByRole('button', { name: 'Confirm wording' }).click();
  await expect(composer.getByRole('textbox', { name: 'Copy disclosure preview' })).toHaveValue('AI-assisted editing');
  await expect(page.getByRole('textbox', { name: 'Reddit draft' })).toHaveValue('Keep my draft');
});
