import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createChromeMock, createBrowserMock, loadScript, flush, sampleFiling } from './helpers/ext-mocks.mjs';

const TOKEN = 'abcdef0123456789abcdef0123456789';

let chrome;
let routes;
let sent;
let windowListeners;

function route(msg) {
  sent.push(msg);
  const key = msg.type === 'FETCH_BRIDGE' ? 'FETCH_BRIDGE ' + msg.path : msg.type;
  const handler = routes[key];
  return typeof handler === 'function' ? handler(msg) : handler;
}

async function inject(r = {}, { withCore = true } = {}) {
  routes = { ...r };
  sent = [];
  chrome = createChromeMock();
  chrome.runtime.sendMessage.mockImplementation((msg, cb) => cb(route(msg)));
  globalThis.chrome = chrome;
  if (withCore) loadScript('chrome', 'autofill-core.js');
  else delete globalThis.LagosFileCore;
  loadScript('chrome', 'content-script.js');
  await flush(20);
}

function shadow() {
  return document.getElementById('__lf_panel_host').shadowRoot;
}

function q(id) {
  return shadow().getElementById(id);
}

function panelText() {
  return q('panel-body').textContent;
}

async function openPanel() {
  q('toggle').click();
  await flush(30);
}

function sentOfType(type) {
  return sent.filter((m) => m.type === type);
}

function toast() {
  return document.getElementById('__lf_toast_outer');
}

function sendToContent(msg) {
  const sendResponse = vi.fn();
  const returned = chrome.runtime.onMessage.listeners[0](msg, {}, sendResponse);
  return { returned, sendResponse };
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
  windowListeners = [];
  const orig = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, fn, opts) => {
    windowListeners.push([type, fn]);
    return orig(type, fn, opts);
  });
});

