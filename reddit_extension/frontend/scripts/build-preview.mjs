/**
 * scripts/build-preview.mjs – Builds docs/ui-preview.html (one self-contained file) with vite, then optionally screenshots it.
 *
 * Run: node scripts/build-preview.mjs [--shots]   (screenshots need Chrome at CHROME_PATH or /usr/bin/google-chrome)
 */

import { build } from 'vite';
import { readFileSync, writeFileSync, rmSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(root, '.preview-build');

await build({
  root: join(root, 'docs/preview'),
  logLevel: 'warn',
  esbuild: { jsx: 'transform' },
  build: { outDir: tmp, emptyOutDir: true, minify: true, assetsInlineLimit: 1e9, cssCodeSplit: false },
});

const assets = join(tmp, 'assets');
const js = readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const html = readFileSync(join(root, 'docs/preview/index.html'), 'utf8').replace(/<script type="module" src="\.\/main\.tsx"><\/script>/, '');
// A </script> inside the bundle would end the tag early.
const safe = js.replace(/<\/script/gi, '<\\/script');
writeFileSync(join(root, 'docs/ui-preview.html'), html.replace('</body>', () => `<script type="module">${safe}</script>\n</body>`));
rmSync(tmp, { recursive: true, force: true });
console.log('docs/ui-preview.html written');

if (process.argv.includes('--shots')) {
  const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome';
  if (!existsSync(chrome)) {
    console.log('No Chrome found: skipped screenshots');
  } else {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox'] });
    mkdirSync(join(root, 'docs/screens'), { recursive: true });
    for (const scheme of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, colorScheme: scheme });
      await page.goto(`file://${join(root, 'docs/ui-preview.html')}`);
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(root, `docs/screens/ui-preview-${scheme}.png`), fullPage: true });
      await page.close();
    }
    await browser.close();
    console.log('screenshots written to docs/screens');
  }
}
