(function () {
  'use strict';

  // Run at document_start so #lagosfile=<token> is captured and stored in the
  // background script BEFORE LIRS eTax Angular auth guards redirect to /login
  // and strip the URL hash fragment.
  const TOKEN_REGEX = /^[a-fA-F0-9]{16,128}$/;

  function extractToken(hash) {
    if (!hash || typeof hash !== 'string') return null;
    const cleaned = hash.replace(/^#/, '');
    const parts = cleaned.split('&');
    for (let i = 0; i < parts.length; i++) {
      const idx = parts[i].indexOf('=');
      if (idx === -1) continue;
      const k = parts[i].slice(0, idx).trim();
      const v = parts[i].slice(idx + 1).trim();
      if (k === 'lagosfile' && TOKEN_REGEX.test(v)) {
        return v;
      }
    }
    return null;
  }

  function sendTokenOnce(token) {
    return new Promise(function (resolve) {
      try {
        if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
          browser.runtime
            .sendMessage({ type: 'SET_BRIDGE_TOKEN', token: token })
            .then(function (resp) { resolve(Boolean(resp?.ok)); })
            .catch(function () { resolve(false); });
        } else if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: 'SET_BRIDGE_TOKEN', token: token }, function (resp) {
            if (chrome.runtime.lastError) {
              resolve(false);
              return;
            }
            resolve(Boolean(resp?.ok));
          });
        } else {
          resolve(false);
        }
      } catch (_) {
        resolve(false);
      }
    });
  }

  function capture() {
    const token = extractToken(window.location.hash);
    if (!token) return Promise.resolve(false);

    // Send the token to the background/service-worker BEFORE stripping the hash;
    // retry once if an MV3 service worker is still waking up.
    return sendTokenOnce(token)
      .then(function (ok) {
        if (ok) return true;
        return new Promise(function (resolve) {
          setTimeout(function () {
            void sendTokenOnce(token).then(resolve);
          }, 150);
        });
      })
      .then(function (ok) {
        if (ok) {
          try {
            const cleanUrl = window.location.pathname + window.location.search;
            window.history.replaceState(null, '', cleanUrl);
          } catch (_) {}
        }
        return ok;
      });
  }

  window.__lagosFileTokenPromise = capture();
})();
