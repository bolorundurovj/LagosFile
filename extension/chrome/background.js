const EXT_VERSION = '1.3.0';
const BRIDGE_URL = 'http://127.0.0.1:19876';
let cachedFilings = [];
let currentFiling = null;
let bridgeToken = null;

function restoreFromStorage(cb) {
  chrome.storage.local.get(['filingsData', 'filingData', 'bridgeToken'], (r) => {
    if (r.filingsData) cachedFilings = r.filingsData;
    if (r.filingData) currentFiling = r.filingData;
    if (r.bridgeToken) bridgeToken = r.bridgeToken;
    if (cb) cb();
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[LagosFile] v' + EXT_VERSION + ' installed.');
  restoreFromStorage();
});

chrome.runtime.onStartup.addListener(() => {
  restoreFromStorage();
});

function withToken(fn) {
  if (bridgeToken) {
    fn(bridgeToken);
    return;
  }
  chrome.storage.local.get(['bridgeToken'], (r) => {
    bridgeToken = r.bridgeToken || null;
    fn(bridgeToken);
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case 'SET_BRIDGE_TOKEN':
      bridgeToken = typeof msg.token === 'string' && msg.token.length > 0 ? msg.token : null;
      if (bridgeToken) {
        chrome.storage.local.set({ bridgeToken }, () => sendResponse({ ok: true }));
      } else {
        chrome.storage.local.remove('bridgeToken', () => sendResponse({ ok: true }));
      }
      return true;

    case 'SET_FILINGS_DATA':
      cachedFilings = msg.data || [];
      chrome.storage.local.set({ filingsData: cachedFilings }, () => sendResponse({ ok: true }));
      return true;

    case 'GET_FILINGS_DATA':
      if (cachedFilings.length > 0) {
        sendResponse(cachedFilings);
      } else {
        chrome.storage.local.get(['filingsData'], (r) => {
          cachedFilings = r.filingsData || [];
          sendResponse(cachedFilings);
        });
      }
      return true;

    case 'SET_FILING_DATA':
      currentFiling = msg.data ?? null;
      if (currentFiling) {
        chrome.storage.local.set({ filingData: currentFiling }, () => sendResponse({ ok: true }));
      } else {
        chrome.storage.local.remove('filingData', () => sendResponse({ ok: true }));
      }
      return true;

    case 'GET_FILING_DATA':
      if (currentFiling) {
        sendResponse(currentFiling);
      } else {
        chrome.storage.local.get(['filingData'], (r) => {
          currentFiling = r.filingData || null;
          sendResponse(currentFiling);
        });
      }
      return true;

    case 'CLEAR_FILING_DATA':
      cachedFilings = [];
      currentFiling = null;
      chrome.storage.local.remove(['filingsData', 'filingData'], () => sendResponse({ ok: true }));
      return true;

    // Proxy bridge fetches through the service worker with the per-session token
    // so content scripts never touch 127.0.0.1 directly from the page context.
    case 'FETCH_BRIDGE':
      withToken((token) => {
        if (!token) {
          sendResponse({
            ok: false,
            status: 403,
            error: 'No bridge session token. Click "File with LIRS" in LagosFile to connect.',
          });
          return;
        }
        const path = msg.path || '/filings';
        fetch(BRIDGE_URL + path, {
          cache: 'no-store',
          headers: { 'X-LagosFile-Token': token },
        })
          .then((r) => {
            if (!r.ok) {
              const err = new Error('HTTP ' + r.status);
              err.status = r.status;
              throw err;
            }
            return r.json();
          })
          .then((data) => sendResponse({ ok: true, data }))
          .catch((err) => sendResponse({ ok: false, status: err.status || 0, error: String(err) }));
      });
      return true;

    case 'INJECT_STEP':
    case 'INJECT_ALL':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) {
          sendResponse({ ok: false, reason: 'no_tab' });
          return;
        }
        chrome.tabs.sendMessage(
          tabs[0].id,
          msg.type === 'INJECT_ALL'
            ? { type: 'INJECT_ALL', data: msg.data }
            : { type: 'INJECT_STEP', step: msg.step, data: msg.data },
          (resp) => {
            if (chrome.runtime.lastError) {
              sendResponse({ ok: false, reason: chrome.runtime.lastError.message });
              return;
            }
            sendResponse(resp || { ok: false });
          }
        );
      });
      return true;

    case 'PING':
      sendResponse({ pong: true, v: EXT_VERSION });
      return false;

    default:
      sendResponse({ ok: false });
      return false;
  }
});
