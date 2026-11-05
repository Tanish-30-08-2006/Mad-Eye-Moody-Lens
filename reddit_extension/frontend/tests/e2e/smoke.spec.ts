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

test.beforeAll(async () => {
  if (!fs.existsSync(path.join(EXTENSION, 'manifest.json')) || !fs.existsSync(CHROME)) return;
  await new Promise<void>((resolve) => server.listen(8000, '127.0.0.1', resolve));
  try {
    context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'ml-e2e-')), {
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
