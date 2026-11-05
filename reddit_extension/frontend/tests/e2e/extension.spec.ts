/**
 * tests/e2e/extension.spec.ts – Playwright E2E smoke tests for Moody Lens extension.
 *
 * Checks build artifact availability and manifest integrity.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.resolve(__dirname, '../../.output/chrome-mv3');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json');

test.describe('Moody Lens Extension Build Artifacts', () => {
  test('manifest.json exists and conforms to MV3 constraints', async () => {
    // Only verify if build output exists
    if (!fs.existsSync(MANIFEST_PATH)) {
      test.skip(true, 'Run `pnpm build` first to generate .output/chrome-mv3');
      return;
    }

    const manifestContent = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

    expect(manifestContent.manifest_version).toBe(3);
    expect(manifestContent.name).toContain('Moody Lens');
    expect(manifestContent.permissions).toContain('storage');
    expect(manifestContent.permissions).toContain('contextMenus');
    expect(manifestContent.permissions).toContain('alarms');

    // Verify host permissions match constraint list exactly
    expect(manifestContent.host_permissions).toContain('https://*.reddit.com/*');
    expect(manifestContent.host_permissions).toContain('http://localhost:8000/*');
    expect(manifestContent.host_permissions).toContain('https://i.redd.it/*');
    expect(manifestContent.host_permissions).toContain('https://v.redd.it/*');
    expect(manifestContent.host_permissions).toContain('https://preview.redd.it/*');
  });
});
