import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createChromeMock,
  createBrowserMock,
  loadScript,
  readExtFile,
  flush,
  sampleFiling,
} from './helpers/ext-mocks.mjs';

const POPUP_BODY = new DOMParser()
  .parseFromString(readExtFile('chrome', 'popup.html'), 'text/html')
  .body.innerHTML.replace(/<script[\s\S]*?<\/script>/g, '');

const $ = (id) => document.getElementById(id);
const visible = (id) => !$(id).classList.contains('hidden');

let chrome;
let routes;
let sent;

function route(msg) {
  sent.push(msg);
  const key = msg.type === 'FETCH_BRIDGE' ? 'FETCH_BRIDGE ' + msg.path : msg.type;
  const handler = routes[key];
  return typeof handler === 'function' ? handler(msg) : handler;
}

async function openPopup(r = {}) {
  routes = { ...r };
  sent = [];
  document.body.innerHTML = POPUP_BODY;
  chrome = createChromeMock();
  chrome.runtime.sendMessage.mockImplementation((msg, cb) => cb(route(msg)));
  globalThis.chrome = chrome;
  loadScript('chrome', 'autofill-core.js');
  loadScript('chrome', 'popup.js');
  await flush(20);
}

function sentOfType(type) {
  return sent.filter((m) => m.type === type);
}

beforeEach(() => {
  globalThis.alert = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete globalThis.chrome;
  delete globalThis.browser;
  delete globalThis.alert;
  document.body.innerHTML = '';
});

