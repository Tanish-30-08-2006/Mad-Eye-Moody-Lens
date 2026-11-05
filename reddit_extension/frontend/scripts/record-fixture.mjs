#!/usr/bin/env node
/**
 * scripts/record-fixture.mjs – CLI utility to record and save Reddit DOM fixtures.
 *
 * Usage:
 *   node scripts/record-fixture.mjs --name image-post --html "<shreddit-post ...>...</shreddit-post>"
 *   node scripts/record-fixture.mjs --name image-post --file /path/to/raw.html
 *   node scripts/record-fixture.mjs --from-clipboard --name video-post
 *
 * Saves output to:
 *   tests/fixtures/reddit/<name>.html
 *   tests/fixtures/reddit/<name>.meta.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../tests/fixtures/reddit');

function printUsage() {
  console.log(`
Moody Lens Fixture Recorder (Phase 0)

Usage:
  node scripts/record-fixture.mjs [options]

Options:
  --name <fixture-name>   Required: Name for the fixture (e.g. image-basic, video-with-audio)
  --html "<html>"         Raw HTML string of the <shreddit-post> or <shreddit-feed> element
  --file <path>           Path to text/html file containing element outerHTML
  --post-type <type>      Post type (image, gallery, video, gif, text, link, crosspost)
  --help                  Show this help message

Output:
  Writes fixture to tests/fixtures/reddit/<name>.html
  Writes metadata to tests/fixtures/reddit/<name>.meta.json
`);
}

function parseArgs(args) {
  const parsed = {
    name: '',
    html: '',
    file: '',
    postType: 'unknown',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--name' && args[i + 1]) {
      parsed.name = args[++i];
    } else if (arg === '--html' && args[i + 1]) {
      parsed.html = args[++i];
    } else if (arg === '--file' && args[i + 1]) {
      parsed.file = args[++i];
    } else if (arg === '--post-type' && args[i + 1]) {
      parsed.postType = args[++i];
    }
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.name) {
    console.error('Error: --name <fixture-name> is required.');
    printUsage();
    process.exit(1);
  }

  let htmlContent = args.html;
  if (!htmlContent && args.file) {
    const resolvedPath = path.resolve(process.cwd(), args.file);
    if (!fs.existsSync(resolvedPath)) {
      console.error(`Error: File not found at ${resolvedPath}`);
      process.exit(1);
    }
    htmlContent = fs.readFileSync(resolvedPath, 'utf8');
  }

  if (!htmlContent) {
    console.warn(
      'Notice: No --html or --file provided. Generating empty fixture template for manual capture.',
    );
    htmlContent = `<!-- Placeholder fixture: ${args.name} -->\n<shreddit-post id="t3_${args.name}" post-type="${args.postType}">\n  <!-- TODO: Paste outerHTML from DevTools -->\n</shreddit-post>\n`;
  }

  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  const htmlPath = path.join(FIXTURES_DIR, `${args.name}.html`);
  const metaPath = path.join(FIXTURES_DIR, `${args.name}.meta.json`);

  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  const metadata = {
    name: args.name,
    postType: args.postType,
    recordedAt: new Date().toISOString(),
    generator: 'record-fixture.mjs',
    verified: false,
    notes: 'Recorded for Phase 0 DOM reconstruction & Phase 4 adapter testing.',
  };

  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');

  console.log(`[SUCCESS] Fixture recorded:`);
  console.log(`  HTML: ${htmlPath}`);
  console.log(`  Meta: ${metaPath}`);
}

main().catch((err) => {
  console.error('Fatal error recording fixture:', err);
  process.exit(1);
});
