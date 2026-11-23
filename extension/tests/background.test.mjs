import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createChromeMock, loadScript, dispatch, sendSync, jsonResponse } from './helpers/ext-mocks.mjs';
import manifest from '../chrome/manifest.json';

const VERSION = manifest.version;
const TOKEN = 'abcdef0123456789abcdef0123456789';

let chrome;

function load(opts) {
  chrome = createChromeMock(opts);
  globalThis.chrome = chrome;
  loadScript('chrome', 'background.js');
  return chrome;
}

function send(msg) {
  return dispatch(chrome.runtime.onMessage, msg);
}

describe('chrome background: lifecycle', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.chrome;
    delete globalThis.fetch;
  });

  it('purges legacy local storage and restores session state on install', async () => {
    load({ session: { filingsData: [{ filingId: 'a' }], filingData: { filingId: 'a' }, bridgeToken: TOKEN } });
    chrome.runtime.onInstalled.fire();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(
      ['filingsData', 'filingData', 'bridgeToken'],
      expect.any(Function)
    );
    expect(console.log).toHaveBeenCalledWith(`[LagosFile] v${VERSION} installed.`);
    chrome.storage.session.get.mockClear();

    expect((await send({ type: 'GET_FILINGS_DATA' })).resp).toEqual([{ filingId: 'a' }]);
    expect((await send({ type: 'GET_FILING_DATA' })).resp).toEqual({ filingId: 'a' });
    expect(chrome.storage.session.get).not.toHaveBeenCalled();

    globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse([])));
    await send({ type: 'FETCH_BRIDGE' });
    expect(globalThis.fetch.mock.calls[0][1].headers['X-LagosFile-Token']).toBe(TOKEN);
  });

  it('restores on startup and tolerates missing or failed session reads', () => {
    load();
    chrome.runtime.onStartup.fire();
    expect(chrome.storage.local.remove).toHaveBeenCalled();
    expect(chrome.storage.session.get).toHaveBeenCalledWith(
      ['filingsData', 'filingData', 'bridgeToken'],
      expect.any(Function)
    );

    chrome.runtime.lastError = { message: 'boom' };
    chrome.runtime.onStartup.fire();
    chrome.storage.session.get.mockImplementationOnce((_k, cb) => {
      chrome.runtime.lastError = undefined;
      cb(undefined);
    });
    chrome.runtime.onStartup.fire();
  });

  it('skips storage work when no storage areas exist', () => {
    load({ withSession: false, withLocal: false });
    expect(() => chrome.runtime.onInstalled.fire()).not.toThrow();
    expect(() => chrome.runtime.onStartup.fire()).not.toThrow();
  });
});

