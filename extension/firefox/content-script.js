// ── LagosFile for LIRS — Content Script v2 ───────────────
// Injects a floating panel directly into the LIRS page so
// the user never has to leave the tab. The panel fetches all
// confirmed filings from the local bridge, lets the user pick
// one, then fills visible form fields on the current tab.
//
// Using Shadow DOM for full style isolation from LIRS portal CSS.

(function () {
  'use strict';

  // Prevent double injection on SPA navigations
  if (document.getElementById('__lf_panel_host')) return;

  const runtime = (typeof browser !== 'undefined') ? browser.runtime : chrome.runtime;
  const BRIDGE  = 'http://127.0.0.1:19876';

  // ── State ─────────────────────────────────────────────────
  let allFilings     = [];
  let selectedFiling = null;
  let panelOpen      = false;

  // ── Shadow DOM setup ──────────────────────────────────────
  const host = document.createElement('div');
  host.id = '__lf_panel_host';
  Object.assign(host.style, {
    position: 'fixed',
    right:    '14px',
    bottom:   '80px',
    zIndex:   '2147483646',
    display:  'block',
  });
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Toggle button ── */
  #toggle {
    width: 44px; height: 44px;
    background: #001e40; color: #fff;
    border: none; border-radius: 50%;
    font: 700 12px/1 system-ui, sans-serif;
    cursor: pointer;
    box-shadow: 0 2px 12px rgba(0,0,0,0.30);
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, transform 0.15s;
    letter-spacing: -0.5px;
  }
  #toggle:hover { background: #003366; transform: scale(1.08); }
  #toggle.active { background: #0d6efd; }

  /* ── Panel ── */
  #panel {
    position: absolute;
    bottom: 52px; right: 0;
    width: 288px;
    background: #f8f9fb;
    border: 1px solid #d1d8e0;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    font: 13px/1.45 system-ui, -apple-system, sans-serif;
    color: #1a1a2e;
    overflow: hidden;
    transition: opacity 0.15s, transform 0.15s;
  }
  #panel.hidden {
    opacity: 0; pointer-events: none; transform: translateY(8px) scale(0.97);
  }

  /* ── Panel header ── */
  .ph {
    background: #001e40; color: #fff;
    padding: 10px 14px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .ph-logo { font-size: 15px; font-weight: 700; }
  .ph-sub  { font-size: 10px; opacity: 0.65; margin-left: 6px; }
  .ph-close {
    background: none; border: none; color: rgba(255,255,255,0.7);
    font-size: 18px; cursor: pointer; line-height: 1; padding: 0 2px;
  }
  .ph-close:hover { color: #fff; }

  /* ── Panel body ── */
  .pb { padding: 12px 14px; }

  /* ── Loading ── */
  .spinner {
    width: 22px; height: 22px;
    border: 3px solid #e2e8f0; border-top-color: #001e40;
    border-radius: 50%; margin: 16px auto 8px;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading-text { text-align: center; font-size: 12px; color: #64748b; padding-bottom: 12px; }

  /* ── Section label ── */
  .slabel {
    font-size: 10px; font-weight: 700; color: #94a3b8;
    text-transform: uppercase; letter-spacing: 0.06em;
    margin-bottom: 7px; display: block;
  }

  /* ── Filing cards ── */
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

  /* ── Selected summary ── */
  .sel-box {
    background: #001e40; color: #fff; border-radius: 8px;
    padding: 9px 11px; margin-bottom: 10px;
  }
  .sel-name { font-size: 13px; font-weight: 600; }
  .sel-meta { font-size: 11px; opacity: 0.72; margin-top: 1px; }
  .sel-tax  { font-size: 15px; font-weight: 700; margin-top: 5px; font-variant-numeric: tabular-nums; }

  /* ── Buttons ── */
  .btn {
    display: block; width: 100%;
    padding: 8px 12px; border-radius: 6px;
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
  .btn-accent    { background: #0d6efd; color: #fff; margin-top: 2px; }
  .btn-accent:hover    { background: #0b5ed7; }
  .btn-ghost     {
    background: transparent; color: #64748b; font-size: 11px;
    padding: 5px 8px; width: auto; display: inline-block;
  }
  .btn-ghost:hover { background: #f1f5f9; }
  .btn-row { display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0; }

  /* ── Offline state ── */
  .offline-icon { font-size: 24px; text-align: center; margin-bottom: 4px; }
  .offline-title { font-size: 13px; font-weight: 600; text-align: center; margin-bottom: 4px; }
  .offline-desc { font-size: 11px; color: #64748b; text-align: center; line-height: 1.5; }

  /* ── Toast ── */
  #toast {
    position: fixed; bottom: 140px; right: 14px;
    background: #001e40; color: #fff;
    padding: 9px 16px; border-radius: 8px;
    font: 12px/1.4 system-ui, sans-serif;
    max-width: 260px; pointer-events: none;
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    transition: opacity 0.3s;
    z-index: 2147483647;
  }
  #toast.warning { background: #7c3d0f; }
  #toast.success { background: #14532d; }
  #toast.hidden  { opacity: 0; }
</style>

<button id="toggle" title="LagosFile LIRS Assistant">LF</button>

<div id="panel" class="hidden">
  <div class="ph">
    <div style="display:flex;align-items:baseline;gap:6px">
      <span class="ph-logo">LagosFile</span>
      <span class="ph-sub">LIRS Assistant</span>
    </div>
    <button class="ph-close" id="close-btn" title="Close">&#x2715;</button>
  </div>
  <div class="pb" id="panel-body">
    <!-- rendered dynamically -->
  </div>
</div>

<div id="toast" class="hidden"></div>
`;

  // ── Element refs ──────────────────────────────────────────
  const toggleBtn = shadow.getElementById('toggle');
  const panel     = shadow.getElementById('panel');
  const body      = shadow.getElementById('panel-body');
  const closeBtn  = shadow.getElementById('close-btn');
  const toastEl   = shadow.getElementById('toast');

  // ── Panel open/close ──────────────────────────────────────
  toggleBtn.addEventListener('click', function () {
    panelOpen = !panelOpen;
    panel.classList.toggle('hidden', !panelOpen);
    toggleBtn.classList.toggle('active', panelOpen);
    if (panelOpen && allFilings.length === 0) {
      renderLoading();
      loadFilings();
    }
  });

  closeBtn.addEventListener('click', function () {
    panelOpen = false;
    panel.classList.add('hidden');
    toggleBtn.classList.remove('active');
  });

  // ── Render helpers ────────────────────────────────────────

  function renderLoading() {
    body.innerHTML = '<div class="spinner"></div><div class="loading-text">Connecting to LagosFile…</div>';
  }

  function renderOffline() {
    body.innerHTML =
      '<div class="offline-icon">⚠</div>' +
      '<div class="offline-title">LagosFile Not Detected</div>' +
      '<div class="offline-desc">Open LagosFile and click <strong>File with LIRS</strong> on a confirmed filing, then click Refresh.</div>' +
      '<div class="btn-row">' +
        '<button class="btn btn-ghost" id="offline-refresh">↺ Refresh</button>' +
      '</div>';
    shadow.getElementById('offline-refresh').addEventListener('click', function () {
      renderLoading();
      loadFilings();
    });
  }

  function renderPicker() {
    var html = '<span class="slabel">Select a filing</span><div class="filing-list" id="fl"></div>' +
      '<div class="btn-row"><button class="btn btn-ghost" id="pick-refresh">↺ Refresh</button></div>';
    body.innerHTML = html;
    var fl = shadow.getElementById('fl');
    allFilings.forEach(function (f) {
      var card = document.createElement('div');
      card.className = 'fc';
      var tax = f.computation && f.computation.finalTaxPayable;
      card.innerHTML =
        '<div class="fc-body">' +
          '<div class="fc-name">' + esc(f.taxpayer && f.taxpayer.fullName || '—') + '</div>' +
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
      loadFilings();
    });
  }

  function renderFill() {
    if (!selectedFiling) { renderPicker(); return; }
    var tp  = (selectedFiling.taxpayer && selectedFiling.taxpayer.fullName) || '—';
    var yoa = selectedFiling.yearOfAssessment || '—';
    var ref = selectedFiling.filingReference  || '—';
    var tax = selectedFiling.computation && selectedFiling.computation.finalTaxPayable;

    body.innerHTML =
      '<div class="sel-box">' +
        '<div class="sel-name">' + esc(tp) + '</div>' +
        '<div class="sel-meta">YOA ' + esc(yoa) + ' · ' + esc(ref) + '</div>' +
        '<div class="sel-tax">' + fmtN(tax) + ' due</div>' +
      '</div>' +
      '<span class="slabel">Fill by Tab</span>' +
      '<button class="btn btn-primary"   id="b-income">Fill Income</button>' +
      '<button class="btn btn-secondary" id="b-deductions">Fill Deductions</button>' +
      '<button class="btn btn-secondary" id="b-reliefs">Fill Reliefs</button>' +
      '<button class="btn btn-secondary" id="b-wht">Fill Withheld Taxes</button>' +
      '<button class="btn btn-secondary" id="b-adjustments">Fill Adjustments</button>' +
      '<button class="btn btn-accent"    id="b-all">Auto-Fill All Tabs</button>' +
      '<div class="btn-row">' +
        '<button class="btn btn-ghost" id="b-back">← Choose different</button>' +
      '</div>';

    shadow.getElementById('b-income').addEventListener('click',      function () { injectStep('income'); });
    shadow.getElementById('b-deductions').addEventListener('click',  function () { injectStep('deductions'); });
    shadow.getElementById('b-reliefs').addEventListener('click',     function () { injectStep('reliefs'); });
    shadow.getElementById('b-wht').addEventListener('click',         function () { injectStep('wht'); });
    shadow.getElementById('b-adjustments').addEventListener('click', function () { injectStep('adjustments'); });
    shadow.getElementById('b-all').addEventListener('click', function () {
      ['income','deductions','reliefs','wht','adjustments'].forEach(function (s, i) {
        setTimeout(function () { injectStep(s); }, i * 900);
      });
    });
    shadow.getElementById('b-back').addEventListener('click', function () {
      selectedFiling = null;
      renderPicker();
    });
  }

  // ── Load filings from bridge ──────────────────────────────

  function loadFilings() {
    fetch(BRIDGE + '/filings', { mode: 'cors', cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        if (!Array.isArray(data) || data.length === 0) throw new Error('empty');
        allFilings = data;
        // Let background know for popup fallback
        try { runtime.sendMessage({ type: 'SET_FILINGS_DATA', data: allFilings }); } catch (_) {}
        if (allFilings.length === 1) {
          selectedFiling = allFilings[0];
          renderFill();
        } else {
          renderPicker();
        }
      })
      .catch(function () {
        // Try single /filing (backward compat)
        fetch(BRIDGE + '/filing', { mode: 'cors', cache: 'no-store' })
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(function (single) {
            allFilings = [single];
            selectedFiling = single;
            try { runtime.sendMessage({ type: 'SET_FILINGS_DATA', data: allFilings }); } catch (_) {}
            renderFill();
          })
          .catch(function () { renderOffline(); });
      });
  }

  // ── Field injection ───────────────────────────────────────

  // Each entry is [labelNeedle, dataPath].
  // Multiple entries with the same dataPath are tried in order;
  // injectStep deduplicates by element so the field is filled only once.
  const MAPPINGS = {
    income: [
      ['Employment',                   'income.employment'],
      ['Salary',                       'income.employment'],
      ['Trade Business or profession', 'income.business'],
      ['Consultancy',                  'income.business'],
      ['Trade/Business',               'income.business'],
      ['Dividend',                     'income.dividend'],
      ['Interest',                     'income.interest'],
      ['Royalty',                      'income.royalty'],
      ['Rent',                         'income.rental'],
      ['Rental',                       'income.rental'],
    ],
    deductions: [
      ['Pensions',  'deductions.pension'],
      ['Pension',   'deductions.pension'],
    ],
    adjustments: [
      ['Capital Allowance',  'computation.totalCapitalAllowances'],
      ['Capital Allowances', 'computation.totalCapitalAllowances'],
    ],
    reliefs: [
      ['National Health Insurance Scheme', 'deductions.nhis'],
      ['NHIS',                             'deductions.nhis'],
      ['National Housing Fund',            'deductions.nhf'],
      ['NHF',                              'deductions.nhf'],
      ['Life Assurance',                   'deductions.lifeAssurance'],
      ['National Pension Scheme',          'deductions.pension'],
      ['Pension Scheme',                   'deductions.pension'],
    ],
    wht: [
      ['WHT Others',      'computation.whtCredits'],
      ['WHT Credit',      'computation.whtCredits'],
      ['WHT',             'computation.whtCredits'],
      ['Withholding Tax', 'computation.whtCredits'],
      ['Tax Credit',      'computation.whtCredits'],
    ],
  };

  const TAB_NAME = {
    income: 'Income', deductions: 'Deductions',
    adjustments: 'Adjustments', reliefs: 'Reliefs', wht: 'Withheld Taxes',
  };

  function injectStep(step) {
    if (!selectedFiling) { showToast('No filing selected.', 'warning'); return; }
    var mappings = MAPPINGS[step];
    if (!mappings) { showToast('Unknown step: ' + step, 'warning'); return; }
    var done = 0;
    var filledEls  = new Set(); // prevent filling the same element twice
    var filledPaths = new Set(); // prevent counting the same data field twice as "miss"

    mappings.forEach(function (m) {
      var val = getPath(selectedFiling, m[1]);
      if (val == null || val === '' || val === 0) return;
      var el = byLabel(m[0]);
      if (!el) {
        // Only count as missing if no other variant has already found/filled this data path
        if (!filledPaths.has(m[1])) {
          // will be counted after the loop if nothing filled this path at all
        }
        return;
      }
      if (filledEls.has(el)) return; // already filled by another label variant
      setFieldValue(el, String(val));
      filledEls.add(el);
      filledPaths.add(m[1]);
      done++;
    });

    // Count data paths that had a value but no element was found
    var allPaths = {};
    mappings.forEach(function (m) {
      var val = getPath(selectedFiling, m[1]);
      if (val == null || val === '' || val === 0) return;
      allPaths[m[1]] = true;
    });
    var miss = Object.keys(allPaths).filter(function (p) { return !filledPaths.has(p); }).length;

    if (done === 0) {
      showToast('⚠ No fields found. Navigate to the "' + TAB_NAME[step] + '" tab first.', 'warning', 7000);
    } else {
      showToast(
        '✔ ' + done + ' field' + (done !== 1 ? 's' : '') + ' filled on "' + TAB_NAME[step] + '"' +
        (miss > 0 ? ' · ' + miss + ' not found' : ''),
        miss > 0 ? 'warning' : 'success'
      );
    }
  }

  function setFieldValue(el, value) {
    if (!el) return false;
    var clean = String(value).replace(/,/g, '').trim();
    el.focus();

    // 1. Native setter
    var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') &&
                       Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    if (nativeSetter) nativeSetter.call(el, clean);
    else el.value = clean;

    // 2. InputEvent (frameworks check inputType)
    el.dispatchEvent(new InputEvent('input', {
      bubbles: true, composed: true,
      inputType: 'insertText', data: clean,
    }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

    // 3. React fiber
    var reactKey = Object.keys(el).find(function (k) {
      return k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance');
    });
    if (reactKey) {
      var props = el[reactKey] && (el[reactKey].memoizedProps || (el[reactKey].return && el[reactKey].return.memoizedProps));
      if (props && props.onChange) try { props.onChange({ target: el, type: 'change' }); } catch (_) {}
    }

    // 4. Angular Ivy — walk __ngContext__ LView
    try {
      var ctx = el.__ngContext__;
      if (Array.isArray(ctx)) {
        ctx.forEach(function (item) {
          if (!item || typeof item !== 'object') return;
          if (typeof item._onChange === 'function') try { item._onChange(clean); } catch (_) {}
          else if (typeof item.onChange === 'function') try { item.onChange(clean); } catch (_) {}
          if (item.control && typeof item.control.setValue === 'function') {
            try {
              item.control.setValue(clean, { emitEvent: false, emitViewToModelChange: false });
              item.control.markAsDirty();
              item.control.updateValueAndValidity({ emitEvent: false });
            } catch (_) {}
          }
        });
      }
    } catch (_) {}

    // NOTE: no blur dispatch — Angular blur resets field to model value
    return true;
  }

  function byLabel(labelText) {
    var needle = labelText.toLowerCase();

    // Helper: find the closest input to a label-like element
    function inputNear(labelEl) {
      var forId = labelEl.getAttribute && labelEl.getAttribute('for');
      if (forId) {
        var byFor = document.querySelector('#' + CSS.escape(forId));
        if (byFor && byFor.tagName === 'INPUT') return byFor;
      }
      // Next sibling
      var sib = labelEl.nextElementSibling;
      if (sib) {
        if (sib.tagName === 'INPUT') return sib;
        var inSib = sib.querySelector('input');
        if (inSib) return inSib;
      }
      // Parent → input (1-2 levels up)
      for (var up = labelEl.parentElement, depth = 0; up && depth < 5; up = up.parentElement, depth++) {
        var inUp = up.querySelector('input');
        if (inUp) return inUp;
      }
      return null;
    }

    // 1. <label> and Angular Material <mat-label>
    var labelSelectors = 'label, mat-label';
    try {
      var labelEls = document.querySelectorAll(labelSelectors);
      for (var i = 0; i < labelEls.length; i++) {
        var l = labelEls[i];
        if (!l.textContent.trim().toLowerCase().includes(needle)) continue;
        var found = inputNear(l);
        if (found) return found;
      }
    } catch (_) {}

    // 2. Table cells as labels (LIRS uses table-based layout on some tabs)
    var cells = document.querySelectorAll('td, th');
    for (var j = 0; j < cells.length; j++) {
      var cell = cells[j];
      if (!cell.textContent.trim().toLowerCase().includes(needle)) continue;
      var nextTd = cell.nextElementSibling;
      if (nextTd) {
        var inp = nextTd.querySelector('input');
        if (inp) return inp;
      }
      var row = cell.closest('tr');
    