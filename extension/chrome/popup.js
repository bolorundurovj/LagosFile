(function () {
  'use strict';

  const BRIDGE_URL  = 'http://127.0.0.1:19876';
  const runtime = (typeof browser !== 'undefined') ? browser.runtime : chrome.runtime;
  const tabs    = (typeof browser !== 'undefined') ? browser.tabs   : chrome.tabs;

  let allFilings  = [];   // array from /filings
  let filingData  = null; // currently selected PendingFiling

  const $ = (id) => document.getElementById(id);


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


  function syncSelectedToBackground() {
    runtime.sendMessage({ type: 'SET_FILING_DATA', data: filingData || null }, function () {});
  }

  /** After network refresh: use the freshest object from `allFilings` when possible. */
  function reconcileSelectionFromAllFilings() {
    if (!filingData || !filingData.filingId) return;
    const m = allFilings.find(function (f) { return f.filingId === filingData.filingId; });
    filingData = m || null;
  }

  function applyFilingsPayloadFromNetwork(options) {
    const silent = options && options.silent;
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


  bootstrapFromCache();

  function bootstrapFromCache() {
    runtime.sendMessage({ type: 'GET_FILINGS_DATA' }, function (cachedList) {
      runtime.sendMessage({ type: 'GET_FILING_DATA' }, function (cachedSelected) {
        const listOk = cachedList && cachedList.length > 0;

        if (!listOk) {
          showLoading();
          fetchFilings({ silent: false });
          return;
        }

        allFilings = cachedList;

        let match =
          cachedSelected &&
          cachedSelected.filingId &&
          allFilings.find(function (f) { return f.filingId === cachedSelected.filingId; });

        if (match) {
          filingData = match;
          syncSelectedToBackground();
          showFillState();
          fetchFilings({ silent: true });
          return;
        }

        if (allFilings.length === 1) {
          filingData = allFilings[0];
          syncSelectedToBackground();
          showFillState();
          fetchFilings({ silent: true });
          return;
        }

        filingData = null;
        syncSelectedToBackground();
        showPickState();
        fetchFilings({ silent: true });
      });
    });
  }

  function fetchFilings(options) {
    const silent = options && options.silent;
    if (!silent) showLoading();

    fetch(BRIDGE_URL + '/filings', { mode: 'cors', cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!Array.isArray(data) || data.length === 0) throw new Error('empty');
        allFilings = data;
        runtime.sendMessage({ type: 'SET_FILINGS_DATA', data: allFilings }, function () {});
        applyFilingsPayloadFromNetwork({ silent: silent });
      })
      .catch(function () {
        if (silent) return;

        fetch(BRIDGE_URL + '/filing', { mode: 'cors', cache: 'no-store' })
          .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          })
          .then(function (single) {
            allFilings = [single];
            filingData = single;
            runtime.sendMessage({ type: 'SET_FILINGS_DATA', data: allFilings }, function () {});
            syncSelectedToBackground();
            showFillState();
          })
          .catch(function () {
            runtime.sendMessage({ type: 'GET_FILINGS_DATA' }, function (cached) {
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
            });
          });
      });
  }


  function renderFilingList() {
    var container = $('filing-list');
    container.innerHTML = '';
    allFilings.forEach(function (f) {
      var card = document.createElement('div');
      card.className = 'filing-card';
      var tax = f.computation?.finalTaxPayable;
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


  function buildCopyFields() {
    var container = $('copy-fields');
    container.innerHTML = '';
    if (!filingData) return;

    var groups = [
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
    ].filter(function (f) { return f.value != null && f.value !== ''; });

    groups.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'copy-field';
      var raw = String(f.value).replace(/,/g, '');
      row.innerHTML =
        '<span class="copy-field-label">' + esc(f.label) + '</span>' +
        '<span class="copy-field-value">' + esc(f.value) + '</span>' +
        '<button type="button" class="copy-btn">cp</button>';
      row.querySelector('.copy-btn').addEventListener('click', function () {
        navigator.clipboard.writeText(raw).catch(function () {});
        var btn = row.querySelector('.copy-btn');
        btn.textContent = 'ok';
        setTimeout(function () { btn.textContent = 'cp'; }, 1200);
      });
      container.appendChild(row);
    });
  }


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
    var d = document.createElement('div');
    d.textContent = String(str ?? '');
    return d.innerHTML;
  }


  var STEPS = ['income', 'deductions', 'reliefs', 'wht', 'adjustments'];

  $('fill-income-btn').addEventListener('click',      function () { injectStep('income'); });
  $('fill-deductions-btn').addEventListener('click',  function () { injectStep('deductions'); });
  $('fill-reliefs-btn').addEventListener('click',     function () { injectStep('reliefs'); });
  $('fill-wht-btn').addEventListener('click',         function () { injectStep('wht'); });
  $('fill-adjustments-btn').addEventListener('click', function () { injectStep('adjustments'); });
  $('fill-all-btn').addEventListener('click', function () {
    STEPS.forEach(function (step, i) {
      setTimeout(function () { injectStep(step); }, i * 900);
    });
  });

  function injectStep(step) {
    if (!filingData) {
      alert('No filing selected. Choose a filing first.');
      return;
    }
    const q = tabs.query({ active: true, currentWindow: true });
    if (q && typeof q.then === 'function') {
      q.then(function (foundTabs) {
        if (!foundTabs || !foundTabs[0]) return;
        runtime.sendMessage({ type: 'INJECT_STEP', step: step, data: filingData });
      });
      return;
    }
    tabs.query({ active: true, currentWindow: true }, function (foundTabs) {
      if (!foundTabs[0]) return;
      runtime.sendMessage({ type: 'INJECT_STEP', step: step, data: filingData });
    });
  }


  $('back-btn').addEventListener('click', function () {
    filingData = null;
    syncSelectedToBackground();
    showPickState();
  });

  $('pick-refresh-btn').addEventListener('click',    function () { fetchFilings({ silent: false }); });
  $('fill-refresh-btn').addEventListener('click',    function () { fetchFilings({ silent: false }); });
  $('offline-refresh-btn').addEventListener('click', function () { fetchFilings({ silent: false }); });

  $('pick-manual-btn').addEventListener('click', function () {
    filingData = null;
    allFilings = [];
    runtime.sendMessage({ type: 'CLEAR_FILING_DATA' }, function () {});
    showOffline();
  });


  $('load-file-btn').addEventListener('click', function () { $('file-input').click(); });

  $('file-input').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (evt) {
      $('json-input').value = evt.target.result;
      $('parse-json-btn').click();
    };
    reader.readAsText(file);
    $('file-input').value = '';
  });

  $('parse-json-btn').addEventListener('click', function () {
    var raw = $('json-input').value.trim();
    if (!raw) { showParseError('Paste JSON first.'); return; }
    try {
      var parsed = JSON.parse(raw);
      // Accept either a single filing or an array
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) throw new Error('Empty array.');
        allFilings = parsed;
      } else {
        if (!parsed.taxpayer || !parsed.computation) {
          throw new Error('Missing taxpayer or computation fields.');
        }
        allFilings = [parsed];
      }
      runtime.sendMessage({ type: 'SET_FILINGS_DATA', data: allFilings }, function () {});
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

})();