describe('chrome background: token and filing state', () => {
  afterEach(() => {
    delete globalThis.chrome;
  });

  it('stores a valid bridge token in session storage and removes an empty one', async () => {
    load();
    const r1 = await send({ type: 'SET_BRIDGE_TOKEN', token: TOKEN });
    expect(r1.resp).toEqual({ ok: true });
    expect(chrome.storage.session.data.bridgeToken).toBe(TOKEN);

    const r2 = await send({ type: 'SET_BRIDGE_TOKEN', token: '' });
    expect(r2.resp).toEqual({ ok: true });
    expect(chrome.storage.session.remove).toHaveBeenCalledWith('bridgeToken', expect.any(Function));
    expect(chrome.storage.session.data.bridgeToken).toBeUndefined();

    await send({ type: 'SET_BRIDGE_TOKEN', token: 42 });
    expect(chrome.storage.session.data.bridgeToken).toBeUndefined();
  });

  it('caches filings list in memory and session storage', async () => {
    load();
    const list = [{ filingId: 'x' }, { filingId: 'y' }];
    expect((await send({ type: 'SET_FILINGS_DATA', data: list })).resp).toEqual({ ok: true });
    expect(chrome.storage.session.data.filingsData).toEqual(list);
    expect((await send({ type: 'GET_FILINGS_DATA' })).resp).toEqual(list);

    await send({ type: 'SET_FILINGS_DATA', data: 'nope' });
    expect(chrome.storage.session.data.filingsData).toEqual([]);
  });

  it('reads filings from session storage when memory is empty', async () => {
    load({ session: { filingsData: [{ filingId: 's' }] } });
    expect((await send({ type: 'GET_FILINGS_DATA' })).resp).toEqual([{ filingId: 's' }]);

    load({ session: { filingsData: 'bad' } });
    expect((await send({ type: 'GET_FILINGS_DATA' })).resp).toEqual([]);

    load({ session: { filingsData: [{ filingId: 's' }] } });
    chrome.runtime.lastError = { message: 'x' };
    expect((await send({ type: 'GET_FILINGS_DATA' })).resp).toEqual([]);
  });

  it('stores, reads and removes the selected filing', async () => {
    load();
    await send({ type: 'SET_FILING_DATA', data: { filingId: 'z' } });
    expect(chrome.storage.session.data.filingData).toEqual({ filingId: 'z' });
    expect((await send({ type: 'GET_FILING_DATA' })).resp).toEqual({ filingId: 'z' });

    await send({ type: 'SET_FILING_DATA' });
    expect(chrome.storage.session.remove).toHaveBeenCalledWith('filingData', expect.any(Function));
    expect((await send({ type: 'GET_FILING_DATA' })).resp).toBeNull();
  });

  it('reads the selected filing from session storage and handles read errors', async () => {
    load({ session: { filingData: { filingId: 'q' } } });
    expect((await send({ type: 'GET_FILING_DATA' })).resp).toEqual({ filingId: 'q' });

    load({ session: { filingData: { filingId: 'q' } } });
    chrome.runtime.lastError = { message: 'x' };
    expect((await send({ type: 'GET_FILING_DATA' })).resp).toBeNull();
  });

  it('clears cached filings from memory and session storage', async () => {
    load({ session: { filingsData: [{ filingId: 'a' }], filingData: { filingId: 'a' }, bridgeToken: TOKEN } });
    expect((await send({ type: 'CLEAR_FILING_DATA' })).resp).toEqual({ ok: true });
    expect(chrome.storage.session.data).toEqual({ bridgeToken: TOKEN });
  });

  it('answers synchronously without session storage', () => {
    load({ withSession: false });
    const ev = chrome.runtime.onMessage;
    const cases = [
      [{ type: 'SET_BRIDGE_TOKEN', token: TOKEN }, { ok: true }],
      [{ type: 'SET_FILINGS_DATA', data: [{ filingId: 'm' }] }, { ok: true }],
      [{ type: 'GET_FILINGS_DATA' }, [{ filingId: 'm' }]],
      [{ type: 'SET_FILING_DATA', data: { filingId: 'm' } }, { ok: true }],
      [{ type: 'GET_FILING_DATA' }, { filingId: 'm' }],
      [{ type: 'PING' }, { pong: true, v: VERSION }],
      [{ type: 'UNKNOWN' }, { ok: false }],
    ];
    cases.forEach(([msg, expected]) => {
      const { returned, sendResponse } = sendSync(ev, msg);
      expect(returned).toBe(false);
      expect(sendResponse).toHaveBeenCalledWith(expected);
    });
    const { returned, sendResponse } = sendSync(ev, { type: 'CLEAR_FILING_DATA' });
    expect(returned).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });
});

