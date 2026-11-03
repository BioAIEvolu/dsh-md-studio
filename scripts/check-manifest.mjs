// Pre-publish guard (issue #4): the DSH harness reads bundle manifests with
// `JSON.parse`, which — unlike Node's own ESM loader — does NOT skip a leading
// UTF-8 BOM. A single stray `EF BB BF` at the start of package.json therefore
// makes every `dsh plugin add/update` fail and the profile roll back. This
// script runs on `prepack` (i.e. before `pnpm pack` / `npm publish`) and in CI
// so a BOM or a version drift can never ship again.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
let failed = false;
const fail = (msg) => { console.error(`[check-manifest] ${msg}`); failed = true; };

// 1. No leading UTF-8 BOM.
const pkgPath = resolve(root, 'package.json');
const bytes = readFileSync(pkgPath);
if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
  fail('package.json starts with a UTF-8 BOM (EF BB BF). Re-save it without BOM; DSH rejects it.');
}

// 2. Valid JSON (the exact parse path DSH uses).
let pkg;
try { pkg = JSON.parse(bytes.toString('utf8')); }
catch (e) { fail(`package.json is not valid JSON: ${e.message}`); }

// 3. The shipped version must stay in sync across sources, so a rebuilt bundle
//    can never report a stale version.
const version = pkg?.version;
if (version) {
  const client = readFileSync(resolve(root, 'src/client.js'), 'utf8');
  const renderer = readFileSync(resolve(root, 'src/renderer.js'), 'utf8');
  if (!client.includes(`'data-md-studio': '${version}'`)) {
    fail(`src/client.js data-md-studio attribute does not match package.json version ${version}`);
  }
  if (!renderer.includes(`version: '${version}'`)) {
    fail(`src/renderer.js diagnostics.version does not match package.json version ${version}`);
  }
}

if (failed) process.exit(1);
console.log('[check-manifest] OK (no BOM, valid JSON, consistent version)');
