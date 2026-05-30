// LagosFile for LIRS -- Background (Firefox MV2)
// Caches filing data, proxies bridge fetches (bypasses mixed-content),
// and relays INJECT_STEP to the content script.
// persistent:true keeps the background page alive so async fetch() responses
// are never dropped mid-flight (non-persistent event pages can be suspended).

const EXT_VERSION = '1.1.0';
const BRIDGE_URL  = 'http://127.0.0.1:19876';
let cachedFilings = [];
let currentFiling = null;

function restoreFromStorage() {
  browser.storage.local.get(['filingsData', 'filingData']).then(function (r) {
    if (r.filingsData) cachedFilings = r.filingsData;
    if (r.filingData)  currentFiling  = r.filingData;
  });
}

browser.runtime.onInstalled.addListener(function () {
  console.log('[LagosFile] v' + EXT_VERSION + ' installed.');
  restoreFromStorage();
});

browser.runtime.onStartup.addListener(function () {
  restoreFromStorage();
});

browser.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
  switch (msg.type) {

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

    // Proxy bridge fetches so content scripts avoid mixed-content blocking.
    // (https LIRS page cannot fetch http://127.0.0.1 directly in Firefox)
    // Background has unrestricted network access via the manifest permission.
    case 'FETCH_BRIDGE':
      fetch(BRIDGE_URL + (msg.path || '/filings'), { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (data) { sendResponse({ ok: true, data: data }); })
        .catch(function (err) { sendResponse({ ok: false, error: String(err) }); });
      return true;

    case 'INJECT_STEP':
      browser.tabs.query({ active: true, currentWindow: true })
        .then(function (tabs) {
          if (!tabs[0]) return { ok: false, reason: 'no_tab' };
          return browser.tabs.sendMessage(tabs[0].id, {
            type: 'INJECT_STEP',
            step: msg.step,
            data: msg.data,
          }).catch(function () { return { ok: false, reason: 'no_receiver' }; });
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
