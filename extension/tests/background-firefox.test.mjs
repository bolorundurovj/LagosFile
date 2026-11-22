import { describe, it, expect, afterEach, vi } from 'vitest';
import { createBrowserMock, loadScript, dispatch, sendSync, jsonResponse } from './helpers/ext-mocks.mjs';

const TOKEN = 'abcdef0123456789abcdef0123456789';

let browser;

function load() {
  browser = createBrowserMock();
  globalThis.browser = browser;
  loadScript('firefox', 'background.js');
  return browser;
}

function send(msg) {
  return dispatch(browser.runtime.onMessage, msg);
}

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.browser;
  delete globalThis.fetch;
});

describe('firefox background: lifecycle', () => {
  it('purges legacy on-disk storage on install and startup', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    load();
    browser.runtime.onInstalled.fire();
    expect(console.log).toHaveBeenCalledWith('[LagosFile] v1.3.0 installed.');
    expect(browser.storage.local.remove).toHaveBeenCalledWith(['filingsData', 'filingData', 'bridgeToken']);

    browser.storage.local.remove.mockImplementationOnce(() => Promise.reject(new Error('denied')));
    browser.runtime.onStartup.fire();
    expect(browser.storage.local.remove).toHaveBeenCalledTimes(2);
    await Promise.resolve();
  });

  it('skips the purge when storage.local is unavailable', () => {
    load();
    delete browser.storage.local;
    expect(() => browser.runtime.onStartup.fire()).not.toThrow();
  });
});

describe('firefox background: in-memory state', () => {
  it('keeps token and filings in memory only', () => {
    load();
    const ev = browser.runtime.onMessage;
    const list = [{ filingId: 'a' }];
    const cases = [
      [{ type: 'SET_BRIDGE_TOKEN', token: TOKEN }, { ok: true }],
      [{ type: 'SET_FILINGS_DATA', data: list }, { ok: true }],
      [{ type: 'GET_FILINGS_DATA' }, list],
      [{ type: 'SET_FILING_DATA', data: list[0] }, { ok: true }],
      [{ type: 'GET_FILING_DATA' }, list[0]],
      [{ type: 'CLEAR_FILING_DATA' }, { ok: true }],
      [{ type: 'GET_FILINGS_DATA' }, []],
      [{ type: 'GET_FILING_DATA' }, null],
      [{ type: 'SET_FILINGS_DATA', data: 'x' }, { ok: true }],
      [{ type: 'GET_FILINGS_DATA' }, []],
      [{ type: 'SET_FILING_DATA' }, { ok: true }],
      [{ type: 'GET_FILING_DATA' }, null],
      [{ type: 'PING' }, { pong: true, v: '1.3.0' }],
      [{ type: 'NOPE' }, { ok: false }],
    ];
    cases.forEach(([msg, expected]) => {
      const { returned, sendResponse } = sendSync(ev, msg);
      expect(returned).toBe(false);
      expect(sendResponse).toHaveBeenCalledWith(expected);
    });
    expect(browser.storage.local.remove).not.toHaveBeenCalled();
  });

  it('swallows sendResponse errors when the caller has gone away', () => {
    load();
    const thrower = vi.fn(() => {
      throw new Error('closed');
    });
    expect(() => browser.runtime.onMessage.listeners[0]({ type: 'PING' }, {}, thrower)).not.toThrow();
    expect(thrower).toHaveBeenCalledTimes(1);
  });
});

