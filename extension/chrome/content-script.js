(function () {
  'use strict';

  // Prevent double injection on SPA navigations
  if (document.getElementById('__lf_panel_host')) return;

  const core = window.LagosFileCore;
  const runtime = (typeof browser !== 'undefined') ? browser.runtime : chrome.runtime;

  let allFilings = [];
  let selectedFiling = null;
  let panelOpen = false;

  function sendMsg(msg) {
    return new Promise(function (resolve) {
      let settled = false;
      const done = function (resp) {
        if (settled) return;
        settled = true;
        resolve(resp);
      };
      try {
        if (typeof browser !== 'undefined') {
          browser.runtime.sendMessage(msg).then(done).catch(function () { done(null); });
        } else {
          chrome.runtime.sendMessage(msg, done);
        }
      } catch (_) {
        done(null);
      }
    });
  }

  // Capture per-session bridge token from URL fragment (#lagosfile=<token>)
  // and pass it to the background script, then strip it from the URL bar once stored.
  function captureBridgeTokenFromHash() {
    if (!core) return Promise.resolve(false);
    const token = core.extractTokenFromHash(window.location.hash);
    if (!token) return Promise.resolve(false);
    return sendMsg({ type: 'SET_BRIDGE_TOKEN', token: token }).then(function (resp) {
      if (resp?.ok) {
        try {
          const cleanUrl = window.location.pathname + window.location.search;
          window.history.replaceState(null, '', cleanUrl);
        } catch (_) {}
        return true;
      }
      return false;
    });
  }

  const tokenCapturePromise = Promise.resolve(window.__lagosFileTokenPromise || false).then(
    function (capturedEarly) {
      if (capturedEarly) return true;
      return captureBridgeTokenFromHash();
    }
  );
  window.addEventListener('hashchange', function () {
    void captureBridgeTokenFromHash().then(function (captured) {
      if (captured) {
        allFilings = [];
        selectedFiling = null;
        if (panelOpen) {
          renderLoading();
          void loadFilings();
        }
      }
    });
  });

  const host = document.createElement('div');
  host.id = '__lf_panel_host';
  Object.assign(host.style, {
    position: 'fixed',
    right: '14px',
    bottom: '80px',
    zIndex: '2147483646',
    display: 'block',
  });
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  #toggle {
    width: 44px; height: 44px;
    background: #001E40; color: #fff;
    border: none; border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 12px rgba(0,0,0,0.30);
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, transform 0.15s;
  }
  #toggle:hover { background: #004A99; transform: scale(1.08); }
  #toggle.active { background: #004A99; }

  #panel {
    position: absolute;
    bottom: 52px; right: 0;
    width: 296px;
    background: #f8f9fb;
    border: 1px solid #d1d8e0;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    font: 13px/1.45 'Geist', system-ui, -apple-system, sans-serif;
    color: #001E40;
    overflow: hidden;
    transition: opacity 0.15s, transform 0.15s;
  }
  #panel.hidden {
    opacity: 0; pointer-events: none; transform: translateY(8px) scale(0.97);
  }

  .ph {
    background: #001e40; color: #fff;
    padding: 10px 14px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .ph-logo { font-size: 14px; font-weight: 700; letter-spacing: -0.03em; }
  .ph-sub  { font-size: 10px; opacity: 0.60; }
  .ph-close {
    background: none; border: none; color: rgba(255,255,255,0.7);
    font-size: 18px; cursor: pointer; line-height: 1; padding: 0 2px;
  }
  .ph-close:hover { color: #fff; }

  .pb { padding: 12px 14px; max-height: 75vh; overflow-y: auto; }

  .spinner {
    width: 22px; height: 22px;
    border: 3px solid #e2e8f0; border-top-color: #004A99;
    border-radius: 50%; margin: 16px auto 8px;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading-text { text-align: center; font-size: 12px; color: #64748b; padding-bottom: 12px; }

  .slabel {
    font-size: 10px; font-weight: 700; color: #94a3b8;
    text-transform: uppercase; letter-spacing: 0.06em;
    margin-bottom: 7px; display: block;
  }

  .filing-list { display: flex; flex-direction: column; gap: 6px; max-height: 280px; overflow-y: auto; }
  .fc {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 9px 11px; display: flex; align-items: center; gap: 8px;
    cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s;
  }
  .fc:hover { border-color: #001e40; box-shadow: 0 0 0 2px rgba(0,30,64,0.1); }
  .fc-body { flex: 1; min-width: 0; }
  .fc-name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fc-meta { font-size: 11px; color: #64748b; margin-top: 1px; }
  .fc-tax  { font-size: 11px; font-weight: 700; color: #001e40; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .fc-btn  {
    flex-shrink: 0; background: #001e40; color: #fff;
    border: none; border-radius: 5px; padding: 5px 9px;
    font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap;
  }
  .fc-btn:hover { background: #003366; }

  .sel-box {
    background: #001e40; color: #fff; border-radius: 8px;
    padding: 9px 11px; margin-bottom: 10px;
  }
  .sel-name { font-size: 13px; font-weight: 600; }
  .sel-meta { font-size: 11px; opacity: 0.72; margin-top: 1px; }
  .sel-tax  { font-size: 15px; font-weight: 700; margin-top: 5px; font-variant-numeric: tabular-nums; }

  .btn {
    display: block; width: 100%;
    padding: 7px 12px; border-radius: 6px;
    font-size: 12px; font-weight: 500; cursor: pointer;
    border: none; text-align: center;
    transition: background 0.12s;
    margin-bottom: 4px;
  }
  .btn:last-child { margin-bottom: 0; }
  .btn-primary   { background: #001e40; color: #fff; }
  .btn-primary:hover   { background: #003366; }
  .btn-secondary { background: #e2e8f0; color: #334155; }
  .btn-secondary:hover { background: #cbd5e1; }
  .btn-accent    { background: #004A99; color: #fff; margin-top: 2px; }
  .btn-accent:hover    { background: #003d80; }
  .btn-ghost     {
    background: transparent; color: #64748b; font-size: 11px;
    padding: 5px 8px; width: auto; display: inline-block;
  }
  .btn-ghost:hover { background: #f1f5f9; }
  .btn-row { display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0; }

  .manual-box {
    margin-top: 8px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 8px;
    overflow: hidden;
  }
  .manual-hd {
    padding: 5px 10px;
    font-size: 10px;
    font-weight: 700;
    color: #92400e;
    background: #fef3c7;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .manual-item {
    padding: 5px 10px;
    border-top: 1px solid #fde68a;
    font-size: 11px;
  }
  .manual-item-top {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    font-weight: 600;
  }
  .manual-item-hint {
    font-size: 10px;
    color: #78350f;
    margin-top: 1px;
  }

  .offline-icon { font-size: 24px; text-align: center; margin-bottom: 4px; }
  .offline-title { font-size: 13px; font-weight: 600; text-align: center; margin-bottom: 4px; }
  .offline-desc { font-size: 11px; color: #64748b; text-align: center; line-height: 1.5; }
</style>

<button id="toggle" title="LagosFile LIRS Assistant">
  <svg width="26" height="10" viewBox="0 0 200 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M30 46 Q100 -12 170 46 Q100 22 30 46 Z" fill="#4D90CC"/>
    <rect x="0" y="48" width="200" height="5" rx="2.5" fill="rgba(255,255,255,0.45)"/>
  </svg>
</button>

<div id="panel" class="hidden">
  <div class="ph">
    <div style="display:flex;align-items:center;gap:8px">
      <svg width="36" height="11" viewBox="0 0 200 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M10 46 Q40 -6 70 46 Q40 26 10 46 Z" fill="#4D90CC"/>
        <path d="M65 46 Q100 -12 135 46 Q100 22 65 46 Z" fill="rgba(255,255,255,0.50)"/>
        <path d="M130 46 Q160 2 190 46 Q160 28 130 46 Z" fill="#4D90CC"/>
        <rect x="0" y="48" width="200" height="5" rx="2.5" fill="rgba(255,255,255,0.35)"/>
      </svg>
      <span class="ph-logo">LagosFile</span>
      <span class="ph-sub">LIRS Assistant</span>
    </div>
    <button class="ph-close" id="close-btn" title="Close">&#x2715;</button>
  </div>
  <div class="pb" id="panel-body"></div>
</div>
`;

  const toggleBtn = shadow.getElementById('toggle');
  const panel = shadow.getElementById('panel');
  const body = shadow.getElementById('panel-body');
  const closeBtn = shadow.getElementById('close-btn');

  toggleBtn.addEventListener('click', function () {
    panelOpen = !panelOpen;
    panel.classList.toggle('hidden', !panelOpen);
    toggleBtn.classList.toggle('active', panelOpen);
    if (panelOpen && allFilings.length === 0) {
      renderLoading();
      void loadFilings();
    }
  });

  closeBtn.addEventListener('click', function () {
    panelOpen = false;
    panel.classList.add('hidden');
    toggleBtn.classList.remove('active');
  });

  function renderLoading() {
    body.innerHTML = '<div class="spinner"></div><div class="loading-text">Connecting to LagosFile…</div>';
  }

  function renderOffline(isAuthError) {
    const title = isAuthError ? 'Session Token Expired or Missing' : 'LagosFile Not Detected';
    const desc = isAuthError
      ? 'Your LagosFile bridge session token expired or was not received. Re-open the portal via <strong>File with LIRS</strong> in LagosFile, then click Refresh.'
      : 'Open LagosFile and click <strong>File with LIRS</strong> on a confirmed filing, then click Refresh.';
    body.innerHTML =
      '<div class="offline-icon">⚠</div>' +
      '<div class="offline-title">' + title + '</div>' +
      '<div class="offline-desc">' + desc + '</div>' +
      '<div class="btn-row">' +
        '<button class="btn btn-ghost" id="offline-refresh">↺ Refresh</button>' +
      '</div>';
    shadow.getElementById('offline-refresh').addEventListener('click', function () {
      renderLoading();
      void loadFilings();
    });
  }

  function renderPicker() {
    body.innerHTML =
      '<span class="slabel">Select a filing</span><div class="filing-list" id="fl"></div>' +
      '<div class="btn-row"><button class="btn btn-ghost" id="pick-refresh">↺ Refresh</button></div>';
    const fl = shadow.getElementById('fl');
    allFilings.forEach(function (f) {
      const card = document.createElement('div');
      card.className = 'fc';
      const tax = f.computation?.finalTaxPayable;
      card.innerHTML =
        '<div class="fc-body">' +
          '<div class="fc-name">' + esc(f.taxpayer?.fullName || '—') + '</div>' +
          '<div class="fc-meta">YOA ' + esc(f.yearOfAssessment) +
            (f.filingReference ? ' · ' + esc(f.filingReference) : '') + '</div>' +
        '</div>' +
        '<div class="fc-tax">' + fmtN(tax) + '</div>' +
        '<button class="fc-btn">Select</button>';
      card.querySelector('.fc-btn').addEventListener('click', function () {
        selectedFiling = f;
        renderFill();
      });
      fl.appendChild(card);
    });
    shadow.getElementById('pick-refresh').addEventListener('click', function () {
      allFilings = [];
      renderLoading();
      void loadFilings();
    });
  }

  function renderFill() {
    if (!selectedFiling) { renderPicker(); return; }
    const tp = (selectedFiling.taxpayer?.fullName) || '—';
    const yoa = selectedFiling.yearOfAssessment || '—';
    const ref = selectedFiling.filingReference || '—';
    const tax = selectedFiling.computation?.finalTaxPayable;
    const manualItems = core ? core.getManualFields(selectedFiling) : [];

    let manualHtml = '';
    if (manualItems.length > 0) {
      manualHtml = '<div class="manual-box"><div class="manual-hd">Enter Manually</div>' +
        manualItems.map(function (it) {
          return '<div class="manual-item">' +
            '<div class="manual-item-top"><span>' + esc(it.label) + '</span><span>' + esc(it.displayValue) + '</span></div>' +
            '<div class="manual-item-hint">' + esc(it.hint) + '</div>' +
          '</div>';
        }).join('') +
        '</div>';
    }

    body.innerHTML =
      '<div class="sel-box">' +
        '<div class="sel-name">' + esc(tp) + '</div>' +
        '<div class="sel-meta">YOA ' + esc(yoa) + ' · ' + esc(ref) + '</div>' +
        '<div class="sel-tax">' + fmtN(tax) + ' due</div>' +
      '</div>' +
      '<span class="slabel">Fill by Tab</span>' +
      '<button class="btn btn-primary"   id="b-income">Fill Income</button>' +
      '<button class="btn btn-secondary" id="b-deductions">Fill Deductions</button>' +
      '<button class="btn btn-secondary" id="b-adjustments">Fill Adjustments</button>' +
      '<button class="btn btn-secondary" id="b-reliefs">Fill Reliefs</button>' +
      '<button class="btn btn-secondary" id="b-wht">Fill Withheld Taxes</button>' +
      '<button class="btn btn-secondary" id="b-others">Fill Others (PAYE / DTR)</button>' +
      '<button class="btn btn-accent"    id="b-all">Auto-Fill All Tabs</button>' +
      manualHtml +
      '<div class="btn-row">' +
        '<button class="btn btn-ghost" id="b-back">← Choose different</button>' +
      '</div>';

    shadow.getElementById('b-income').addEventListener('click',      function () { runStep('income'); });
    shadow.getElementById('b-deductions').addEventListener('click',  function () { runStep('deductions'); });
    shadow.getElementById('b-adjustments').addEventListener('click', function () { runStep('adjustments'); });
    shadow.getElementById('b-reliefs').addEventListener('click',     function () { runStep('reliefs'); });
    shadow.getElementById('b-wht').addEventListener('click',         function () { runStep('wht'); });
    shadow.getElementById('b-others').addEventListener('click',      function () { runStep('others'); });
    shadow.getElementById('b-all').addEventListener('click',         function () { runAllSteps(); });
    shadow.getElementById('b-back').addEventListener('click', function () {
      selectedFiling = null;
      renderPicker();
    });
  }

  async function loadFilings() {
    await tokenCapturePromise;
    const resp = await sendMsg({ type: 'FETCH_BRIDGE', path: '/filings' });
    if (resp?.ok && Array.isArray(resp.data) && resp.data.length > 0) {
      allFilings = resp.data;
      void sendMsg({ type: 'SET_FILINGS_DATA', data: allFilings });
      if (allFilings.length === 1) {
        selectedFiling = allFilings[0];
        renderFill();
      } else {
        renderPicker();
      }
      return;
    }

    if (resp?.status === 403) {
      allFilings = [];
      selectedFiling = null;
      renderOffline(true);
      return;
    }

    const singleResp = await sendMsg({ type: 'FETCH_BRIDGE', path: '/filing' });
    if (singleResp?.ok && singleResp.data) {
      allFilings = [singleResp.data];
      selectedFiling = singleResp.data;
      void sendMsg({ type: 'SET_FILINGS_DATA', data: allFilings });
      renderFill();
      return;
    }

    allFilings = [];
    selectedFiling = null;
    renderOffline(Boolean(singleResp?.status === 403));
  }

  function runStep(step) {
    if (!selectedFiling) { showToast('No filing selected.', 'warning'); return; }
    if (!core) { showToast('Extension core failed to load.', 'error'); return; }
    const tabSwitched = core.activateTab(step, document);
    const exec = function () {
      const res = core.injectStep(step, selectedFiling, document);
      if (res.done === 0 && res.miss === 0) {
        showToast('No non-zero values for "' + res.tabName + '".', 'success', 4000);
      } else if (res.done === 0) {
        showToast('⚠ No fields found. Navigate to the "' + res.tabName + '" tab first.', 'warning', 7000);
      } else {
        showToast(
          '✔ ' + res.done + ' field' + (res.done !== 1 ? 's' : '') + ' filled on "' + res.tabName + '"' +
          (res.miss > 0 ? ' · ' + res.miss + ' not found' : ''),
          res.miss > 0 ? 'warning' : 'success'
        );
      }
    };
    if (tabSwitched) {
      setTimeout(exec, 180);
    } else {
      exec();
    }
  }

  function runAllSteps() {
    if (!selectedFiling) { showToast('No filing selected.', 'warning'); return; }
    if (!core) { showToast('Extension core failed to load.', 'error'); return; }
    core.injectAllSteps(selectedFiling, document, 250).then(function (results) {
      const totalDone = results.reduce(function (s, r) { return s + r.done; }, 0);
      const totalMiss = results.reduce(function (s, r) { return s + r.miss; }, 0);
      if (totalDone === 0) {
        showToast('⚠ No calculator fields found on this page.', 'warning', 7000);
      } else {
        showToast(
          '✔ Auto-filled ' + totalDone + ' field' + (totalDone !== 1 ? 's' : '') + ' across tabs' +
          (totalMiss > 0 ? ' · ' + totalMiss + ' not found' : ''),
          totalMiss > 0 ? 'warning' : 'success',
          6000
        );
      }
    });
  }

  function showToast(msg, type, duration) {
    const prev = document.getElementById('__lf_toast_outer');
    if (prev) prev.remove();
    duration = duration || 5000;
    const colors = { success: '#14532d', warning: '#7c3d0f', error: '#7f1d1d' };
    const t = document.createElement('div');
    t.id = '__lf_toast_outer';
    Object.assign(t.style, {
      position: 'fixed', bottom: '24px', right: '24px',
      zIndex: '2147483647',
      background: colors[type] || '#001e40',
      color: '#fff', padding: '10px 16px', borderRadius: '8px',
      fontFamily: 'system-ui, sans-serif', fontSize: '12px',
      fontWeight: '500', maxWidth: '320px', lineHeight: '1.4',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      transition: 'opacity 0.3s', opacity: '1',
      pointerEvents: 'none',
    });
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () {
      t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 300);
    }, duration);
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str != null ? str : '');
    return d.innerHTML;
  }

  function fmtN(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return '₦' + Math.abs(n).toLocaleString('en-NG', { minimumFractionDigits: 2 });
  }

  runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (msg.type === 'INJECT_STEP' || msg.type === 'INJECT_ALL') {
      // A filing sent from the popup becomes the panel's selection so delayed tab fills use it.
      if (msg.data) selectedFiling = msg.data;
      try {
        if (msg.type === 'INJECT_STEP') runStep(msg.step);
        else runAllSteps();
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return false;
    }
    if (msg.type === 'PING') {
      sendResponse({ pong: true, panelInjected: true });
      return false;
    }
  });
})();
