(function () {
  'use strict';

  // Run at document_start so #lagosfile=<token> is captured and stored in the
  // background script BEFORE LIRS eTax Angular auth guards redirect to /login
  // and strip the URL hash fragment.
  function extractToken(hash) {
    if (!hash || typeof hash !== 'string') return null;
    const cleaned = hash.replace(/^#/, '');
    const parts = cleaned.split('&');
    for (let i = 0; i < parts.length; i++) {
      const idx = parts[i].indexOf('=');
      if (idx === -1) continue;
      const k = parts[i].slice(0, idx).trim();
      const v = parts[i].slice(idx + 1).trim();
      if (k === 'lagosfile' && v.length > 0) {
        try {
          return decodeURIComponent(v);
        } catch (_) {
          return v;
        }
      }
    }
    return null;
  }

  function capture() {
    const token = extractToken(window.location.hash);
    if (!token) return;
    try {
      const cleanUrl = window.location.pathname + window.location.search;
      window.history.replaceState(null, '', cleanUrl);
    } catch (_) {}
    try {
      if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
        browser.runtime.sendMessage({ type: 'SET_BRIDGE_TOKEN', token: token }).catch(function () {});
      } else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'SET_BRIDGE_TOKEN', token: token }, function () {
          void chrome.runtime.lastError;
        });
      }
    } catch (_) {}
  }

  capture();
})();