afterEach(() => {
  windowListeners.forEach(([type, fn]) => window.removeEventListener(type, fn));
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete globalThis.chrome;
  delete globalThis.browser;
  delete window.__lagosFileTokenPromise;
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

describe('content-script: panel', () => {
  it('injects a single shadow-DOM panel host that starts closed', async () => {
    await inject();
    const host = document.getElementById('__lf_panel_host');
    expect(host.style.position).toBe('fixed');
    expect(host.style.zIndex).toBe('2147483646');
    expect(q('panel').classList.contains('hidden')).toBe(true);
    expect(sent).toEqual([]);

    loadScript('chrome', 'content-script.js');
    expect(document.querySelectorAll('#__lf_panel_host')).toHaveLength(1);
  });

  it('toggles open, loads filings once, and closes', async () => {
    const f = sampleFiling();
    await inject({ 'FETCH_BRIDGE /filings': { ok: true, data: [f] } });
    q('toggle').click();
    expect(panelText()).toContain('Connecting to LagosFile');
    expect(q('toggle').classList.contains('active')).toBe(true);
    await flush(30);
    expect(sentOfType('SET_FILINGS_DATA')[0].data).toEqual([f]);
    expect(q('panel-body').querySelector('.sel-name').textContent).toBe('Ada Lovelace');
    expect(q('panel-body').querySelector('.sel-meta').textContent).toBe('YOA 2025 · REF-001');
    expect(q('panel-body').querySelector('.sel-tax').textContent).toBe('₦654,321.50 due');
    expect(panelText()).toContain('Capital Gains (Shares)');

    q('close-btn').click();
    expect(q('panel').classList.contains('hidden')).toBe(true);
    expect(q('toggle').classList.contains('active')).toBe(false);

    q('toggle').click();
    q('toggle').click();
    expect(sentOfType('FETCH_BRIDGE')).toHaveLength(1);
  });

  it('shows a picker for multiple filings and selects one', async () => {
    const a = sampleFiling({ filingId: 'a', filingReference: null });
    const b = sampleFiling({ filingId: 'b', taxpayer: null, computation: null, income: {} });
    await inject({ 'FETCH_BRIDGE /filings': { ok: true, data: [a, b] } });
    await openPanel();
    const cards = q('panel-body').querySelectorAll('.fc');
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('.fc-meta').textContent).toBe('YOA 2025');
    expect(cards[1].querySelector('.fc-name').textContent).toBe('—');
    expect(cards[1].querySelector('.fc-tax').textContent).toBe('—');

    cards[1].querySelector('.fc-btn').click();
    expect(q('panel-body').querySelector('.sel-name').textContent).toBe('—');
    expect(q('panel-body').querySelector('.manual-box')).toBeNull();

    q('b-back').click();
    expect(q('panel-body').querySelectorAll('.fc')).toHaveLength(2);

    q('pick-refresh').click();
    expect(panelText()).toContain('Connecting');
    await flush(30);
    expect(sentOfType('FETCH_BRIDGE')).toHaveLength(2);
  });

  it('falls back to /filing and renders defaults for missing fields', async () => {
    const f = { yearOfAssessment: null, computation: { finalTaxPayable: -50 } };
    await inject({
      'FETCH_BRIDGE /filings': { ok: true, data: [] },
      'FETCH_BRIDGE /filing': { ok: true, data: f },
    });
    await openPanel();
    expect(sent.map((m) => m.path).filter(Boolean)).toEqual(['/filings', '/filing']);
    expect(sentOfType('SET_FILINGS_DATA')[0].data).toEqual([f]);
    expect(q('panel-body').querySelector('.sel-meta').textContent).toBe('YOA — · —');
    expect(q('panel-body').querySelector('.sel-tax').textContent).toBe('₦50.00 due');
  });

  it('shows the auth error on 403 and refreshes from it', async () => {
    await inject({ 'FETCH_BRIDGE /filings': { ok: false, status: 403 } });
    await openPanel();
    expect(panelText()).toContain('Session Token Expired or Missing');
    expect(sent.some((m) => m.path === '/filing')).toBe(false);

    routes['FETCH_BRIDGE /filings'] = { ok: true, data: [sampleFiling()] };
    q('offline-refresh').click();
    await flush(30);
    expect(q('panel-body').querySelector('.sel-name').textContent).toBe('Ada Lovelace');
  });

  it('shows not-detected when offline and auth error when /filing alone returns 403', async () => {
    await inject();
    await openPanel();
    expect(panelText()).toContain('LagosFile Not Detected');

    document.body.innerHTML = '';
    await inject({ 'FETCH_BRIDGE /filing': { ok: false, status: 403 } });
    await openPanel();
    expect(panelText()).toContain('Session Token Expired or Missing');
  });

  it('escapes filing values rendered into the panel', async () => {
    const f = sampleFiling({ taxpayer: { fullName: '<b id="x">bad</b>' } });
    await inject({
      'FETCH_BRIDGE /filings': { ok: true, data: [f, sampleFiling({ filingId: 'z' })] },
    });
    await openPanel();
    expect(q('panel-body').querySelector('#x')).toBeNull();
    expect(q('panel-body').querySelector('.fc-name').textContent).toBe('<b id="x">bad</b>');
  });
});

describe('content-script: bridge token capture', () => {
  it('sends the hash token to the background and strips it from the URL', async () => {
    window.history.replaceState(null, '', `/calc?y=2#lagosfile=${TOKEN}`);
    await inject({ SET_BRIDGE_TOKEN: { ok: true } });
    expect(sentOfType('SET_BRIDGE_TOKEN')).toEqual([{ type: 'SET_BRIDGE_TOKEN', token: TOKEN }]);
    expect(window.location.pathname + window.location.search).toBe('/calc?y=2');
    expect(window.location.hash).toBe('');
  });

  it('skips capture when token-capture.js already stored the token', async () => {
    window.history.replaceState(null, '', `/#lagosfile=${TOKEN}`);
    window.__lagosFileTokenPromise = Promise.resolve(true);
    await inject({ SET_BRIDGE_TOKEN: { ok: true } });
    expect(sentOfType('SET_BRIDGE_TOKEN')).toHaveLength(0);
  });

  it('keeps the hash when the background rejects the token or replaceState throws', async () => {
    window.history.replaceState(null, '', `/#lagosfile=${TOKEN}`);
    await inject({ SET_BRIDGE_TOKEN: { ok: false } });
    expect(window.location.hash).toBe(`#lagosfile=${TOKEN}`);

    document.body.innerHTML = '';
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    await inject({ SET_BRIDGE_TOKEN: { ok: true } });
    expect(sentOfType('SET_BRIDGE_TOKEN')).toHaveLength(1);
  });

  it('waits for token capture before fetching filings', async () => {
    let release;
    window.__lagosFileTokenPromise = new Promise((r) => (release = r));
    await inject({ 'FETCH_BRIDGE /filings': { ok: true, data: [sampleFiling()] } });
    await openPanel();
    expect(sentOfType('FETCH_BRIDGE')).toHaveLength(0);
    release(true);
    await flush(30);
    expect(sentOfType('FETCH_BRIDGE')).toHaveLength(1);
  });

  it('reloads filings on hashchange with a new token while the panel is open', async () => {
    await inject({
      SET_BRIDGE_TOKEN: { ok: true },
      'FETCH_BRIDGE /filings': { ok: true, data: [sampleFiling()] },
    });
    await openPanel();
    expect(sentOfType('FETCH_BRIDGE')).toHaveLength(1);

    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush(30);
    expect(sentOfType('SET_BRIDGE_TOKEN')).toHaveLength(0);

    window.history.replaceState(null, '', `/#lagosfile=${TOKEN}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush(30);
    expect(sentOfType('SET_BRIDGE_TOKEN')).toHaveLength(1);
    expect(sentOfType('FETCH_BRIDGE')).toHaveLength(2);
    expect(window.location.hash).toBe('');
  });

  it('resets cached filings on hashchange while closed so the next open refetches', async () => {
    await inject({
      SET_BRIDGE_TOKEN: { ok: true },
      'FETCH_BRIDGE /filings': { ok: true, data: [sampleFiling()] },
    });
    await openPanel();
    q('close-btn').click();
    window.history.replaceState(null, '', `/#lagosfile=${TOKEN}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush(30);
    expect(sentOfType('FETCH_BRIDGE')).toHaveLength(1);
    await openPanel();
    expect(sentOfType('FETCH_BRIDGE')).toHaveLength(2);
  });

  it('ignores the hash when the core failed to load', async () => {
    window.history.replaceState(null, '', `/#lagosfile=${TOKEN}`);
    await inject({ SET_BRIDGE_TOKEN: { ok: true } }, { withCore: false });
    expect(sentOfType('SET_BRIDGE_TOKEN')).toHaveLength(0);
  });
});

describe('content-script: Firefox messaging', () => {
  async function injectFirefox(handler) {
    sent = [];
    const browser = createBrowserMock();
    browser.runtime.sendMessage.mockImplementation((msg) => {
      sent.push(msg);
      return handler(msg);
    });
    globalThis.browser = browser;
    loadScript('chrome', 'autofill-core.js');
    loadScript('chrome', 'content-script.js');
    await flush(20);
    return browser;
  }

  it('uses browser.runtime promises and registers on browser.runtime.onMessage', async () => {
    const f = sampleFiling();
    const browser = await injectFirefox((msg) =>
      Promise.resolve(msg.path === '/filings' ? { ok: true, data: [f] } : { ok: true })
    );
    await openPanel();
    expect(q('panel-body').querySelector('.sel-name').textContent).toBe('Ada Lovelace');
    expect(browser.runtime.onMessage.listeners).toHaveLength(1);
  });

  it('treats rejected messages and thrown errors as no response', async () => {
    await injectFirefox(() => Promise.reject(new Error('no bg')));
    await openPanel();
    expect(panelText()).toContain('LagosFile Not Detected');

    document.body.innerHTML = '';
    await injectFirefox(() => {
      throw new Error('invalidated');
    });
    await openPanel();
    expect(panelText()).toContain('LagosFile Not Detected');
  });
});

function addPortal(html) {
  const div = document.createElement('div');
  div.id = 'portal';
  div.innerHTML = html;
  document.body.appendChild(div);
}

async function selectSingle(filing) {
  await inject({ 'FETCH_BRIDGE /filings': { ok: true, data: [filing] } });
  await openPanel();
}

describe('content-script: fill actions', () => {
  it('fills a step directly and shows a success toast that fades out', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    addPortal(
      '<label for="emp">Employment</label><input id="emp" type="text">' +
        '<label for="biz">Trade Business or profession</label><input id="biz" type="text">'
    );
    await selectSingle(sampleFiling());
    q('b-income').click();
    expect(document.getElementById('emp').value).toBe('5000000');
    expect(document.getElementById('biz').value).toBe('1200000');
    expect(toast().textContent).toBe('✔ 2 fields filled on "Income"');
    expect(toast().style.background).toBe('rgb(20, 83, 45)');

    vi.advanceTimersByTime(5000);
    expect(toast().style.opacity).toBe('0');
    vi.advanceTimersByTime(300);
    expect(toast()).toBeNull();
  });

  it('reports partial fills, missing fields and empty steps', async () => {
    addPortal('<label for="emp">Employment</label><input id="emp" type="text">');
    await selectSingle(sampleFiling());
    q('b-income').click();
    expect(toast().textContent).toBe('✔ 1 field filled on "Income" · 1 not found');
    expect(toast().style.background).toBe('rgb(124, 61, 15)');

    q('b-deductions').click();
    expect(document.querySelectorAll('#__lf_toast_outer')).toHaveLength(1);
    expect(toast().textContent).toBe('⚠ No fields found. Navigate to the "Deductions" tab first.');

    q('b-adjustments').click();
    expect(toast().textContent).toBe('No non-zero values for "Adjustments".');
    ['b-reliefs', 'b-wht', 'b-others'].forEach((id) => q(id).click());
    expect(toast().textContent).toBe('⚠ No fields found. Navigate to the "Others" tab first.');
  });

  it('switches portal tabs and waits before filling', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    addPortal(
      '<button type="button" id="tab-ded">Deductions</button>' +
        '<label for="pen">Pensions</label><input id="pen" type="text">'
    );
    await selectSingle(sampleFiling());
    const tabClick = vi.fn();
    document.getElementById('tab-ded').addEventListener('click', tabClick);
    q('b-deductions').click();
    expect(tabClick).toHaveBeenCalled();
    expect(document.getElementById('pen').value).toBe('');
    vi.advanceTimersByTime(180);
    expect(document.getElementById('pen').value).toBe('400000');
    expect(toast().textContent).toBe('✔ 1 field filled on "Deductions"');
  });

  it('auto-fills all tabs and summarises the result', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    addPortal('<label for="emp">Employment</label><input id="emp" type="text">');
    await selectSingle(sampleFiling());
    q('b-all').click();
    await vi.advanceTimersByTimeAsync(1500);
    expect(document.getElementById('emp').value).toBe('5000000');
    expect(toast().textContent).toMatch(/^✔ Auto-filled 1 field across tabs · \d+ not found$/);
  });

  it('auto-fill reports full success and no-field cases', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    addPortal(
      '<label for="emp">Employment</label><input id="emp" type="text">' +
        '<label for="pen">Pensions</label><input id="pen" type="text">'
    );
    const f = { yearOfAssessment: 2025, income: { employment: 10 }, deductions: { pension: 2 } };
    await selectSingle(f);
    q('b-all').click();
    await vi.advanceTimersByTimeAsync(1500);
    expect(toast().textContent).toBe('✔ Auto-filled 2 fields across tabs');
    expect(toast().style.background).toBe('rgb(20, 83, 45)');

    document.getElementById('portal').remove();
    q('b-all').click();
    await vi.advanceTimersByTimeAsync(1500);
    expect(toast().textContent).toBe('⚠ No calculator fields found on this page.');
  });
});

