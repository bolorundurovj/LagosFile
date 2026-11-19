// LagosFile for LIRS -- Background (Firefox MV2)
// Caches filing data, stores the per-session bridge token, proxies authenticated
// bridge fetches, and relays INJECT_STEP / INJECT_ALL to the content script.

const EXT_VERSION = '1.3.0';
const BRIDGE_URL = 'http://127.0.0.1:19876';
let cachedFilings = [];
let currentFiling = null;
let bridgeToken = null;

function restoreFromStorage() {
  browser.storage.local.get(['filingsData', 'filingData', 'bridgeToken']).then(function (r) {
    if (r.filingsData) cachedFilings = r.filingsData;
    if (r.filingData) currentFiling = r.filingData;
    if (r.bridgeToken) bridgeToken = r.bridgeToken;
  });
}

browser.runtime.onInstalled.addListener(function () {
  console.log('[LagosFile] v' + EXT_VERSION + ' installed.');
  restoreFromStorage();
});

browser.runtime.onStartup.addListener(function () {
  restoreFromStorage();
});

function getToken() {
  if (bridgeToken) return Promise.resolve(bridgeToken);
  return browser.storage.local.get(['bridgeToken']).then(function (r) {
    bridgeToken = r.bridgeToken || null;
    return bridgeToken;
  });
}

browser.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
  switch (msg.type) {
    case 'SET_BRIDGE_TOKEN':
      bridgeToken = typeof msg.token === 'string' && msg.token.length > 0 ? msg.token : null;
      if (bridgeToken) {
        browser.storage.local.set({ bridgeToken: bridgeToken }).then(function () {
          sendResponse({ ok: true });
        });
      } else {
        browser.storage.local.remove('bridgeToken').then(function () {
          sendResponse({ ok: true });
        });
      }
      return true;

    case 'SET_FILINGS_DATA':
      cachedFilings = msg.data || [];
      browser.storage.local.set({ filingsData: cachedFilings }).then(function () {
        sendResponse({ ok: true });
      });
      return true;

    case 'GET_FILINGS_DATA':
      if (cachedFilings.length > 0) {
        sendResponse(cachedFilings);
      } else {
        browser.storage.local.get(['filingsData']).then(function (r) {
          cachedFilings = r.filingsData || [];
          sendResponse(cachedFilings);
        });
      }
      return true;

    case 'SET_FILING_DATA':
      currentFiling = msg.data != null ? msg.data : null;
      if (currentFiling) {
        browser.storage.local.set({ filingData: currentFiling }).then(function () {
          sendResponse({ ok: true });
        });
      } else {
        browser.storage.local.remove('filingData').then(function () {
          sendResponse({ ok: true });
        });
      }
      return true;

    case 'GET_FILING_DATA':
      if (currentFiling) {
        sendResponse(currentFiling);
      } else {
        browser.storage.local.get(['filingData']).then(function (r) {
          currentFiling = r.filingData || null;
          sendResponse(currentFiling);
        });
      }
      return true;

    case 'CLEAR_FILING_DATA':
      cachedFilings = [];
      currentFiling = null;
      browser.storage.local.remove(['filingsData', 'filingData']).then(function () {
        sendResponse({ ok: true });
      });
      return true;

    case 'FETCH_BRIDGE':
      getToken()
        .then(function (token) {
          if (!token) {
            return {
              ok: false,
              status: 403,
              error: 'No bridge session token. Click "File with LIRS" in LagosFile to connect.',
            };
          }
          return fetch(BRIDGE_URL + (msg.path || '/filings'), {
            cache: 'no-store',
            headers: { 'X-LagosFile-Token': token },
          })
            .then(function (r) {
              if (!r.ok) {
                const err = new Error('HTTP ' + r.status);
                err.status = r.status;
                throw err;
              }
              return r.json();
            })
            .then(function (data) { return { ok: true, data: data }; });
        })
        .then(function (res) { sendResponse(res); })
        .catch(function (err) { sendResponse({ ok: false, status: err.status || 0, error: String(err) }); });
      return true;

    case 'INJECT_STEP':
    case 'INJECT_ALL':
      browser.tabs.query({ active: true, currentWindow: true })
        .then(function (tabs) {
          if (!tabs[0]) return { ok: false, reason: 'no_tab' };
          const payload = msg.type === 'INJECT_ALL'
            ? { type: 'INJECT_ALL', data: msg.data }
            : { type: 'INJECT_STEP', step: msg.step, data: msg.data };
          return browser.tabs.sendMessage(tabs[0].id, payload)
            .catch(function () { return { ok: false, reason: 'no_receiver' }; });
        })
        .then(function (result) { sendResponse(result); })
        .catch(function (err) { sendResponse({ ok: false, reason: String(err) }); });
      return true;

    case 'PING':
      sendResponse({ pong: true, v: EXT_VERSION });
      return false;

    default:
      sendResponse({ ok: false });
      return false;
  }
});
