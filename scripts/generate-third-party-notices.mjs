import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'THIRD-PARTY-NOTICES.txt');

const HEADER = `Third-Party Notices
===================

LagosFile uses the following open source packages, each governed by its own
license. This file is generated automatically during the release build.

`;

function run(cmd, cwd = ROOT) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function getNodeLicenses() {
  const json = run('npx license-checker --json --production');
  const data = JSON.parse(json);
  const deps = [];
  for (const [name, info] of Object.entries(data)) {
    deps.push({
      name: name.split('@').slice(0, -1).join('@'),
      version: name.split('@').pop(),
      license: info.licenses ?? 'Unknown',
      repository: info.repository ?? '',
    });
  }
  return deps.sort((a, b) => a.name.localeCompare(b.name));
}

function getRustLicenses() {
  try {
    const json = run('cargo license --json', join(ROOT, 'src-tauri'));
    const data = JSON.parse(json);
    return data
      .map(d => ({
        name: d.name,
        version: d.version,
        license: d.license ?? 'Unknown',
        repository: '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function format(deps, title) {
  if (deps.length === 0) return '';
  let out = `${title}\n${'─'.repeat(title.length)}\n\n`;
  for (const d of deps) {
    out += `  ${d.name}  ${d.version}  —  ${d.license}\n`;
    if (d.repository) {
      out += `    ${d.repository}\n`;
    }
  }
  return out + '\n';
}

console.log('Scanning Node.js dependencies...');
const nodeDeps = getNodeLicenses();
console.log(`  Found ${nodeDeps.length} Node dependencies`);

console.log('Scanning Rust dependencies...');
const rustDeps = getRustLicenses();
console.log(`  Found ${rustDeps.length} Rust dependencies`);

const body = HEADER +
  format(nodeDeps, 'Node.js / npm Packages') +
  format(rustDeps, 'Rust / Cargo Packages') +
  `\n---\n` +
  `For complete license text of each package, see the package's source repository\n` +
  `or the license files included in the installed package directories.\n`;

writeFileSync(OUT, body);
console.log(`\nWrote ${OUT}`);
