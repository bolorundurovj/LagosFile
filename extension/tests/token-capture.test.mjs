import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createChromeMock, createBrowserMock, loadScript } from './helpers/ext-mocks.mjs';

const TOKEN = 'abcdef0123456789abcdef0123456789';

function setUrl(path) {
  window.history.replaceState(null, '', path);
}

function capture() {
  loadScript('chrome', 'token-capture.js');
  return window.__lagosFileTokenPromise;
}

describe('token-capture', () => {
  beforeEach(() => {
    setUrl('/');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete globalThis.chrome;
    delete globalThis.browser;
    delete window.__lagosFileTokenPromise;
    setUrl('/');
  });

  it('resolves false and sends nothing when the hash has no valid token', async () => {
    globalThis.chrome = createChromeMock();
    for (const hash of ['', '#foo=1', '#lagosfile=xyz', '#lagosfile', `#other=${TOKEN}`]) {
      setUrl('/dash' + hash);
      expect(await capture()).toBe(false);
    }
    expect(globalThis.chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(window.location.hash).toBe(`#other=${TOKEN}`);
  });

  it('sends the token via chrome.runtime and strips the hash, keeping path and query', async () => {
    const chrome = createChromeMock();
    chrome.runtime.sendMessage.mockImplementation((_m, cb) => cb({ ok: true }));
    globalThis.chrome = chrome;
    setUrl(`/portal/calc?x=1#a=b&lagosfile=${TOKEN}&c=d`);
    expect(await capture()).toBe(true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { type: 'SET_BRIDGE_TOKEN', token: TOKEN },
      expect.any(Function)
    );
    expect(window.location.pathname + window.location.search).toBe('/portal/calc?x=1');
    expect(window.location.hash).toBe('');
  });

  it('retries once after 150ms when the service worker is not ready', async () => {
    vi.useFakeTimers();
    const chrome = createChromeMock();
    chrome.runtime.sendMessage
      .mockImplementationOnce((_m, cb) => {
        chrome.runtime.lastError = { message: 'Could not establish connection' };
        cb(undefined);
        chrome.runtime.lastError = undefined;
      })
      .mockImplementationOnce((_m, cb) => cb({ ok: true }));
    globalThis.chrome = chrome;
    setUrl(`/x#lagosfile=${TOKEN}`);
    const p = capture();
    await vi.advanceTimersByTimeAsync(149);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toBe(true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(window.location.hash).toBe('');
  });

  it('keeps the hash when both attempts fail', async () => {
    vi.useFakeTimers();
    const chrome = createChromeMock();
    chrome.runtime.sendMessage.mockImplementation((_m, cb) => cb({ ok: false }));
    globalThis.chrome = chrome;
    setUrl(`/x#lagosfile=${TOKEN}`);
    const p = capture();
    await vi.advanceTimersByTimeAsync(150);
    expect(await p).toBe(false);
    expect(window.location.hash).toBe(`#lagosfile=${TOKEN}`);
  });

  it('uses browser.runtime promises when available', async () => {
    const browser = createBrowserMock();
    globalThis.browser = browser;
    setUrl(`/x#lagosfile=${TOKEN}`);
    expect(await capture()).toBe(true);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'SET_BRIDGE_TOKEN', token: TOKEN });
    expect(window.location.hash).toBe('');
  });

  it('treats browser.runtime rejection as failure', async () => {
    vi.useFakeTimers();
    const browser = createBrowserMock();
    browser.runtime.sendMessage.mockRejectedValue(new Error('no bg'));
    globalThis.browser = browser;
    setUrl(`/x#lagosfile=${TOKEN}`);
    const p = capture();
    await vi.advanceTimersByTimeAsync(150);
    expect(await p).toBe(false);
    expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('resolves false when no extension runtime exists or sending throws', async () => {
    vi.useFakeTimers();
    setUrl(`/x#lagosfile=${TOKEN}`);
    let p = capture();
    await vi.advanceTimersByTimeAsync(150);
    expect(await p).toBe(false);

    const chrome = createChromeMock();
    chrome.runtime.sendMessage.mockImplementation(() => {
      throw new Error('context invalidated');
    });
    globalThis.chrome = chrome;
    p = capture();
    await vi.advanceTimersByTimeAsync(150);
    expect(await p).toBe(false);
    expect(window.location.hash).toBe(`#lagosfile=${TOKEN}`);
  });

  it('still reports success if replaceState throws', async () => {
    const chrome = createChromeMock();
    chrome.runtime.sendMessage.mockImplementation((_m, cb) => cb({ ok: true }));
    globalThis.chrome = chrome;
    setUrl(`/x#lagosfile=${TOKEN}`);
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(await capture()).toBe(true);
  });
});
