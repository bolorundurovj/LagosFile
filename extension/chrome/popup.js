(function () {
  'use strict';

  const core = window.LagosFileCore;

  let allFilings = [];
  let filingData = null;

  const $ = (id) => document.getElementById(id);

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
    buildManualFields();
    buildCopyFields();
  }

  function showOffline(isAuthError) {
    $('state-loading').classList.add('hidden');
    $('state-pick').classList.add('hidden');
    $('state-fill').classList.add('hidden');
    $('state-offline').classList.remove('hidden');
    const titleEl = $('offline-title');
    const descEl = $('offline-desc');
    if (isAuthError) {
      if (titleEl) titleEl.textContent = 'Session Token Expired or Missing';
      if (descEl) {
        descEl.innerHTML =
          'Your LagosFile bridge session token expired or was not received. Re-open the portal via <strong>File with LIRS</strong> in LagosFile, then click Try Again.';
      }
      $('status-text').textContent = 'Auth required (403)';
    } else {
      if (titleEl) titleEl.textContent = 'LagosFile Not Detected';
      if (descEl) {
        descEl.innerHTML =
          'Open LagosFile, then click <strong>File with LIRS</strong> on any confirmed filing. Then click Try Again below.';
      }
      $('status-text').textContent = 'Not connected';
    }
  }

  function syncSelectedToBackground() {
    void sendMsg({ type: 'SET_FILING_DATA', data: filingData || null });
  }

  function reconcileSelectionFromAllFilings() {
    if (!filingData || !filingData.filingId) return;
    const m = allFilings.find(function (f) { return f.filingId === filingData.filingId; });
    filingData = m || null;
  }

  function applyFilingsPayloadFromNetwork(options) {
    const silent = options?.silent;
    reconcileSelectionFromAllFilings();

    if (allFilings.length === 1) {
      filingData = allFilings[0];
      syncSelectedToBackground();
      showFillState();
      return;
    }

    const still =
      filingData &&
      filingData.filingId &&
      allFilings.some(function (f) { return f.filingId === filingData.filingId; });

    if (still) {
      filingData = allFilings.find(function (f) { return f.filingId === filingData.filingId; });
      syncSelectedToBackground();
      showFillState();
      return;
    }

    filingData = null;
    syncSelectedToBackground();
    if (!silent || allFilings.length > 0) {
      showPickState();
    }
  }

  async function bootstrapFromCache() {
    // Always verify live bridge availability so locked/stopped LagosFile sessions
    // never serve stale cached taxpayer PII.
    showLoading();
    const cachedSelected = await sendMsg({ type: 'GET_FILING_DATA' });
    if (cachedSelected?.filingId) {
      filingData = cachedSelected;
    }
    await fetchFilings({ silent: false });
  }

  async function fetchFilings(options) {
    const silent = options?.silent;
    if (!silent) showLoading();

    const resp = await sendMsg({ type: 'FETCH_BRIDGE', path: '/filings' });
    if (resp?.ok && Array.isArray(resp.data) && resp.data.length > 0) {
      allFilings = resp.data;
      await sendMsg({ type: 'SET_FILINGS_DATA', data: allFilings });
      applyFilingsPayloadFromNetwork({ silent: silent });
      return;
    }

    if (resp?.status === 403) {
      allFilings = [];
      filingData = null;
      await sendMsg({ type: 'CLEAR_FILING_DATA' });
      showOffline(true);
      return;
    }

    const respSingle = await sendMsg({ type: 'FETCH_BRIDGE', path: '/filing' });
    if (respSingle?.ok && respSingle.data) {
      allFilings = [respSingle.data];
      filingData = respSingle.data;
      await sendMsg({ type: 'SET_FILINGS_DATA', data: allFilings });
      syncSelectedToBackground();
      showFillState();
      return;
    }

    // Bridge is offline or rejected auth — never serve stale cached taxpayer PII.
    allFilings = [];
    filingData = null;
    await sendMsg({ type: 'CLEAR_FILING_DATA' });
    showOffline(Boolean(respSingle?.status === 403));
  }

  function renderFilingList() {
    const container = $('filing-list');
    container.innerHTML = '';
    allFilings.forEach(function (f) {
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
      card.querySelector('.filing-select-btn').addEventListener('click', function () {
        filingData = f;
        syncSelectedToBackground();
        showFillState();
      });
      container.appendChild(card);
    });
  }

  function buildManualFields() {
    const section = $('manual-section');
    const container = $('manual-fields');
    container.innerHTML = '';
    const items = core ? core.getManualFields(filingData) : [];
    if (items.length === 0) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    items.forEach(function (item) {
      const row = document.createElement('div');
      row.className = 'manual-field';
      row.innerHTML =
        '<div class="manual-row">' +
          '<span class="copy-field-label">' + esc(item.label) + '</span>' +
          '<span class="copy-field-value">' + esc(item.displayValue) + '</span>' +
          '<button type="button" class="copy-btn">cp</button>' +
        '</div>' +
        '<div class="manual-hint">' + esc(item.hint) + '</div>';
      row.querySelector('.copy-btn').addEventListener('click', function () {
        navigator.clipboard.writeText(item.rawValue).catch(function () {});
        const btn = row.querySelector('.copy-btn');
        btn.textContent = 'ok';
        setTimeout(function () { btn.textContent = 'cp'; }, 1200);
      });
      container.appendChild(row);
    });
  }

  function buildCopyFields() {
    const container = $('copy-fields');
    container.innerHTML = '';
    if (!filingData) return;

    const groups = [
      { label: 'Payer ID',                value: filingData.taxpayer?.payerId || fmtPayerId(filingData.taxpayer?.tin) },
      { label: 'TIN',                     value: filingData.taxpayer?.tin },
      { label: 'Employment',              value: fmtNum(filingData.income?.employment) },
      { label: 'Benefits in Kind (BIK)',  value: fmtNum(filingData.income?.benefitsInKind) },
      { label: 'Trade / Business',        value: fmtNum(filingData.income?.business) },
      { label: 'Dividend',                value: fmtNum(filingData.income?.dividend) },
      { label: 'Interest',                value: fmtNum(filingData.income?.interest) },
      { label: 'Royalty',                 value: fmtNum(filingData.income?.royalty) },
      { label: 'Rent',                    value: fmtNum(filingData.income?.rental) },
      { label: 'Pension',                 value: fmtNum(filingData.deductions?.pension) },
      { label: 'Other Deductions',        value: fmtNum(filingData.deductions?.otherApproved) },
      { label: 'NHF',                     value: fmtNum(filingData.deductions?.nhf) },
      { label: 'NHIS',                    value: fmtNum(filingData.deductions?.nhis) },
      { label: 'Life Assurance',          value: fmtNum(filingData.deductions?.lifeAssurance) },
      { label: 'Rent Relief Applied',     value: fmtNum(filingData.deductions?.rentReliefApplied) },
      { label: 'Capital Allowance',       value: fmtNum(filingData.computation?.totalCapitalAllowances) },
      { label: 'WHT Credits',             value: fmtNum(filingData.computation?.whtCredits) },
      { label: 'PAYE Credits',            value: fmtNum(filingData.computation?.payeCredits) },
      { label: 'Double Taxation Reliefs', value: fmtNum(filingData.computation?.foreignTaxCredits) },
      { label: 'Chargeable Income',       value: fmtNum(filingData.computation?.chargeableIncome) },
      { label: 'Final Tax Payable',       value: fmtNum(filingData.computation?.finalTaxPayable) },
    ].filter(function (f) { return f.value != null && f.value !== ''; });

    groups.forEach(function (f) {
      const row = document.createElement('div');
      row.className = 'copy-field';
      const raw = String(f.value).replace(/,/g, '');
      row.innerHTML =
        '<span class="copy-field-label">' + esc(f.label) + '</span>' +
        '<span class="copy-field-value">' + esc(f.value) + '</span>' +
        '<button type="button" class="copy-btn">cp</button>';
      row.querySelector('.copy-btn').addEventListener('click', function () {
        navigator.clipboard.writeText(raw).catch(function () {});
        const btn = row.querySelector('.copy-btn');
        btn.textContent = 'ok';
        setTimeout(function () { btn.textContent = 'cp'; }, 1200);
      });
      container.appendChild(row);
    });
  }

  function fmtNaira(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
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

  $('fill-income-btn').addEventListener('click',      function () { injectStep('income'); });
  $('fill-deductions-btn').addEventListener('click',  function () { injectStep('deductions'); });
  $('fill-adjustments-btn').addEventListener('click', function () { injectStep('adjustments'); });
  $('fill-reliefs-btn').addEventListener('click',     function () { injectStep('reliefs'); });
  $('fill-wht-btn').addEventListener('click',         function () { injectStep('wht'); });
  $('fill-others-btn').addEventListener('click',      function () { injectStep('others'); });
  $('fill-all-btn').addEventListener('click',         function () { injectAll(); });

  function queryActiveTab(cb) {
    if (typeof browser !== 'undefined') {
      browser.tabs.query({ active: true, currentWindow: true })
        .then(function (foundTabs) { cb(foundTabs && foundTabs[0]); })
        .catch(function () { cb(null); });
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, function (foundTabs) {
        cb(foundTabs && foundTabs[0]);
      });
    }
  }

  function injectStep(step) {
    if (!filingData) {
      alert('No filing selected. Choose a filing first.');
      return;
    }
    queryActiveTab(function (tab) {
      if (!tab) return;
      void sendMsg({ type: 'INJECT_STEP', step: step, data: filingData });
    });
  }

  function injectAll() {
    if (!filingData) {
      alert('No filing selected. Choose a filing first.');
      return;
    }
    queryActiveTab(function (tab) {
      if (!tab) return;
      void sendMsg({ type: 'INJECT_ALL', data: filingData });
    });
  }

  $('back-btn').addEventListener('click', function () {
    filingData = null;
    syncSelectedToBackground();
    showPickState();
  });

  $('pick-refresh-btn').addEventListener('click',    function () { void fetchFilings({ silent: false }); });
  $('fill-refresh-btn').addEventListener('click',    function () { void fetchFilings({ silent: false }); });
  $('offline-refresh-btn').addEventListener('click', function () { void fetchFilings({ silent: false }); });

  $('pick-manual-btn').addEventListener('click', function () {
    filingData = null;
    allFilings = [];
    void sendMsg({ type: 'CLEAR_FILING_DATA' });
    showOffline();
  });

  $('load-file-btn').addEventListener('click', function () { $('file-input').click(); });

  $('file-input').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
      $('json-input').value = evt.target.result;
      $('parse-json-btn').click();
    };
    reader.readAsText(file);
    $('file-input').value = '';
  });

  $('parse-json-btn').addEventListener('click', function () {
    const raw = $('json-input').value.trim();
    if (!raw) { showParseError('Paste JSON first.'); return; }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) throw new Error('Empty array.');
        allFilings = parsed;
      } else {
        if (!parsed.taxpayer || !parsed.computation) {
          throw new Error('Missing taxpayer or computation fields.');
        }
        allFilings = [parsed];
      }
      void sendMsg({ type: 'SET_FILINGS_DATA', data: allFilings });
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

  void bootstrapFromCache();
})();