describe('content-script: INJECT messages from the popup', () => {
  it('answers PING and ignores unknown messages', async () => {
    await inject();
    expect(sendToContent({ type: 'PING' }).sendResponse).toHaveBeenCalledWith({ pong: true, panelInjected: true });
    const { returned, sendResponse } = sendToContent({ type: 'OTHER' });
    expect(returned).toBeUndefined();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('runs INJECT_STEP with the supplied filing and keeps it selected', async () => {
    addPortal('<label for="emp">Employment</label><input id="emp" type="text">');
    await inject();
    const f = sampleFiling({ income: { employment: 77 } });
    const { returned, sendResponse } = sendToContent({ type: 'INJECT_STEP', step: 'income', data: f });
    expect(returned).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    expect(document.getElementById('emp').value).toBe('77');

    document.getElementById('emp').value = '';
    sendToContent({ type: 'INJECT_STEP', step: 'income' });
    expect(document.getElementById('emp').value).toBe('77');
  });

  it('warns when INJECT_STEP or INJECT_ALL arrive without any filing', async () => {
    await inject();
    sendToContent({ type: 'INJECT_STEP', step: 'income' });
    expect(toast().textContent).toBe('No filing selected.');
    toast().remove();
    expect(sendToContent({ type: 'INJECT_ALL' }).sendResponse).toHaveBeenCalledWith({ ok: true });
    expect(toast().textContent).toBe('No filing selected.');
  });

  it('runs INJECT_ALL with the supplied filing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    addPortal('<label for="emp">Employment</label><input id="emp" type="text">');
    await inject();
    const f = { income: { employment: 9 } };
    expect(sendToContent({ type: 'INJECT_ALL', data: f }).sendResponse).toHaveBeenCalledWith({ ok: true });
    await vi.advanceTimersByTimeAsync(1500);
    expect(document.getElementById('emp').value).toBe('9');
    expect(toast().textContent).toBe('✔ Auto-filled 1 field across tabs');
  });

  it('reports errors thrown while injecting', async () => {
    await inject();
    vi.spyOn(globalThis.LagosFileCore, 'activateTab').mockImplementation(() => {
      throw new Error('tab boom');
    });
    vi.spyOn(globalThis.LagosFileCore, 'injectAllSteps').mockImplementation(() => {
      throw new Error('all boom');
    });
    expect(sendToContent({ type: 'INJECT_STEP', step: 'income', data: {} }).sendResponse).toHaveBeenCalledWith({
      ok: false,
      error: 'Error: tab boom',
    });
    expect(sendToContent({ type: 'INJECT_ALL', data: {} }).sendResponse).toHaveBeenCalledWith({
      ok: false,
      error: 'Error: all boom',
    });
  });

  it('shows an error toast when the core failed to load', async () => {
    await inject({ 'FETCH_BRIDGE /filings': { ok: true, data: [sampleFiling()] } }, { withCore: false });
    await openPanel();
    expect(q('panel-body').querySelector('.manual-box')).toBeNull();
    q('b-income').click();
    expect(toast().textContent).toBe('Extension core failed to load.');
    expect(toast().style.background).toBe('rgb(127, 29, 29)');
    toast().remove();
    q('b-all').click();
    expect(toast().textContent).toBe('Extension core failed to load.');
  });
});
