const EXT_VERSION = '1.3.0'; // x-release-please-version
const BRIDGE_URL = 'http://127.0.0.1:19876';
let cachedFilings = [];
let currentFiling = null;
let bridgeToken = null;

// Ephemeral session storage (in-memory only, cleared on browser exit, never persisted to disk).
function consumeLastError() {
  return chrome.runtime.lastError;
}

function sessionStore() {
  return chrome.storage?.session || null;
}

function purgeLegacyLocalStorage() {
  if (chrome.storage?.local) {
    chrome.storage.local.remove(['filingsData', 'filingData', 'bridgeToken'], consumeLastError);
  }
}

function restoreFromSession(cb) {
  const store = sessionStore();
  if (!store) {
    if (cb) cb();
    return;
  }
  store.get(['filingsData', 'filingData', 'bridgeToken'], (r) => {
    if (chrome.runtime.lastError || !r) {
      if (cb) cb();
      return;
    }
    if (r.filingsData) cachedFilings = r.filingsData;
    if (r.filingData) currentFiling = r.filingData;
    if (r.bridgeToken) bridgeToken = r.bridgeToken;
    if (cb) cb();
  });
}

function clearCachedFilings(cb) {
  cachedFilings = [];
  currentFiling = null;
  const store = sessionStore();
  if (store) {
    store.remove(['filingsData', 'filingData'], () => {
      consumeLastError();
      if (cb) cb();
    });
  } else if (cb) {
    cb();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[LagosFile] v' + EXT_VERSION + ' installed.');
  purgeLegacyLocalStorage();
  restoreFromSession();
});

chrome.runtime.onStartup.addListener(() => {
  purgeLegacyLocalStorage();
  restoreFromSession();
});

function withToken(fn) {
  if (bridgeToken) {
    fn(bridgeToken);
    return;
  }
  const store = sessionStore();
  if (!store) {
    fn(null);
    return;
  }
  store.get(['bridgeToken'], (r) => {
    bridgeToken = !chrome.runtime.lastError && r?.bridgeToken ? r.bridgeToken : null;
    fn(bridgeToken);
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const store = sessionStore();
  switch (msg.type) {
    case 'SET_BRIDGE_TOKEN':
      bridgeToken = typeof msg.token === 'string' && msg.token.length > 0 ? msg.token : null;
      if (!store) {
        sendResponse({ ok: true });
        return false;
      }
      if (bridgeToken) {
        store.set({ bridgeToken }, () => sendResponse({ ok: true }));
      } else {
        store.remove('bridgeToken', () => sendResponse({ ok: true }));
      }
      return true;

    case 'SET_FILINGS_DATA':
      cachedFilings = Array.isArray(msg.data) ? msg.data : [];
      if (!store) {
        sendResponse({ ok: true });
        return false;
      }
      store.set({ filingsData: cachedFilings }, () => sendResponse({ ok: true }));
      return true;

    case 'GET_FILINGS_DATA':
      if (cachedFilings.length > 0 || !store) {
        sendResponse(cachedFilings);
        return false;
      }
      store.get(['filingsData'], (r) => {
        cachedFilings = !chrome.runtime.lastError && r && Array.isArray(r.filingsData) ? r.filingsData : [];
        sendResponse(cachedFilings);
      });
      return true;

    case 'SET_FILING_DATA':
      currentFiling = msg.data ?? null;
      if (!store) {
        sendResponse({ ok: true });
        return false;
      }
      if (currentFiling) {
        store.set({ filingData: currentFiling }, () => sendResponse({ ok: true }));
      } else {
        store.remove('filingData', () => sendResponse({ ok: true }));
      }
      return true;

    case 'GET_FILING_DATA':
      if (currentFiling || !store) {
        sendResponse(currentFiling);
        return false;
      }
      store.get(['filingData'], (r) => {
        currentFiling = !chrome.runtime.lastError && r ? r.filingData || null : null;
        sendResponse(currentFiling);
      });
      return true;

    case 'CLEAR_FILING_DATA':
      clearCachedFilings(() => sendResponse({ ok: true }));
      return true;

    // Proxy bridge fetches through the service worker with the per-session token
    // so content scripts never touch 127.0.0.1 directly from the page context.
    case 'FETCH_BRIDGE':
      withToken((token) => {
        if (!token) {
          clearCachedFilings(() => {
            sendResponse({
              ok: false,
              status: 403,
              error: 'No bridge session token. Click "File with LIRS" in LagosFile to connect.',
            });
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
          .catch((err) => {
            const status = err?.status || 0;
            // Clear cached filings whenever the bridge rejects auth or is offline (vault locked).
            if (status === 403 || status === 0) {
              clearCachedFilings(() => {
                sendResponse({ ok: false, status, error: String(err) });
              });
            } else {
              sendResponse({ ok: false, status, error: String(err) });
            }
          });
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
