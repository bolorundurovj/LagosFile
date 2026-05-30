// ── LagosFile for LIRS — Popup v1.1 (Firefox / MV2) ──────────
// Firefox uses Promise-based browser.* APIs; Chrome uses callbacks.
// This file is the Firefox variant — all sendMessage calls use .then().

(function () {
  'use strict';

  const BRIDGE_URL = 'http://127.0.0.1:19876';

  let allFilings = [];
  let filingData = null;

  const $ = (id) => document.getElementById(id);

  // ── Messaging helper ──────────────────────────────────────
  // Firefox: browser.runtime.sendMessage returns a Promise (no callback arg).
  function sendMsg(msg) {
    return browser.runtime.sendMessage(msg);
  }

  // ── State transitions ─────────────────────────────────────

  function showLoading() {
    $('state-loading').classList.remove('hidden');
    $('state-pick').classList.add('hidden');
    $('state-fill').classList.add('hidden');
    $('state-offline').classList.add('hidden');
    $('status-text').textContent = 'Connecting…';
  }

  function showPickState() {
    $('state-loading').classList.add('hidden');
    $('state-pick').classList.remove('hidden');
    $('state-fill').classList.add('hidden');
    $('state-offline').classList.add('hidden');
    $('status-text').textContent = allFilings.length + ' filing(s) found';
    renderFilingList();
  }

  function showFillState() {
    $('state-loading').classList.add('hidden');
    $('state-pick').classList.add('hidden');
    $('state-fill').classList.remove('hidden');
    $('state-offline').classList.add('hidden');
    if (!filingData) return;
    const tp = filingData.taxpayer?.fullName || '—';
    const yoa = filingData.yearOfAssessment || '—';
    const ref = filingData.filingReference || '—';
    const tax = filingData.computation?.finalTaxPayable;
    $('selected-summary').innerHTML =
      '<div class="sf-name">' + esc(tp) + '</div>' +
      '<div class="sf-meta">YOA ' + esc(yoa) + ' · Ref: ' + esc(ref) + '</div>' +
      '<div class="sf-tax">' + fmtNaira(tax) + ' due</div>';
    $('status-text').textContent = tp + ' · ' + yoa;
    buildCopyFields();
  }

  function showOffline() {
    $('state-loading').classList.add('hidden');
    $('state-pick').classList.add('hidden');
    $('state-fill').classList.add('hidden');
    $('state-offline').classList.remove('hidden');
    $('status-text').textContent = 'Not connected';
  }

  // ── Background sync ───────────────────────────────────────

  function syncSelectedToBackground() {
    sendMsg({ type: 'SET_FILING_DATA', data: filingData || null }).catch(() => {});
  }

  function reconcileSelectionFromAllFilings() {
    if (!filingData || !filingData.filingId) return;
    const m = allFilings.find((f) => f.filingId === filingData.filingId);
    filingData = m || null;
  }

  function applyFilingsPayloadFromNetwork(silent) {
    reconcileSelectionFromAllFilings();

    if (allFilings.length === 1) {
      filingData = allFilings[0];
      syncSelectedToBackground();
      showFillState();
      return;
    }

    const still = filingData &&
      filingData.filingId &&
      allFilings.some((f) => f.filingId === filingData.filingId);

    if (still) {
      filingData = allFilings.find((f) => f.filingId === filingData.filingId);
      syncSelectedToBackground();
      showFillState();
      return;
    }

    filingData = null;
    syncSelectedToBackground();
    if (!silent || allFilings.length > 0) showPickState();
  }

  // ── Bootstrap from cache then refresh ────────────────────

  async function bootstrap() {
    try {
      const [cachedList, cachedSelected] = await Promise.all([
        sendMsg({ type: 'GET_FILINGS_DATA' }),
        sendMsg({ type: 'GET_FILING_DATA' }),
      ]);

      const listOk = cachedList && cachedList.length > 0;

      if (!listOk) {
        showLoading();
        await fetchFilings(false);
        return;
      }

      allFilings = cachedList;

      const match = cachedSelected &&
        cachedSelected.filingId &&
        allFilings.find((f) => f.filingId === cachedSelected.filingId);

      if (match) {
        filingData = match;
        syncSelectedToBackground();
        showFillState();
        fetchFilings(true).catch(() => {}); // silent background refresh
        return;
      }

      if (allFilings.length === 1) {
        filingData = allFilings[0];
        syncSelectedToBackground();
        showFillState();
        fetchFilings(true).catch(() => {});
        return;
      }

      filingData = null;
      syncSelectedToBackground();
      showPickState();
      fetchFilings(true).catch(() => {});
    } catch (err) {
      showLoading();
      fetchFilings(false).catch(() => showOffline());
    }
  }

  async function fetchFilings(silent) {
    if (!silent) showLoading();
    try {
      // Proxy through background to avoid Firefox mixed-content blocking (https page → http bridge)
      const resp = await sendMsg({ type: 'FETCH_BRIDGE', path: '/filings' });
      if (!resp || !resp.ok) throw new Error(resp && resp.error || 'fetch failed');
      const data = resp.data;
      if (!Array.isArray(data) || data.length === 0) throw new Error('empty');
      allFilings = data;
      sendMsg({ type: 'SET_FILINGS_DATA', data: allFilings }).catch(() => {});
      applyFilingsPayloadFromNetwork(silent);
    } catch (_) {
      // Fallback: try single /filing endpoint
      try {
        const resp2 = await sendMsg({ type: 'FETCH_BRIDGE', path: '/filing' });
        if (!resp2 || !resp2.ok) throw new Error('fetch failed');
        const single = resp2.data;
        allFilings = [single];
        filingData = single;
        sendMsg({ type: 'SET_FILINGS_DATA', data: allFilings }).catch(() => {});
        syncSelectedToBackground();
        showFillState();
      } catch (__) {
        if (silent) return;
        // Try returning whatever is cached
        try {
          const cached = await sendMsg({ type: 'GET_FILINGS_DATA' });
          if (cached && cached.length > 0) {
            allFilings = cached;
            if (allFilings.length === 1) {
              filingData = allFilings[0];
              syncSelectedToBackground();
              showFillState();
            } else {
              filingData = null;
              syncSelectedToBackground();
              showPickState();
            }
          } else {
            showOffline();
          }
        } catch (___) {
          showOffline();
        }
      }
    }
  }

  // ── Filing list renderer ──────────────────────────────────

  function renderFilingList() {
    const container = $('filing-list');
    container.innerHTML = '';
    allFilings.forEach((f) => {
      const card = document.createElement('div');
      card.className = 'filing-card';
      const tax = f.computation?.finalTaxPayable;
      card.innerHTML =
        '<div class="filing-card-body">' +
          '<div class="filing-name">' + esc(f.taxpayer?.fullName || '—') + '</div>' +
          '<div class="filing-meta">YOA ' + esc(f.yearOfAssessment) +
            (f.filingReference ? ' · ' + esc(f.filingReference) : '') + '</div>' +
        '</div>' +
        '<div class="filing-tax">' + fmtNaira(tax) + '</div>' +
        '<button type="button" class="filing-select-btn">Select</button>';
      card.querySelector('.filing-select-btn').addEventListener('click', () => {
        filingData = f;
        syncSelectedToBackground();
        showFillState();
      });
      container.appendChild(card);
    });
  }

  // ── Copy fields ───────────────────────────────────────────

  function buildCopyFields() {
    const container = $('copy-fields');
    container.innerHTML = '';
    if (!filingData) return;

    const groups = [
      { label: 'Payer ID',          value: filingData.taxpayer?.payerId || fmtPayerId(filingData.taxpayer?.tin) },
      { label: 'TIN',               value: filingData.taxpayer?.tin },
      { label: 'Employment',        value: fmtNum(filingData.income?.employment) },
      { label: 'Trade / Business',  value: fmtNum(filingData.income?.business) },
      { label: 'Dividend',          value: fmtNum(filingData.income?.dividend) },
      { label: 'Interest',          value: fmtNum(filingData.income?.interest) },
      { label: 'Royalty',           value: fmtNum(filingData.income?.royalty) },
      { label: 'Rent',              value: fmtNum(filingData.income?.rental) },
      { label: 'Pension',           value: fmtNum(filingData.deductions?.pension) },
      { label: 'NHF',               value: fmtNum(filingData.deductions?.nhf) },
      { label: 'NHIS',              value: fmtNum(filingData.deductions?.nhis) },
      { label: 'Life Assurance',    value: fmtNum(filingData.deductions?.lifeAssurance) },
      { label: 'Capital Allowance', value: fmtNum(filingData.computation?.totalCapitalAllowances) },
      { label: 'WHT Credits',       value: fmtNum(filingData.computation?.whtCredits) },
      { label: 'Chargeable Income', value: fmtNum(filingData.computation?.chargeableIncome) },
      { label: 'Final Tax Payable', value: fmtNum(filingData.computation?.finalTaxPayable) },
    ].filter((f) => f.value != null && f.value !== '');

    groups.forEach((f) => {
      const row = document.createElement('div');
      row.className = 'copy-field';
      const raw = String(f.value).replace(/,/g, '');
      row.innerHTML =
        '<span class="copy-field-label">' + esc(f.label) + '</span>' +
        '<span class="copy-field-value">' + esc(f.value) + '</span>' +
        '<button type="button" class="copy-btn">cp</button>';
      row.querySelector('.copy-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(raw).catch(() => {});
        const btn = row.querySelector('.copy-btn');
        btn.textContent = 'ok';
        setTimeout(() => { btn.textContent = 'cp'; }, 1200);
      });
      container.appendChild(row);
    });
  }

  // ── Auto-fill ─────────────────────────────────────────────

  const STEPS = ['income', 'deductions', 'reliefs', 'wht', 'adjustments'];

  function injectStep(step) {
    if (!filingData) { alert('No filing selected. Choose a filing first.'); return; }
    browser.tabs.query({ active: true, currentWindow: true })
      .then((tabs) => {
        if (!tabs[0]) return;
        sendMsg({ type: 'INJECT_STEP', step, data: filingData }).catch(() => {});
      });
  }

  $('fill-income-btn').addEventListener('click',      () => injectStep('income'));
  $('fill-deductions-btn').addEventListener('click',  () => injectStep('deductions'));
  $('fill-reliefs-btn').addEventListener('click',     () => injectStep('reliefs'));
  $('fill-wht-btn').addEventListener('click',         () => injectStep('wht'));
  $('fill-adjustments-btn').addEventListener('click', () => injectStep('adjustments'));
  $('fill-all-btn').addEventListener('click', () => {
    STEPS.forEach((step, i) => setTimeout(() => injectStep(step), i * 900));
  });

  // ── Navigation ────────────────────────────────────────────

  $('back-btn').addEventListener('click', () => {
    filingData = null;
    syncSelectedToBackground();
    showPickState();
  });

  $('pick-refresh-btn').addEventListener('click',    () => fetchFilings(false));
  $('fill-refresh-btn').addEventListener('click',    () => fetchFilings(false));
  $('offline-refresh-btn').addEventListener('click', () => fetchFilings(false));

  $('pick-manual-btn').addEventListener('click', () => {
    filingData = null;
    allFilings = [];
    sendMsg({ type: 'CLEAR_FILING_DATA' }).catch(() => {});
    showOffline();
  });

  // ── Manual JSON load ──────────────────────────────────────

  $('load-file-btn').addEventListener('click', () => $('file-input').click());

  $('file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      $('json-input').value = evt.target.result;
      $('parse-json-btn').click();
    };
    reader.readAsText(file);
    $('file-input').value = '';
  });

  $('parse-json-btn').addEventListener('click', () => {
    const raw = $('json-input').value.trim();
    if (!raw) { showParseError('Paste JSON first.'); return; }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) throw new Error('Empty array.');
        allFilings = parsed;
      } else {
        if (!parsed.taxpayer || !parsed.computation) throw new Error('Missing taxpayer or computation fields.');
        allFilings = [parsed];
      }
      sendMsg({ type: 'SET_FILINGS_DATA', data: allFilings }).catch(() => {});
      hideParseError();
      $('json-input').value = '';
      if (allFilings.length === 1) {
        filingData = allFilings[0];
        syncSelectedToBackground();
        showFillState();
      } else {
        filingData = null;
        syncSelectedToBackground();
        showPickState();
      }
    } catch (e) {
      showParseError('Invalid JSON: ' + e.message);
    }
  });

  function showParseError(msg) {
    $('parse-error').textContent = msg;
    $('parse-error').classList.remove('hidden');
  }
  function hideParseError() {
    $('parse-error').classList.add('hidden');
  }

  // ── Helpers ───────────────────────────────────────────────

  function fmtNaira(n) {
    if (n == null || isNaN(n)) return '—';
    return '₦' + Math.abs(n).toLocaleString('en-NG', { minimumFractionDigits: 2 });
  }

  function fmtNum(n) {
    if (n == null || n === 0) return null;
    return n.toLocaleString('en-NG');
  }

  function fmtPayerId(tin) {
    if (!tin) return '';
    return tin.startsWith('N-') || tin.startsWith('C-') ? tin : 'N-' + tin;
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str ?? '');
    return d.innerHTML;
  }

  // ── Start ─────────────────────────────────────────────────
  bootstrap();

})();
