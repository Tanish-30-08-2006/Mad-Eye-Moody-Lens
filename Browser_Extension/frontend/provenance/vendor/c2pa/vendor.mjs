// Build-time only. npm install --prefix TEMP --ignore-scripts @contentauth/c2pa-web@0.16.0 esbuild@0.25.12
// node vendor.mjs /absolute/TEMP (containing node_modules and downloaded official trust files).
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const scratch = resolve(process.argv[2]);
const destination = fileURLToPath(new URL('.', import.meta.url));
const modules = join(scratch, 'node_modules');
const web = join(modules, '@contentauth/c2pa-web');
const wasm = join(modules, '@contentauth/c2pa-wasm');
const { build } = await import(pathToFileURL(join(modules, 'esbuild/lib/main.js')));
if (JSON.parse(await readFile(join(web, 'package.json'), 'utf8')).version !== '0.16.0') throw new Error('Use the approved exact SDK pin.');
const original = await readFile(join(web, 'dist/c2pa-CqMzdYCb.js'), 'utf8');
const before = 'if (n.protocol !== "https:")';
const after = 'if (n.protocol !== "https:" && !(n.protocol === "chrome-extension:" && globalThis.location?.protocol === "chrome-extension:" && n.host === globalThis.location.host))';
if (original.split(before).length !== 2) throw new Error('Upstream changed: review worker patch.');
const patched = original.replace(before, after);
await writeFile(join(destination, 'builder.upstream.js'), original);
await writeFile(join(destination, 'builder.patched.js'), patched);
await writeFile(join(destination, 'worker-url.patch'), `--- builder.upstream.js\n+++ builder.patched.js\n@@ -31 +31 @@\n-  ${before}\n+  ${after}\n`);
await build({ absWorkingDir: scratch, entryPoints: ['node_modules/@contentauth/c2pa-web/dist/index.js'], bundle: true, format: 'esm', platform: 'browser', target: 'chrome120', outfile: join(destination, 'sdk.js'), plugins: [{ name: 'same-extension-worker', setup(b) { b.onLoad({ filter: /c2pa-CqMzdYCb\.js$/ }, () => ({ contents: patched, loader: 'js', resolveDir: join(web, 'dist') })); } }] });
const files = [
  [join(web, 'dist/c2pa_worker.js'), 'c2pa_worker.js'],
  [join(web, 'dist/resources/c2pa_bg.wasm'), 'c2pa_bg.wasm'],
  [join(wasm, 'pkg/c2pa.js'), 'wasm-bindings.js'],
  [join(web, 'LICENSE'), 'LICENSE'],
  [join(wasm, 'LICENSE'), 'LICENSE-wasm'],
  [join(modules, '@contentauth/c2pa-utilities/LICENSE'), 'LICENSE-utilities'],
  [join(scratch, 'C2PA-TRUST-LIST.pem'), 'C2PA-TRUST-LIST.pem'],
  [join(scratch, 'C2PA-TSA-TRUST-LIST.pem'), 'C2PA-TSA-TRUST-LIST.pem'],
  [join(scratch, 'trust-LICENSE'), 'LICENSE-trust-list'],
];
for (const [from, to] of files) await copyFile(from, join(destination, to));
// The npm package declares ISC and its author but omits a license file, like highgain.
const deepmerge = JSON.parse(await readFile(join(modules, 'ts-deepmerge/package.json'), 'utf8'));
if (deepmerge.version !== '8.0.0' || deepmerge.license !== 'ISC' || !deepmerge.author.startsWith('Raice Hannay')) throw new Error('Review transitive license attribution.');
await writeFile(join(destination, 'LICENSE-deepmerge'), (await readFile(join(destination, 'LICENSE-highgain'), 'utf8')).replace('Eli Mensch', 'Raice Hannay'));
const hashes = {};
for (const name of ['builder.upstream.js', 'builder.patched.js', 'worker-url.patch', 'sdk.js', 'LICENSE-deepmerge', ...files.map(f => f[1])]) hashes[name] = createHash('sha256').update(await readFile(join(destination, name))).digest('hex');
await writeFile(join(destination, 'SHA256SUMS.json'), JSON.stringify(hashes, null, 2) + '\n');
console.log(JSON.stringify(hashes, null, 2));
