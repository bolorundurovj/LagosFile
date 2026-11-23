(function (root, factory) {
  const exportsObj = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = exportsObj;
  }
  if (root) {
    root.LagosFileCore = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  const EXT_VERSION = '1.3.0'; // x-release-please-version
  const BRIDGE_URL = 'http://127.0.0.1:19876';

  const STEPS = ['income', 'deductions', 'adjustments', 'reliefs', 'wht', 'others'];

  const TAB_NAME = {
    income: 'Income',
    deductions: 'Deductions',
    adjustments: 'Adjustments',
    reliefs: 'Reliefs',
    wht: 'Withheld Taxes',
    others: 'Others',
  };

  // Exact portal field labels verified against the LIRS eTax Tax Calculator tabs.
  // Each data path appears in at most one step and is filled at most once.
  const MAPPINGS = {
    income: [
      ['Employment', 'income.employment'],
      ['Trade Business or profession', 'income.business'],
      ['Benefit in Kind (BIK)', 'income.benefitsInKind'],
      ['Dividend', 'income.dividend'],
      ['Interest', 'income.interest'],
      ['Royalty', 'income.royalty'],
      ['Rent', 'income.rental'],
    ],
    deductions: [
      ['Pensions', 'deductions.pension'],
      ['Other Deductions', 'deductions.otherApproved'],
    ],
    adjustments: [
      ['Capital Allowance', 'computation.totalCapitalAllowances'],
    ],
    reliefs: [
      ['National Health Insurance Scheme', 'deductions.nhis'],
      ['National Housing Fund', 'deductions.nhf'],
      ['Life Assurance', 'deductions.lifeAssurance'],
    ],
    wht: [
      ['WHT Others', 'computation.whtCredits'],
    ],
    others: [
      ['PAYE', 'computation.payeCredits'],
      ['Double Taxation Reliefs', 'computation.foreignTaxCredits'],
    ],
  };

  // Payload fields without a direct fixed input on the LIRS Tax Calculator tabs.
  // Any non-zero entry is surfaced in the "Enter Manually" section so nothing is silently dropped.
  const MANUAL_FIELD_DEFS = [
    {
      path: 'income.capitalGain',
      label: 'Capital Gains (Shares)',
      hint: 'Income tab → Other Incomes (ADD) or Form A',
    },
    {
      path: 'income.digitalAsset',
      label: 'Digital / Virtual Assets',
      hint: 'Income tab → Other Incomes (ADD) or Form A',
    },
    {
      path: 'income.prize',
      label: 'Prizes & Awards',
      hint: 'Income tab → Other Incomes (ADD)',
    },
    {
      path: 'income.other',
      label: 'Other / Contract Income',
      hint: 'Income tab → Contract or Other Incomes (ADD)',
    },
    {
      path: 'deductions.rentReliefApplied',
      label: 'Rent Relief Applied',
      hint: 'Reliefs tab → Others (ADD) when no Rent Relief input exists',
    },
    {
      path: 'deductions.consolidatedReliefAllowance',
      label: 'Consolidated Relief Allowance (PITA)',
      hint: 'PITA (<=2025) returns — auto-computed on LIRS Form A for pre-2026 years',
    },
    {
      path: 'accommodation.rentPaid',
      label: 'Annual Rent Paid',
      hint: 'Accommodation section on Form A',
    },
    {
      path: 'accommodation.rentPaidByEmployer',
      label: 'Employer-Paid Accommodation',
      hint: 'Accommodation section on Form A',
    },
  ];

  function getPath(obj, path) {
    if (!obj || !path) return undefined;
    return path.split('.').reduce(function (o, k) {
      return o != null ? o[k] : undefined;
    }, obj);
  }

  function extractTokenFromHash(hash) {
    if (!hash || typeof hash !== 'string') return null;
    const raw = hash.startsWith('#') ? hash.slice(1) : hash;
    const match = raw.match(/(?:^|&)lagosfile=([a-fA-F0-9]{16,128})(?:&|$)/);
    return match ? match[1] : null;
  }

  function normalizeLabel(text) {
    const label = String(text || '')
      .replaceAll('\u00a0', ' ')
      .replace(/\s+/g, ' ')
      .trim();
    let end = label.length;
    while (end > 0 && ':*'.includes(label[end - 1])) end--;
    return label.slice(0, end).trim().toLowerCase();
  }

  function failsNativeVisibilityCheck(el) {
    if (typeof el.checkVisibility !== 'function') return false;
    try {
      return !el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
    } catch (_) {
      return false;
    }
  }

  function isHiddenByAttribute(node) {
    return Boolean(node.hasAttribute?.('hidden')) || node.getAttribute?.('aria-hidden') === 'true';
  }

  function isHiddenByClass(node) {
    const cl = node.classList;
    if (!cl) return false;
    if (cl.contains('hidden') || cl.contains('d-none')) return true;
    return cl.contains('tab-pane') && !cl.contains('active') && !cl.contains('show');
  }

  function isHiddenStyle(style) {
    return Boolean(style) && (style.display === 'none' || style.visibility === 'hidden');
  }

  function isHiddenNode(node, view) {
    if (isHiddenByAttribute(node) || isHiddenByClass(node) || isHiddenStyle(node.style)) return true;
    return typeof view?.getComputedStyle === 'function' && isHiddenStyle(view.getComputedStyle(node));
  }

  function isVisibleElement(el, win) {
    if (el?.nodeType !== 1) return false;
    if (failsNativeVisibilityCheck(el)) return false;
    const view = win || el.ownerDocument?.defaultView || null;
    for (let cur = el; cur?.nodeType === 1; cur = cur.parentElement) {
      if (isHiddenNode(cur, view)) return false;
    }
    return true;
  }

  function isVisibleInput(el, win) {
    if (!el || el.tagName !== 'INPUT') return false;
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (
      type === 'hidden' ||
      type === 'submit' ||
      type === 'button' ||
      type === 'checkbox' ||
      type === 'radio' ||
      type === 'file'
    ) {
      return false;
    }
    if (el.disabled || el.readOnly) return false;
    return isVisibleElement(el, win);
  }

  function getVisibleInputs(container, win) {
    if (!container || !container.querySelectorAll) return [];
    const all = container.querySelectorAll('input');
    const out = [];
    for (let i = 0; i < all.length; i++) {
      if (isVisibleInput(all[i], win)) out.push(all[i]);
    }
    return out;
  }

  function byLabel(labelText, doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return null;
    const win = d.defaultView || (typeof window !== 'undefined' ? window : null);
    const target = normalizeLabel(labelText);
    if (!target) return null;

    function inputNear(labelEl) {
      const forId = labelEl.getAttribute && labelEl.getAttribute('for');
      if (forId) {
        const byFor = d.getElementById(forId);
        if (isVisibleInput(byFor, win)) return byFor;
      }

      const inside = getVisibleInputs(labelEl, win);
      if (inside.length === 1) return inside[0];

      const sib = labelEl.nextElementSibling;
      if (sib) {
        if (isVisibleInput(sib, win)) return sib;
        const inSib = getVisibleInputs(sib, win);
        if (inSib.length === 1) return inSib[0];
      }

      for (let up = labelEl.parentElement, depth = 0; up && depth < 4; up = up.parentElement, depth++) {
        const visibleInUp = getVisibleInputs(up, win);
        if (visibleInUp.length === 1) return visibleInUp[0];
        if (visibleInUp.length > 1) break;
      }
      return null;
    }

    // 1. <label> and Angular Material <mat-label>
    const labelEls = d.querySelectorAll('label, mat-label');
    for (let i = 0; i < labelEls.length; i++) {
      const l = labelEls[i];
      if (!isVisibleElement(l, win)) continue;
      if (normalizeLabel(l.textContent) !== target) continue;
      const found = inputNear(l);
      if (found) return found;
    }

    // 2. Table cells as labels
    const cells = d.querySelectorAll('td, th');
    for (let j = 0; j < cells.length; j++) {
      const cell = cells[j];
      if (!isVisibleElement(cell, win)) continue;
      if (normalizeLabel(cell.textContent) !== target) continue;
      const nextTd = cell.nextElementSibling;
      if (nextTd) {
        const inNext = getVisibleInputs(nextTd, win);
        if (inNext.length === 1) return inNext[0];
      }
      const row = cell.closest && cell.closest('tr');
      if (row) {
        const inRow = getVisibleInputs(row, win);
        if (inRow.length === 1) return inRow[0];
      }
    }

    // 3. Direct label-like span/div/p/li nodes
    const textNodes = d.querySelectorAll('span, div, p, li');
    for (let k = 0; k < textNodes.length; k++) {
      const node = textNodes[k];
      if (node.children.length > 2) continue;
      if (!isVisibleElement(node, win)) continue;
      if (normalizeLabel(node.textContent) !== target) continue;
      const near = inputNear(node);
      if (near) return near;
    }

    // 4. Exact aria-label or placeholder on visible inputs
    const inputs = d.querySelectorAll('input[aria-label], input[placeholder]');
    for (let m = 0; m < inputs.length; m++) {
      const inp = inputs[m];
      if (!isVisibleInput(inp, win)) continue;
      const aria = normalizeLabel(inp.getAttribute('aria-label'));
      const ph = normalizeLabel(inp.getAttribute('placeholder'));
      if (aria === target || ph === target) return inp;
    }

    return null;
  }

  function setFieldValue(el, value, win) {
    if (!el) return false;
    const view = win || (el.ownerDocument?.defaultView) || (typeof window !== 'undefined' ? window : null);
    const clean = String(value).replaceAll(',', '').trim();
    if (typeof el.focus === 'function') {
      try { el.focus(); } catch (_) {}
    }

    const htmlInputProto = view?.HTMLInputElement ? view.HTMLInputElement.prototype : null;
    const nativeSetter = htmlInputProto &&
      Object.getOwnPropertyDescriptor(htmlInputProto, 'value') &&
      Object.getOwnPropertyDescriptor(htmlInputProto, 'value').set;
    if (nativeSetter) nativeSetter.call(el, clean);
    else el.value = clean;

    try {
      const InputEv = (view?.InputEvent) || (typeof InputEvent !== 'undefined' ? InputEvent : null);
      if (InputEv) {
        el.dispatchEvent(new InputEv('input', {
          bubbles: true,
          composed: true,
          inputType: 'insertText',
          data: clean,
        }));
      } else {
        const Ev = (view?.Event) || Event;
        el.dispatchEvent(new Ev('input', { bubbles: true, composed: true }));
      }
      const Ev = (view?.Event) || Event;
      el.dispatchEvent(new Ev('change', { bubbles: true, composed: true }));
    } catch (_) {}

    const reactKey = Object.keys(el).find(function (k) {
      return k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance');
    });
    if (reactKey) {
      const props = el[reactKey] && (el[reactKey].memoizedProps || (el[reactKey].return && el[reactKey].return.memoizedProps));
      if (props?.onChange) {
        try { props.onChange({ target: el, type: 'change' }); } catch (_) {}
      }
    }

    try {
      const ctx = el.__ngContext__;
      if (Array.isArray(ctx)) {
        ctx.forEach(function (item) {
          if (!item || typeof item !== 'object') return;
          if (typeof item._onChange === 'function') {
            try { item._onChange(clean); } catch (_) {}
          } else if (typeof item.onChange === 'function') {
            try { item.onChange(clean); } catch (_) {}
          }
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

    return true;
  }

  function activateTab(step, doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return false;
    const tabLabel = TAB_NAME[step];
    if (!tabLabel) return false;
    const target = normalizeLabel(tabLabel);
    const win = d.defaultView || (typeof window !== 'undefined' ? window : null);

    const tiers = [
      '[role="tab"], .mat-tab-label, .mat-mdc-tab, ul.nav-tabs li a, ul.nav-tabs li button, .nav-tabs .nav-link',
      '.nav-link, .nav-item a, .nav-item button, ul.nav li a',
      'button, a',
    ];
    for (let t = 0; t < tiers.length; t++) {
      const candidates = d.querySelectorAll(tiers[t]);
      for (let i = 0; i < candidates.length; i++) {
        const el = candidates[i];
        if (!isVisibleElement(el, win)) continue;
        if (normalizeLabel(el.textContent) !== target) continue;
        el.click();
        return true;
      }
    }
    return false;
  }

  function injectStep(step, filing, doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!filing) {
      return { ok: false, step: step, tabName: TAB_NAME[step] || step, done: 0, miss: 0, filledFields: [], missingFields: [] };
    }
    const mappings = MAPPINGS[step];
    if (!mappings) {
      return { ok: false, step: step, tabName: step, done: 0, miss: 0, filledFields: [], missingFields: [] };
    }

    const filledEls = new Set();
    const filledPaths = new Set();
    const filledFields = [];

    mappings.forEach(function (m) {
      const label = m[0];
      const path = m[1];
      if (filledPaths.has(path)) return;
      const val = getPath(filing, path);
      if (val == null || val === '' || val === 0) return;
      const el = byLabel(label, d);
      if (!el || filledEls.has(el)) return;
      setFieldValue(el, String(val));
      filledEls.add(el);
      filledPaths.add(path);
      filledFields.push({ label: label, path: path, value: val });
    });

    const missingFields = [];
    const seenPaths = new Set();
    mappings.forEach(function (m) {
      const path = m[1];
      if (seenPaths.has(path)) return;
      seenPaths.add(path);
      const val = getPath(filing, path);
      if (val == null || val === '' || val === 0) return;
      if (!filledPaths.has(path)) {
        missingFields.push({ label: m[0], path: path, value: val });
      }
    });

    return {
      ok: true,
      step: step,
      tabName: TAB_NAME[step],
      done: filledFields.length,
      miss: missingFields.length,
      filledFields: filledFields,
      missingFields: missingFields,
    };
  }

  function injectAllSteps(filing, doc, delayMs) {
    const waitMs = delayMs == null ? 250 : delayMs;
    const results = [];
    let chain = Promise.resolve();
    STEPS.forEach(function (step) {
      chain = chain.then(function () {
        activateTab(step, doc);
        return new Promise(function (resolve) {
          setTimeout(function () {
            results.push(injectStep(step, filing, doc));
            resolve();
          }, waitMs);
        });
      });
    });
    return chain.then(function () { return results; });
  }

  function getMappedPaths() {
    const paths = new Set();
    Object.keys(MAPPINGS).forEach(function (step) {
      MAPPINGS[step].forEach(function (m) {
        paths.add(m[1]);
      });
    });
    return paths;
  }

  function getManualFields(filing) {
    if (!filing) return [];
    const items = [];

    MANUAL_FIELD_DEFS.forEach(function (def) {
      const val = getPath(filing, def.path);
      if (typeof val === 'number' && val > 0) {
        let hint = def.hint;
        if (def.path === 'accommodation.rentPaid' && filing.accommodation) {
          const acc = filing.accommodation;
          if (acc.dateStarted && acc.dateEnd) {
            hint += ' (' + acc.dateStarted + ' to ' + acc.dateEnd + ')';
          }
        }
        items.push({
          path: def.path,
          label: def.label,
          value: val,
          rawValue: String(val),
          displayValue: val.toLocaleString('en-NG'),
          hint: hint,
        });
      }
    });

    const foreignList = Array.isArray(filing.income?.foreignIncomes) && filing.income.foreignIncomes.length > 0
      ? filing.income.foreignIncomes
      : (filing.income?.foreignIncome?.nairaEquivalent > 0
        ? [{
          currency: filing.income.foreignIncome.currency || 'FX',
          totalAmount: filing.income.foreignIncome.totalUsd || 0,
          nairaEquivalent: filing.income.foreignIncome.nairaEquivalent,
          fxRateUsed: filing.income.foreignIncome.fxRateUsed || 0,
        }]
        : []);

    foreignList.forEach(function (fx) {
      if (!fx || !(fx.nairaEquivalent > 0 || fx.totalAmount > 0)) return;
      items.push({
        path: 'income.foreignIncomes',
        label: 'Foreign Income (' + (fx.currency || 'FX') + ')',
        value: fx.nairaEquivalent,
        rawValue: String(fx.nairaEquivalent),
        displayValue: (fx.totalAmount ? fx.totalAmount.toLocaleString('en-NG') + ' ' + fx.currency + ' · ' : '') +
          '₦' + Number(fx.nairaEquivalent || 0).toLocaleString('en-NG'),
        hint: 'Included in NGN totals above; reference for Foreign Income schedule',
      });
    });

    return items;
  }

  return {
    EXT_VERSION: EXT_VERSION,
    BRIDGE_URL: BRIDGE_URL,
    STEPS: STEPS,
    TAB_NAME: TAB_NAME,
    MAPPINGS: MAPPINGS,
    MANUAL_FIELD_DEFS: MANUAL_FIELD_DEFS,
    getPath: getPath,
    extractTokenFromHash: extractTokenFromHash,
    normalizeLabel: normalizeLabel,
    isVisibleElement: isVisibleElement,
    isVisibleInput: isVisibleInput,
    byLabel: byLabel,
    setFieldValue: setFieldValue,
    activateTab: activateTab,
    injectStep: injectStep,
    injectAllSteps: injectAllSteps,
    getMappedPaths: getMappedPaths,
    getManualFields: getManualFields,
  };
});