describe('chrome background: FETCH_BRIDGE', () => {
  afterEach(() => {
    delete globalThis.chrome;
    delete globalThis.fetch;
  });

  it('fetches the bridge with the session token and no-store cache', async () => {
    load({ session: { bridgeToken: TOKEN } });
    globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse([{ filingId: 'n' }])));
    const { resp, returned } = await send({ type: 'FETCH_BRIDGE', path: '/filing' });
    expect(returned).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:19876/filing', {
      cache: 'no-store',
      headers: { 'X-LagosFile-Token': TOKEN },
    });
    expect(resp).toEqual({ ok: true, data: [{ filingId: 'n' }] });

    await send({ type: 'FETCH_BRIDGE' });
    expect(globalThis.fetch.mock.calls[1][0]).toBe('http://127.0.0.1:19876/filings');
    expect(chrome.storage.session.get).toHaveBeenCalledTimes(1);
  });

  it('refuses without a token and clears cached filings', async () => {
    load({ session: { filingsData: [{ filingId: 'a' }], filingData: { filingId: 'a' } } });
    globalThis.fetch = vi.fn();
    const { resp } = await send({ type: 'FETCH_BRIDGE' });
    expect(resp.ok).toBe(false);
    expect(resp.status).toBe(403);
    expect(resp.error).toMatch(/No bridge session token/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(chrome.storage.session.data).toEqual({});
  });

  it('treats a session read error as a missing token', async () => {
    load({ session: { bridgeToken: TOKEN } });
    chrome.runtime.lastError = { message: 'x' };
    globalThis.fetch = vi.fn();
    expect((await send({ type: 'FETCH_BRIDGE' })).resp.status).toBe(403);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('refuses without session storage and no in-memory token', async () => {
    load({ withSession: false });
    globalThis.fetch = vi.fn();
    expect((await send({ type: 'FETCH_BRIDGE' })).resp.status).toBe(403);
  });

  it('clears filings on 403 and offline errors but keeps them on other HTTP errors', async () => {
    load({ session: { bridgeToken: TOKEN } });
    await send({ type: 'SET_FILINGS_DATA', data: [{ filingId: 'k' }] });

    globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse(null, 500)));
    let r = await send({ type: 'FETCH_BRIDGE' });
    expect(r.resp).toEqual({ ok: false, status: 500, error: 'Error: HTTP 500' });
    expect(chrome.storage.session.data.filingsData).toEqual([{ filingId: 'k' }]);

    globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse(null, 403)));
    r = await send({ type: 'FETCH_BRIDGE' });
    expect(r.resp.status).toBe(403);
    expect(chrome.storage.session.data.filingsData).toBeUndefined();
    expect((await send({ type: 'GET_FILINGS_DATA' })).resp).toEqual([]);

    await send({ type: 'SET_FILING_DATA', data: { filingId: 'k' } });
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    r = await send({ type: 'FETCH_BRIDGE' });
    expect(r.resp).toEqual({ ok: false, status: 0, error: 'TypeError: Failed to fetch' });
    expect(chrome.storage.session.data.filingData).toBeUndefined();
  });
});

describe('chrome background: INJECT relay', () => {
  afterEach(() => {
    delete globalThis.chrome;
  });

  it('relays INJECT_STEP and INJECT_ALL to the active tab', async () => {
    load();
    const data = { filingId: 'i' };
    let r = await send({ type: 'INJECT_STEP', step: 'income', data, extra: 1 });
    expect(r.returned).toBe(true);
    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true }, expect.any(Function));
    expect(chrome.tabs.sendMessage).toHaveBeenLastCalledWith(
      7,
      { type: 'INJECT_STEP', step: 'income', data },
      expect.any(Function)
    );
    expect(r.resp).toEqual({ ok: true });

    r = await send({ type: 'INJECT_ALL', data, step: 'ignored' });
    expect(chrome.tabs.sendMessage).toHaveBeenLastCalledWith(7, { type: 'INJECT_ALL', data }, expect.any(Function));
  });

  it('reports missing tabs, receiver errors and empty responses', async () => {
    load();
    chrome.tabs.query.mockImplementationOnce((_q, cb) => cb([]));
    expect((await send({ type: 'INJECT_ALL' })).resp).toEqual({ ok: false, reason: 'no_tab' });

    chrome.tabs.sendMessage.mockImplementationOnce((_id, _m, cb) => {
      chrome.runtime.lastError = { message: 'Receiving end does not exist.' };
      cb(undefined);
      chrome.runtime.lastError = undefined;
    });
    expect((await send({ type: 'INJECT_STEP', step: 'wht' })).resp).toEqual({
      ok: false,
      reason: 'Receiving end does not exist.',
    });

    chrome.tabs.sendMessage.mockImplementationOnce((_id, _m, cb) => cb(undefined));
    expect((await send({ type: 'INJECT_STEP', step: 'wht' })).resp).toEqual({ ok: false });
  });
});
