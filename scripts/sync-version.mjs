/**
 * sync-version.mjs
 *
 * Reads VERSION.ini, assembles the semver string, then syncs it to:
 *   - package.json
 *   - src-tauri/tauri.conf.json
 *   - src-tauri/Cargo.toml
 *   - extension/chrome/manifest.json
 *   - extension/firefox/manifest.json
 *
 * Usage:
 *   node scripts/sync-version.mjs          # reads version from VERSION.ini
 *   node scripts/sync-version.mjs 1.2.3   # overrides (also updates VERSION.ini fields)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function parseVersionIni(relPath) {
  const src = readFileSync(join(ROOT, relPath), 'utf8');
  const fields = {};
  for (const line of src.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    fields[key] = val;
  }
  return fields;
}

function assembleVersion(fields) {
  const { MAJOR, MINOR, PATCH, PRE_RELEASE } = fields;
  if (!MAJOR || !MINOR || !PATCH) {
    throw new Error('VERSION.ini must define MAJOR, MINOR, and PATCH.');
  }
  const base = `${MAJOR}.${MINOR}.${PATCH}`;
  return PRE_RELEASE ? `${base}-${PRE_RELEASE}` : base;
}

function readJson(relPath) {
  return JSON.parse(readFileSync(join(ROOT, relPath), 'utf8'));
}

function writeJson(relPath, obj) {
  writeFileSync(join(ROOT, relPath), JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function patchCargoToml(relPath, version) {
  let src = readFileSync(join(ROOT, relPath), 'utf8');
  src = src.replace(
    /^(version\s*=\s*")[^"]*(")/m,
    `$1${version}$2`,
  );
  writeFileSync(join(ROOT, relPath), src, 'utf8');
}

let version = process.argv[2];

if (version) {
  // Strip leading "v" if someone passes a tag
  version = version.replace(/^v/, '');
} else {
  const fields = parseVersionIni('VERSION.ini');
  version = assembleVersion(fields);
}

if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`Invalid version: "${version}". Expected semver without leading "v".`);
  process.exit(1);
}

const files = [
  { label: 'package.json',                    path: 'package.json',                   type: 'json' },
  { label: 'tauri.conf.json',                  path: 'src-tauri/tauri.conf.json',       type: 'json' },
  { label: 'extension/chrome/manifest.json',   path: 'extension/chrome/manifest.json', type: 'json' },
  { label: 'extension/firefox/manifest.json',  path: 'extension/firefox/manifest.json',type: 'json' },
  { label: 'src-tauri/Cargo.toml',             path: 'src-tauri/Cargo.toml',            type: 'toml' },
];

console.log(`Syncing version to ${version}...\n`);

for (const { label, path, type } of files) {
  if (type === 'json') {
    const obj = readJson(path);
    const prev = obj.version ?? '(none)';
    writeJson(path, { ...obj, version });
    console.log(`  ${label}: ${prev} -> ${version}`);
  } else if (type === 'toml') {
    const prev = readFileSync(join(ROOT, path), 'utf8').match(/^version\s*=\s*"([^"]*)"/m)?.[1] ?? '(none)';
    patchCargoToml(path, version);
    console.log(`  ${label}: ${prev} -> ${version}`);
  }
}

console.log('\nDone. Remember to run "cargo check" to update Cargo.lock.');
