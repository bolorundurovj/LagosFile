// LagosFile for LIRS -- Background (Firefox MV2)
// Keeps filing data and the per-session bridge token strictly in memory (never written
// to storage.local on disk), proxies authenticated bridge fetches, and relays INJECT_* messages.

const EXT_VERSION = '1.3.0';
const BRIDGE_URL = 'http://127.0.0.1:19876';
let cachedFilings = [];
let currentFiling = null;
let bridgeToken = null;

function purgeLegacyLocalStorage() {
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
    browser.storage.local
      .remove(['filingsData', 'filingData', 'bridgeToken'])
      .catch(function () {});
  }
}

browser.runtime.onInstalled.addListener(function () {
  console.log('[LagosFile] v' + EXT_VERSION + ' installed.');
  purgeLegacyLocalStorage();
});

browser.runtime.onStartup.addListener(function () {
  purgeLegacyLocalStorage();
});

browser.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
  let responded = false;
  function safeRespond(payload) {
    if (responded) return;
    responded = true;
    try {
      sendResponse(payload);
    } catch (_) {
      // Popup or tab may have closed while the async request was in flight.
    }
  }

  switch (msg.type) {
    case 'SET_BRIDGE_TOKEN':
      bridgeToken = typeof msg.token === 'string' && msg.token.length > 0 ? msg.token : null;
      safeRespond({ ok: true });
      return false;

    case 'SET_FILINGS_DATA':
      cachedFilings = Array.isArray(msg.data) ? msg.data : [];
      safeRespond({ ok: true });
      return false;

    case 'GET_FILINGS_DATA':
      safeRespond(cachedFilings);
      return false;

    case 'SET_FILING_DATA':
      currentFiling = msg.data != null ? msg.data : null;
      safeRespond({ ok: true });
      return false;

    case 'GET_FILING_DATA':
      safeRespond(currentFiling);
      return false;

    case 'CLEAR_FILING_DATA':
      cachedFilings = [];
      currentFiling = null;
      safeRespond({ ok: true });
      return false;

    case 'FETCH_BRIDGE':
      Promise.resolve()
        .then(function () {
          if (!bridgeToken) {
            cachedFilings = [];
            currentFiling = null;
            return {
              ok: false,
              status: 403,
              error: 'No bridge session token. Click "File with LIRS" in LagosFile to connect.',
            };
          }
          return fetch(BRIDGE_URL + (msg.path || '/filings'), {
            cache: 'no-store',
            headers: { 'X-LagosFile-Token': bridgeToken },
          })
            .then(function (r) {
              if (!r.ok) {
                const err = new Error('HTTP ' + r.status);
                err.status = r.status;
                throw err;
              }
              return r.json();
            })
            .then(function (data) {
              return { ok: true, data: data };
            });
        })
        .then(function (res) {
          safeRespond(res);
        })
        .catch(function (err) {
          const status = err && err.status ? err.status : 0;
          if (status === 403 || status === 0) {
            cachedFilings = [];
            currentFiling = null;
          }
          safeRespond({ ok: false, status: status, error: String(err) });
        });
      return true;

    case 'INJECT_STEP':
    case 'INJECT_ALL':
      browser.tabs
        .query({ active: true, currentWindow: true })
        .then(function (tabs) {
          if (!tabs[0]) return { ok: false, reason: 'no_tab' };
          const payload =
            msg.type === 'INJECT_ALL'
              ? { type: 'INJECT_ALL', data: msg.data }
              : { type: 'INJECT_STEP', step: msg.step, data: msg.data };
          return browser.tabs.sendMessage(tabs[0].id, payload).catch(function () {
            return { ok: false, reason: 'no_receiver' };
          });
        })
        .then(function (result) {
          safeRespond(result || { ok: false });
        })
        .catch(function (err) {
          safeRespond({ ok: false, reason: String(err) });
        });
      return true;

    case 'PING':
      safeRespond({ pong: true, v: EXT_VERSION });
      return false;

    default:
      safeRespond({ ok: false });
      return false;
  }
});