describe('popup: bootstrap', () => {
  it('shows the fill state for a single filing from the bridge', async () => {
    const f = sampleFiling();
    await openPopup({ 'FETCH_BRIDGE /filings': { ok: true, data: [f] } });
    expect(sent[0]).toEqual({ type: 'GET_FILING_DATA' });
    expect(sent[1]).toEqual({ type: 'FETCH_BRIDGE', path: '/filings' });
    expect(sentOfType('SET_FILINGS_DATA')[0].data).toEqual([f]);
    expect(sentOfType('SET_FILING_DATA').at(-1).data).toEqual(f);
    expect(visible('state-fill')).toBe(true);
    expect(visible('state-loading')).toBe(false);
    expect($('status-text').textContent).toBe('Ada Lovelace · 2025');
    expect($('selected-summary').textContent).toContain('Ref: REF-001');
    expect($('selected-summary').textContent).toContain('₦654,321.50 due');
  });

  it('renders manual fields and quick-copy rows for the selected filing', async () => {
    await openPopup({ 'FETCH_BRIDGE /filings': { ok: true, data: [sampleFiling()] } });
    expect(visible('manual-section')).toBe(true);
    const manual = $('manual-fields').textContent;
    expect(manual).toContain('Capital Gains (Shares)');
    expect(manual).toContain('300,000');

    const labels = [...$('copy-fields').querySelectorAll('.copy-field-label')].map((e) => e.textContent);
    expect(labels).toEqual([
      'Payer ID',
      'TIN',
      'Employment',
      'Trade / Business',
      'Pension',
      'NHF',
      'WHT Credits',
      'PAYE Credits',
      'Chargeable Income',
      'Final Tax Payable',
    ]);
    expect($('copy-fields').querySelector('.copy-field-value').textContent).toBe('N-12345678');
  });

  it('shows the picker when several filings exist and nothing was selected', async () => {
    const a = sampleFiling({ filingId: 'a', filingReference: null });
    const b = sampleFiling({ filingId: 'b', taxpayer: null, computation: {} });
    await openPopup({ 'FETCH_BRIDGE /filings': { ok: true, data: [a, b] } });
    expect(visible('state-pick')).toBe(true);
    expect($('status-text').textContent).toBe('2 filing(s) found');
    const cards = $('filing-list').querySelectorAll('.filing-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('.filing-meta').textContent).toBe('YOA 2025');
    expect(cards[1].querySelector('.filing-name').textContent).toBe('—');
    expect(cards[1].querySelector('.filing-tax').textContent).toBe('—');
    expect(sentOfType('SET_FILING_DATA').at(-1).data).toBeNull();

    cards[1].querySelector('.filing-select-btn').click();
    expect(visible('state-fill')).toBe(true);
    expect(sentOfType('SET_FILING_DATA').at(-1).data).toEqual(b);
    expect($('status-text').textContent).toBe('— · 2025');
  });

  it('restores the cached selection when it is still in the live list', async () => {
    const a = sampleFiling({ filingId: 'a' });
    const b = sampleFiling({ filingId: 'b', taxpayer: { fullName: 'Bola' } });
    await openPopup({
      GET_FILING_DATA: { filingId: 'b', stale: true },
      'FETCH_BRIDGE /filings': { ok: true, data: [a, b] },
    });
    expect(visible('state-fill')).toBe(true);
    expect($('status-text').textContent).toBe('Bola · 2025');
    expect(sentOfType('SET_FILING_DATA').at(-1).data).toBe(b);
  });

  it('drops a cached selection that no longer exists', async () => {
    await openPopup({
      GET_FILING_DATA: { filingId: 'gone' },
      'FETCH_BRIDGE /filings': {
        ok: true,
        data: [sampleFiling({ filingId: 'a' }), sampleFiling({ filingId: 'b' })],
      },
    });
    expect(visible('state-pick')).toBe(true);
  });

  it('falls back to the single /filing endpoint', async () => {
    const f = sampleFiling();
    await openPopup({
      'FETCH_BRIDGE /filings': { ok: true, data: [] },
      'FETCH_BRIDGE /filing': { ok: true, data: f },
    });
    expect(sent.map((m) => m.path).filter(Boolean)).toEqual(['/filings', '/filing']);
    expect(visible('state-fill')).toBe(true);
    expect(sentOfType('SET_FILINGS_DATA')[0].data).toEqual([f]);
    expect(sentOfType('SET_FILING_DATA').at(-1).data).toEqual(f);
  });
});

describe('popup: offline and auth errors', () => {
  it('shows the auth error and clears cached data on 403 from /filings', async () => {
    await openPopup({ 'FETCH_BRIDGE /filings': { ok: false, status: 403 } });
    expect(visible('state-offline')).toBe(true);
    expect($('offline-title').textContent).toBe('Session Token Expired or Missing');
    expect($('offline-desc').textContent).toContain('Try Again');
    expect($('status-text').textContent).toBe('Auth required (403)');
    expect(sentOfType('CLEAR_FILING_DATA')).toHaveLength(1);
    expect(sent.some((m) => m.path === '/filing')).toBe(false);
  });

  it('shows the auth error when only /filing returns 403', async () => {
    await openPopup({
      'FETCH_BRIDGE /filings': { ok: false, status: 0 },
      'FETCH_BRIDGE /filing': { ok: false, status: 403 },
    });
    expect($('status-text').textContent).toBe('Auth required (403)');
  });

  it('shows not-detected when the bridge is unreachable and never shows stale data', async () => {
    await openPopup({ GET_FILING_DATA: sampleFiling() });
    expect(visible('state-offline')).toBe(true);
    expect(visible('state-fill')).toBe(false);
    expect($('offline-title').textContent).toBe('LagosFile Not Detected');
    expect($('status-text').textContent).toBe('Not connected');
    expect(sentOfType('CLEAR_FILING_DATA')).toHaveLength(1);
  });

  it('retries from the offline state via Try Again', async () => {
    await openPopup();
    routes['FETCH_BRIDGE /filings'] = { ok: true, data: [sampleFiling()] };
    $('offline-refresh-btn').click();
    expect(visible('state-loading')).toBe(true);
    expect($('status-text').textContent).toBe('Connecting…');
    await flush(20);
    expect(visible('state-fill')).toBe(true);
  });
});

describe('popup: actions', () => {
  it('sends INJECT_STEP for each step button and INJECT_ALL for the fill-all button', async () => {
    const f = sampleFiling();
    await openPopup({ 'FETCH_BRIDGE /filings': { ok: true, data: [f] } });
    const steps = ['income', 'deductions', 'adjustments', 'reliefs', 'wht', 'others'];
    steps.forEach((s) => $('fill-' + s + '-btn').click());
    $('fill-all-btn').click();
    await flush();
    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true }, expect.any(Function));
    expect(sentOfType('INJECT_STEP').map((m) => m.step)).toEqual(steps);
    expect(sentOfType('INJECT_STEP')[0].data).toEqual(f);
    expect(sentOfType('INJECT_ALL')).toEqual([{ type: 'INJECT_ALL', data: f }]);
  });

  it('does not inject when there is no active tab', async () => {
    await openPopup({ 'FETCH_BRIDGE /filings': { ok: true, data: [sampleFiling()] } });
    chrome.tabs.query.mockImplementation((_q, cb) => cb([]));
    $('fill-income-btn').click();
    $('fill-all-btn').click();
    await flush();
    expect(sentOfType('INJECT_STEP')).toHaveLength(0);
    expect(sentOfType('INJECT_ALL')).toHaveLength(0);
  });

  it('alerts instead of injecting when no filing is selected', async () => {
    await openPopup({
      'FETCH_BRIDGE /filings': { ok: true, data: [sampleFiling({ filingId: 'a' }), sampleFiling({ filingId: 'b' })] },
    });
    $('fill-income-btn').click();
    $('fill-all-btn').click();
    expect(globalThis.alert).toHaveBeenCalledTimes(2);
    expect(globalThis.alert).toHaveBeenCalledWith('No filing selected. Choose a filing first.');
    expect(chrome.tabs.query).not.toHaveBeenCalled();
  });

  it('goes back to the picker and refreshes from pick and fill states', async () => {
    const list = [sampleFiling({ filingId: 'a' }), sampleFiling({ filingId: 'b' })];
    await openPopup({ 'FETCH_BRIDGE /filings': { ok: true, data: list } });
    $('filing-list').querySelector('.filing-select-btn').click();
    expect(visible('state-fill')).toBe(true);

    $('back-btn').click();
    expect(visible('state-pick')).toBe(true);
    expect(sentOfType('SET_FILING_DATA').at(-1).data).toBeNull();

    const before = sentOfType('FETCH_BRIDGE').length;
    $('pick-refresh-btn').click();
    await flush(20);
    $('filing-list').querySelector('.filing-select-btn').click();
    $('fill-refresh-btn').click();
    await flush(20);
    expect(sentOfType('FETCH_BRIDGE').length).toBe(before + 2);
    expect(visible('state-fill')).toBe(true);
  });

  it('switches to manual JSON loading and clears data', async () => {
    await openPopup({
      'FETCH_BRIDGE /filings': { ok: true, data: [sampleFiling({ filingId: 'a' }), sampleFiling({ filingId: 'b' })] },
    });
    $('pick-manual-btn').click();
    expect(visible('state-offline')).toBe(true);
    expect($('offline-title').textContent).toBe('LagosFile Not Detected');
    expect(sentOfType('CLEAR_FILING_DATA')).toHaveLength(1);
  });

  it('copies quick-copy and manual values to the clipboard and resets the button label', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await openPopup({ 'FETCH_BRIDGE /filings': { ok: true, data: [sampleFiling()] } });

    const empRow = [...$('copy-fields').children].find((r) => r.textContent.startsWith('Employment'));
    const btn = empRow.querySelector('.copy-btn');
    btn.click();
    expect(writeText).toHaveBeenCalledWith('5000000');
    expect(btn.textContent).toBe('ok');
    vi.advanceTimersByTime(1200);
    expect(btn.textContent).toBe('cp');

    writeText.mockReturnValueOnce(Promise.reject(new Error('denied')));
    const mBtn = $('manual-fields').querySelector('.copy-btn');
    mBtn.click();
    expect(writeText).toHaveBeenLastCalledWith('300000');
    expect(mBtn.textContent).toBe('ok');
    vi.advanceTimersByTime(1200);
    expect(mBtn.textContent).toBe('cp');
    delete navigator.clipboard;
  });
});

