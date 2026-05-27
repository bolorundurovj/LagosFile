// ── LagosFile for LIRS — Background (Chrome MV3) ─────────
// Caches filing data and relays INJECT_STEP to the content script.

const EXT_VERSION = '1.1.0';
let cachedFilings = [];   // array of PendingFiling
let currentFiling = null; // the currently selected PendingFiling

chrome.runtime.onInstalled.addListener(() => {
  console.log('[LagosFile] v' + EXT_VERSION + ' installed.');
  chrome.storage.local.get(['filingsData', 'filingData'], (r) => {
    if (r.filingsData) cachedFilings = r.filingsData;
    if (r.filingData)  currentFiling = r.filingData;
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {

    // ── Cache the full list of filings ──────────────────────
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

    // ── Single filing (backward compat) ─────────────────────
    case 'SET_FILING_DATA':
      currentFiling = msg.data ?? null;
      if (currentFiling) {
        chrome.storage.local.set({ filingData: currentFiling }, () => sendResponse({ ok: true }));
      } else {
        chrome.storage.local.remove('filingData', () => sendResponse({ ok: true }));
      }
      return true;

    case 'GET_FILING_DATA':
      if (currentFiling) sendResponse(currentFiling);
      else {
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

    // ── Relay injection to content script ───────────────────
    case 'INJECT_STEP':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) { sendResponse({ ok: false, reason: 'no_tab' }); return; }
        chrome.tabs.sendMessage(
          tabs[0].id,
          { type: 'INJECT_STEP', step: msg.step, data: msg.data },
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
