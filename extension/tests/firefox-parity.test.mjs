import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const EXT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SHARED_FILES = [
  'autofill-core.js',
  'content-script.js',
  'popup.js',
  'token-capture.js',
  'popup.html',
  'popup.css',
];

describe('firefox build parity', () => {
  it.each(SHARED_FILES)('firefox/%s is identical to chrome/%s', (file) => {
    const chrome = readFileSync(resolve(EXT_ROOT, 'chrome', file), 'utf8').replace(/\r\n/g, '\n');
    const firefox = readFileSync(resolve(EXT_ROOT, 'firefox', file), 'utf8').replace(/\r\n/g, '\n');
    expect(firefox).toBe(chrome);
  });
});