describe('popup: manual JSON loading', () => {
  async function offline() {
    await openPopup();
    sent = [];
  }

  function parse(text) {
    $('json-input').value = text;
    $('parse-json-btn').click();
  }

  it('validates pasted JSON', async () => {
    await offline();
    parse('   ');
    expect(visible('parse-error')).toBe(true);
    expect($('parse-error').textContent).toBe('Paste JSON first.');

    parse('{nope');
    expect($('parse-error').textContent).toMatch(/^Invalid JSON: /);

    parse('[]');
    expect($('parse-error').textContent).toBe('Invalid JSON: Empty array.');

    parse('{"taxpayer":{}}');
    expect($('parse-error').textContent).toBe('Invalid JSON: Missing taxpayer or computation fields.');
    expect(sentOfType('SET_FILINGS_DATA')).toHaveLength(0);
  });

  it('loads a single filing object into the fill state', async () => {
    await offline();
    parse('{nope');
    const f = sampleFiling();
    parse(JSON.stringify(f));
    expect(visible('parse-error')).toBe(false);
    expect($('json-input').value).toBe('');
    expect(visible('state-fill')).toBe(true);
    expect(sentOfType('SET_FILINGS_DATA')[0].data).toEqual([f]);
    expect(sentOfType('SET_FILING_DATA').at(-1).data).toEqual(f);
  });

  it('loads an array of filings into the picker', async () => {
    await offline();
    parse(JSON.stringify([sampleFiling({ filingId: 'a' }), sampleFiling({ filingId: 'b' })]));
    expect(visible('state-pick')).toBe(true);
    expect($('filing-list').children).toHaveLength(2);
    expect(sentOfType('SET_FILING_DATA').at(-1).data).toBeNull();
  });

  it('reads a chosen file and parses it', async () => {
    await offline();
    const clickSpy = vi.spyOn($('file-input'), 'click');
    $('load-file-btn').click();
    expect(clickSpy).toHaveBeenCalled();

    const input = $('file-input');
    Object.defineProperty(input, 'files', { value: [], configurable: true });
    input.dispatchEvent(new Event('change'));
    expect(visible('state-offline')).toBe(true);

    const file = new File([JSON.stringify(sampleFiling())], 'pending_filing.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(visible('state-fill')).toBe(true));
    expect($('status-text').textContent).toBe('Ada Lovelace · 2025');
  });
});

describe('popup: rendering edge cases', () => {
  it('hides the manual section and formats payer IDs from the TIN', async () => {
    const f = sampleFiling({
      taxpayer: { fullName: 'C Corp', tin: 'C-999' },
      income: { employment: 0 },
      deductions: {},
      computation: { finalTaxPayable: 'abc' },
      yearOfAssessment: null,
      filingReference: null,
    });
    await openPopup({ 'FETCH_BRIDGE /filings': { ok: true, data: [f] } });
    expect(visible('manual-section')).toBe(false);
    expect($('selected-summary').textContent).toContain('YOA — · Ref: —');
    expect($('selected-summary').textContent).toContain('— due');
    const values = [...$('copy-fields').querySelectorAll('.copy-field-value')].map((e) => e.textContent);
    expect(values).toEqual(['C-999', 'C-999', 'abc']);
  });

  it('prefers an explicit payer ID and skips it when no TIN exists', async () => {
    await openPopup({
      'FETCH_BRIDGE /filings': { ok: true, data: [sampleFiling({ taxpayer: { payerId: 'P-1', tin: 'N-5' } })] },
    });
    expect($('copy-fields').querySelector('.copy-field-value').textContent).toBe('P-1');

    await openPopup({ 'FETCH_BRIDGE /filings': { ok: true, data: [sampleFiling({ taxpayer: {} })] } });
    const labels = [...$('copy-fields').querySelectorAll('.copy-field-label')].map((e) => e.textContent);
    expect(labels).not.toContain('Payer ID');
    expect(labels).not.toContain('TIN');
  });

  it('escapes HTML in filing values', async () => {
    const f = sampleFiling({ taxpayer: { fullName: '<img src=x onerror=alert(1)>' } });
    await openPopup({ 'FETCH_BRIDGE /filings': { ok: true, data: [f] } });
    expect($('selected-summary').querySelector('img')).toBeNull();
    expect($('selected-summary').querySelector('.sf-name').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('treats a throwing sendMessage as no response', async () => {
    document.body.innerHTML = POPUP_BODY;
    sent = [];
    chrome = createChromeMock();
    chrome.runtime.sendMessage.mockImplementation(() => {
      throw new Error('Extension context invalidated');
    });
    globalThis.chrome = chrome;
    loadScript('chrome', 'popup.js');
    await flush(20);
    expect(visible('state-offline')).toBe(true);
  });
});

describe('popup: Firefox browser.* APIs', () => {
  async function openFirefox(handler) {
    document.body.innerHTML = POPUP_BODY;
    const browser = createBrowserMock();
    browser.runtime.sendMessage.mockImplementation(handler);
    globalThis.browser = browser;
    loadScript('chrome', 'autofill-core.js');
    loadScript('chrome', 'popup.js');
    await flush(20);
    return browser;
  }

  it('uses promise-based messaging and tab queries', async () => {
    const f = sampleFiling();
    const browser = await openFirefox((msg) =>
      Promise.resolve(msg.type === 'FETCH_BRIDGE' && msg.path === '/filings' ? { ok: true, data: [f] } : { ok: true })
    );
    expect(visible('state-fill')).toBe(true);
    $('fill-wht-btn').click();
    await flush();
    expect(browser.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(browser.runtime.sendMessage).toHaveBeenLastCalledWith({ type: 'INJECT_STEP', step: 'wht', data: f });

    browser.tabs.query.mockRejectedValueOnce(new Error('x'));
    const calls = browser.runtime.sendMessage.mock.calls.length;
    $('fill-all-btn').click();
    await flush();
    expect(browser.runtime.sendMessage.mock.calls.length).toBe(calls);
  });

  it('treats rejected messages as offline', async () => {
    await openFirefox(() => Promise.reject(new Error('no bg')));
    expect(visible('state-offline')).toBe(true);
    expect($('status-text').textContent).toBe('Not connected');
  });
});
