import { vi } from 'vitest';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
export const EXT_ROOT = resolve(__dirname, '..', '..');

export function extPath(...parts) {
  return resolve(EXT_ROOT, ...parts);
}

export function loadScript(...parts) {
  const file = extPath(...parts);
  delete require.cache[require.resolve(file)];
  return require(file);
}

export function readExtFile(...parts) {
  return readFileSync(extPath(...parts), 'utf8');
}

export function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener: vi.fn((fn) => listeners.push(fn)),
    fire(...args) {
      return listeners.map((fn) => fn(...args));
    },
  };
}

export function createCallbackStore(initial = {}) {
  const data = { ...initial };
  const pick = (keys) => {
    const list = Array.isArray(keys) ? keys : [keys];
    const out = {};
    list.forEach((k) => {
      if (k in data) out[k] = data[k];
    });
    return out;
  };
  const toList = (keys) => (Array.isArray(keys) ? keys : [keys]);
  return {
    data,
    get: vi.fn((keys, cb) => cb(pick(keys))),
    set: vi.fn((obj, cb) => {
      Object.assign(data, obj);
      if (cb) cb();
    }),
    remove: vi.fn((keys, cb) => {
      toList(keys).forEach((k) => delete data[k]);
      if (cb) cb();
    }),
  };
}

export function createChromeMock({ session = {}, withSession = true, withLocal = true } = {}) {
  const chrome = {
    runtime: {
      lastError: undefined,
      onMessage: createEvent(),
      onInstalled: createEvent(),
      onStartup: createEvent(),
      sendMessage: vi.fn(),
    },
    storage: {},
    tabs: {
      query: vi.fn((_q, cb) => cb([{ id: 7 }])),
      sendMessage: vi.fn((_id, _msg, cb) => cb({ ok: true })),
    },
  };
  if (withSession) chrome.storage.session = createCallbackStore(session);
  if (withLocal) chrome.storage.local = createCallbackStore();
  return chrome;
}

export function createBrowserMock() {
  return {
    runtime: {
      onMessage: createEvent(),
      onInstalled: createEvent(),
      onStartup: createEvent(),
      sendMessage: vi.fn(() => Promise.resolve({ ok: true })),
    },
    storage: {
      local: { remove: vi.fn(() => Promise.resolve()) },
    },
    tabs: {
      query: vi.fn(() => Promise.resolve([{ id: 9 }])),
      sendMessage: vi.fn(() => Promise.resolve({ ok: true })),
    },
  };
}

export function dispatch(event, msg, sender = {}) {
  return new Promise((resolvePromise) => {
    let returned;
    const sendResponse = (resp) => queueMicrotask(() => resolvePromise({ resp, returned }));
    returned = event.listeners[0](msg, sender, sendResponse);
  });
}

export function sendSync(event, msg) {
  const sendResponse = vi.fn();
  const returned = event.listeners[0](msg, {}, sendResponse);
  return { returned, sendResponse };
}

export function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

export async function flush(times = 10) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

export function sampleFiling(overrides = {}) {
  return {
    filingId: 'f-1',
    filingReference: 'REF-001',
    yearOfAssessment: 2025,
    taxpayer: { fullName: 'Ada Lovelace', tin: '12345678' },
    income: { employment: 5000000, business: 1200000, capitalGain: 300000 },
    deductions: { pension: 400000, nhf: 125000 },
    computation: {
      finalTaxPayable: 654321.5,
      chargeableIncome: 4000000,
      whtCredits: 10000,
      payeCredits: 20000,
    },
    ...overrides,
  };
}