describe('firefox background: FETCH_BRIDGE', () => {
  it('refuses without a token and clears filings', async () => {
    load();
    globalThis.fetch = vi.fn();
    await send({ type: 'SET_FILINGS_DATA', data: [{ filingId: 'a' }] });
    const { resp, returned } = await send({ type: 'FETCH_BRIDGE' });
    expect(returned).toBe(true);
    expect(resp.status).toBe(403);
    expect(resp.error).toMatch(/No bridge session token/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect((await send({ type: 'GET_FILINGS_DATA' })).resp).toEqual([]);

    await send({ type: 'SET_BRIDGE_TOKEN', token: TOKEN });
    await send({ type: 'SET_BRIDGE_TOKEN', token: '' });
    expect((await send({ type: 'FETCH_BRIDGE' })).resp.status).toBe(403);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('fetches with the token header and default path', async () => {
    load();
    await send({ type: 'SET_BRIDGE_TOKEN', token: TOKEN });
    globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse({ filingId: 'b' })));
    expect((await send({ type: 'FETCH_BRIDGE', path: '/filing' })).resp).toEqual({
      ok: true,
      data: { filingId: 'b' },
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:19876/filing', {
      cache: 'no-store',
      headers: { 'X-LagosFile-Token': TOKEN },
    });
    await send({ type: 'FETCH_BRIDGE' });
    expect(globalThis.fetch.mock.calls[1][0]).toBe('http://127.0.0.1:19876/filings');
  });

  it('clears filings on 403 or network failure and keeps them on other errors', async () => {
    load();
    await send({ type: 'SET_BRIDGE_TOKEN', token: TOKEN });
    await send({ type: 'SET_FILINGS_DATA', data: [{ filingId: 'c' }] });
    await send({ type: 'SET_FILING_DATA', data: { filingId: 'c' } });

    globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse(null, 502)));
    expect((await send({ type: 'FETCH_BRIDGE' })).resp).toEqual({ ok: false, status: 502, error: 'Error: HTTP 502' });
    expect((await send({ type: 'GET_FILINGS_DATA' })).resp).toEqual([{ filingId: 'c' }]);

    globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse(null, 403)));
    expect((await send({ type: 'FETCH_BRIDGE' })).resp.status).toBe(403);
    expect((await send({ type: 'GET_FILINGS_DATA' })).resp).toEqual([]);
    expect((await send({ type: 'GET_FILING_DATA' })).resp).toBeNull();

    await send({ type: 'SET_FILINGS_DATA', data: [{ filingId: 'd' }] });
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('NetworkError')));
    expect((await send({ type: 'FETCH_BRIDGE' })).resp).toEqual({
      ok: false,
      status: 0,
      error: 'TypeError: NetworkError',
    });
    expect((await send({ type: 'GET_FILINGS_DATA' })).resp).toEqual([]);
  });
});

describe('firefox background: INJECT relay', () => {
  it('relays step and all-tab injections to the active tab', async () => {
    load();
    const data = { filingId: 'e' };
    let r = await send({ type: 'INJECT_STEP', step: 'reliefs', data });
    expect(r.returned).toBe(true);
    expect(browser.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(browser.tabs.sendMessage).toHaveBeenLastCalledWith(9, { type: 'INJECT_STEP', step: 'reliefs', data });
    expect(r.resp).toEqual({ ok: true });

    r = await send({ type: 'INJECT_ALL', data });
    expect(browser.tabs.sendMessage).toHaveBeenLastCalledWith(9, { type: 'INJECT_ALL', data });
  });

  it('reports no tab, no receiver, empty results and query failures', async () => {
    load();
    browser.tabs.query.mockResolvedValueOnce([]);
    expect((await send({ type: 'INJECT_ALL' })).resp).toEqual({ ok: false, reason: 'no_tab' });

    browser.tabs.sendMessage.mockRejectedValueOnce(new Error('no listener'));
    expect((await send({ type: 'INJECT_ALL' })).resp).toEqual({ ok: false, reason: 'no_receiver' });

    browser.tabs.sendMessage.mockResolvedValueOnce(undefined);
    expect((await send({ type: 'INJECT_ALL' })).resp).toEqual({ ok: false });

    browser.tabs.query.mockRejectedValueOnce(new Error('tabs gone'));
    expect((await send({ type: 'INJECT_STEP', step: 'wht' })).resp).toEqual({
      ok: false,
      reason: 'Error: tabs gone',
    });
  });
});
