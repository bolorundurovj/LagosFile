import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { platform } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'dist-ext');

const filter = process.argv[2]; // optional: 'chrome' | 'firefox'

const targets = [
  { name: 'chrome-lagosfile-lirs',  dir: join(ROOT, 'extension', 'chrome'),  ext: '.zip' },
  { name: 'firefox-lagosfile-lirs', dir: join(ROOT, 'extension', 'firefox'), ext: '.zip' },
].filter(t => !filter || t.name.startsWith(filter));

if (targets.length === 0) {
  console.error(`No targets match filter: ${filter}`);
  process.exit(1);
}

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

for (const { name, dir, ext } of targets) {
  if (!existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const outZip = join(OUT, name + ext);
  if (existsSync(outZip)) rmSync(outZip);

  console.log(`Packing ${name}...`);

  if (platform() === 'win32') {
    execSync(
      `powershell -Command "Set-Location '${dir}'; Compress-Archive -Path * -DestinationPath '${outZip}' -Force"`,
      { stdio: 'inherit' },
    );
  } else {
    execSync(`cd "${dir}" && zip -r "${outZip}" .`, { stdio: 'inherit' });
  }

  if (name.includes('firefox')) {
    const outXpi = join(OUT, name + '.xpi');
    if (existsSync(outXpi)) rmSync(outXpi);
    if (platform() === 'win32') {
      execSync(`powershell -Command "Copy-Item '${outZip}' '${outXpi}'"`);
    } else {
      execSync(`cp "${outZip}" "${outXpi}"`);
    }
    console.log(`  -> ${outXpi}`);
  }

  console.log(`  -> ${outZip}`);
}

console.log('Done.');
