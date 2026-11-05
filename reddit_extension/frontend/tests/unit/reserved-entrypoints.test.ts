import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const entrypointsDir = join(dirname(fileURLToPath(import.meta.url)), '../../src/entrypoints');
const reservedEntrypoints = new Set(['history', 'newtab', 'bookmarks']);

describe('entrypoint names', () => {
  it('does not use Chrome URL override entrypoint names', () => {
    const entrypointNames = readdirSync(entrypointsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(entrypointNames.filter((name) => reservedEntrypoints.has(name))).toEqual([]);
  });

  it('keeps scan history as a regular extension page', () => {
    expect(existsSync(join(entrypointsDir, 'scan-history', 'index.html'))).toBe(true);
  });
});
