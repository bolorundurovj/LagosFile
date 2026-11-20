import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT_ROOT = resolve(__dirname, '..');

const core = require(resolve(EXT_ROOT, 'chrome', 'autofill-core.js'));

function buildPortalDom() {
  document.body.innerHTML = `
    <div id="portal-app">
      <ul class="nav nav-tabs" role="tablist">
        <li class="nav-item"><button type="button" role="tab" class="nav-link active" data-tab="tab-income">Income</button></li>
        <li class="nav-item"><button type="button" role="tab" class="nav-link" data-tab="tab-deductions">Deductions</button></li>
        <li class="nav-item"><button type="button" role="tab" class="nav-link" data-tab="tab-adjustments">Adjustments</button></li>
        <li class="nav-item"><button type="button" role="tab" class="nav-link" data-tab="tab-reliefs">Reliefs</button></li>
        <li class="nav-item"><button type="button" role="tab" class="nav-link" data-tab="tab-wht">Withheld Taxes</button></li>
        <li class="nav-item"><button type="button" role="tab" class="nav-link" data-tab="tab-others">Others</button></li>
      </ul>

      <!-- Hidden decoy field that must always be ignored -->
      <div style="display:none">
        <label for="decoy-emp">Employment</label>
        <input id="decoy-emp" type="text" />
      </div>
      <div class="field-group">
        <label for="hidden-emp-input">Employment</label>
        <input id="hidden-emp-input" type="hidden" />
      </div>

      <div id="tab-income" class="tab-pane active show">
        <div class="col-earned">
          <div class="fg"><label for="inc-biz">Trade Business or profession</label><input id="inc-biz" type="text" /></div>
          <div class="fg"><label for="inc-emp">Employment</label><input id="inc-emp" type="text" /></div>
          <div class="fg"><label for="inc-cons">Consultancy/Professional Fees</label><input id="inc-cons" type="text" /></div>
          <div class="fg"><label for="inc-dir">Director fees</label><input id="inc-dir" type="text" /></div>
          <div class="fg"><label for="inc-bik">Benefit in Kind (BIK)</label><input id="inc-bik" type="text" /></div>
          <div class="fg"><label for="inc-tbon">Terminal Bonus</label><input id="inc-tbon" type="text" /></div>
          <div class="fg"><label for="inc-contract">Contract</label><input id="inc-contract" type="text" /></div>
          <div class="fg"><label for="inc-pension">Pension</label><input id="inc-pension" type="text" /></div>
          <div class="fg"><label for="inc-allow">Allowances</label><input id="inc-allow" type="text" /></div>
          <div class="fg"><label for="inc-profit">Profit Share</label><input id="inc-profit" type="text" /></div>
          <div class="fg"><label for="inc-comm">Commission</label><input id="inc-comm" type="text" /></div>
        </div>
        <div class="col-unearned">
          <div class="fg"><label for="inc-div">Dividend</label><input id="inc-div" type="text" /></div>
          <div class="fg"><label for="inc-int">Interest</label><input id="inc-int" type="text" /></div>
          <div class="fg"><label for="inc-roy">Royalty</label><input id="inc-roy" type="text" /></div>
          <div class="fg"><label for="inc-rent">Rent</label><input id="inc-rent" type="text" /></div>
        </div>
      </div>

      <div id="tab-deductions" class="tab-pane">
        <div class="fg"><label for="ded-int-fii">Interest (FII)</label><input id="ded-int-fii" type="text" /></div>
        <div class="fg"><label for="ded-div-fii">Dividend (FII)</label><input id="ded-div-fii" type="text" /></div>
        <div class="fg"><label for="ded-pensions">Pensions</label><input id="ded-pensions" type="text" /></div>
        <div class="fg"><label for="ded-grat">Gratuities</label><input id="ded-grat" type="text" /></div>
        <div class="fg"><label for="ded-bonus">Bonus</label><input id="ded-bonus" type="text" /></div>
        <div class="fg"><label for="ded-other">Other Deductions</label><input id="ded-other" type="text" /></div>
      </div>

      <div id="tab-adjustments" class="tab-pane">
        <div class="fg"><label for="adj-bc">Balancing Charge</label><input id="adj-bc" type="text" /></div>
        <div class="fg"><label for="adj-ba">Balancing Allowance</label><input id="adj-ba" type="text" /></div>
        <div class="fg"><label for="adj-loss">Losses</label><input id="adj-loss" type="text" /></div>
        <div class="fg"><label for="adj-ca">Capital Allowance</label><input id="adj-ca" type="text" /></div>
      </div>

      <div id="tab-reliefs" class="tab-pane">
        <div class="fg"><label for="rel-cra">Consolidated Relief Allowance</label><input id="rel-cra" type="text" /></div>
        <div class="fg"><label for="rel-pra">Personal Relief Allowance</label><input id="rel-pra" type="text" /></div>
        <div class="fg"><label for="rel-pa">Personal Allowance</label><input id="rel-pa" type="text" /></div>
        <div class="fg"><label for="rel-nhis">National Health Insurance Scheme</label><input id="rel-nhis" type="text" /></div>
        <div class="fg"><label for="rel-nhf">National Housing Fund</label><input id="rel-nhf" type="text" /></div>
        <div class="fg"><label for="rel-ch">Children Allowance</label><input id="rel-ch" type="text" /></div>
        <div class="fg"><label for="rel-dep">Dependent Relatives</label><input id="rel-dep" type="text" /></div>
        <div class="fg"><label for="rel-la">Life Assurance</label><input id="rel-la" type="text" /></div>
        <div class="fg"><label for="rel-nps">National Pension Scheme</label><input id="rel-nps" type="text" /></div>
      </div>

      <div id="tab-wht" class="tab-pane">
        <div class="fg"><label for="wht-rent">WHT on Rent</label><input id="wht-rent" type="text" /></div>
        <div class="fg"><label for="wht-comm">WHT on Commission</label><input id="wht-comm" type="text" /></div>
        <div class="fg"><label for="wht-cons">WHT on Consultancy/Professional Service</label><input id="wht-cons" type="text" /></div>
        <div class="fg"><label for="wht-dir">WHT on Directors Fee</label><input id="wht-dir" type="text" /></div>
        <div class="fg"><label for="wht-contract">WHT on Contract</label><input id="wht-contract" type="text" /></div>
        <div class="fg"><label for="wht-others">WHT Others</label><input id="wht-others" type="text" /></div>
      </div>

      <div id="tab-others" class="tab-pane">
        <div class="fg"><label for="oth-dtr">Double Taxation Reliefs</label><input id="oth-dtr" type="text" /></div>
        <div class="fg"><label for="oth-cw">Common Wealth Income Tax</label><input id="oth-cw" type="text" /></div>
        <div class="fg"><label for="oth-op">Over Payments</label><input id="oth-op" type="text" /></div>
        <div class="fg"><label for="oth-paye">PAYE</label><input id="oth-paye" type="text" /></div>
        <div class="fg"><label for="oth-bonus">Bonus</label><input id="oth-bonus" type="text" /></div>
        <div class="fg"><label for="oth-poa">Payment on Account</label><input id="oth-poa" type="text" /></div>
      </div>
    </div>
  `;

  // Wire tab buttons just like the LIRS Angular portal
  const buttons = document.querySelectorAll('[role="tab"]');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach((p) => {
        p.classList.remove('active', 'show');
      });
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const pane = document.getElementById(targetId);
      if (pane) pane.classList.add('active', 'show');
    });
  });
}

function makeFullFiling() {
  return {
    filingId: 'filing-1',
    taxpayer: { fullName: 'Adaeze Okafor', tin: '1234567890123', payerId: 'N-1234567890123' },
    yearOfAssessment: 2026,
    filingReference: 'LIRS-2026-0001',
    income: {
      employment: 10000000,
      benefitsInKind: 500000,
      business: 3500000,
      rental: 1200000,
      dividend: 400000,
      interest: 250000,
      capitalGain: 15000000,
      digitalAsset: 800000,
      royalty: 300000,
      prize: 150000,
      other: 200000,
      foreignIncome: {
        totalUsd: 3000,
        currency: 'GBP',
        fxRateUsed: 2050,
        fxRateSource: 'fawazahmed0',
        nairaEquivalent: 6150000,
      },
      foreignIncomes: [
        { currency: 'GBP', totalAmount: 3000, fxRateUsed: 2050, fxRateSource: 'fawazahmed0', nairaEquivalent: 6150000 },
        { currency: 'EUR', totalAmount: 1000, fxRateUsed: 1800, fxRateSource: 'fawazahmed0', nairaEquivalent: 1800000 },
      ],
    },
    accommodation: {
      type: 'rent',
      ownership: 'tenant',
      rentPaid: 3000000,
      rentPaidByEmployer: 1500000,
      dateStarted: '2025-01-01',
      dateEnd: '2025-12-31',
    },
    deductions: {
      pension: 800000,
      nhf: 250000,
      nhis: 100000,
      lifeAssurance: 150000,
      rentReliefApplied: 500000,
      otherApproved: 120000,
    },
    computation: {
      totalGrossIncome: 32300000,
      totalCapitalAllowances: 600000,
      chargeableIncome: 29780000,
      graduatedTax: 5500000,
      whtCredits: 350000,
      payeCredits: 900000,
      foreignTaxCredits: 180000,
      netTaxPayable: 4070000,
      minimumTax: 0,
      finalTaxPayable: 4070000,
      configVersion: 'NTA 2025',
    },
  };
}

describe('LagosFile extension autofill-core', () => {
  beforeEach(() => {
    buildPortalDom();
  });

  it('fills business income into exactly one field and never doubles into Consultancy', () => {
    const filing = makeFullFiling();
    const res = core.injectStep('income', filing, document);

    expect(res.ok).toBe(true);
    expect(document.getElementById('inc-biz').value).toBe('3500000');
    expect(document.getElementById('inc-cons').value).toBe('');
    expect(document.getElementById('inc-emp').value).toBe('10000000');
    expect(document.getElementById('inc-bik').value).toBe('500000');
    expect(document.getElementById('inc-rent').value).toBe('1200000');
    expect(document.getElementById('inc-div').value).toBe('400000');
    expect(document.getElementById('inc-int').value).toBe('250000');
    expect(document.getElementById('inc-roy').value).toBe('300000');

    // Hidden decoys must never be filled
    expect(document.getElementById('decoy-emp').value).toBe('');
    expect(document.getElementById('hidden-emp-input').value).toBe('');
  });

  it('fills WHT into exactly WHT Others and leaves all other WHT inputs untouched', () => {
    const filing = makeFullFiling();
    core.activateTab('wht', document);
    const res = core.injectStep('wht', filing, document);

    expect(res.done).toBe(1);
    expect(res.miss).toBe(0);
    expect(document.getElementById('wht-others').value).toBe('350000');
    expect(document.getElementById('wht-rent').value).toBe('');
    expect(document.getElementById('wht-comm').value).toBe('');
    expect(document.getElementById('wht-cons').value).toBe('');
    expect(document.getElementById('wht-dir').value).toBe('');
    expect(document.getElementById('wht-contract').value).toBe('');
  });

  it('ignores hidden inputs and inactive tab panes (never puts Pension deduction into Income Pension)', () => {
    const filing = makeFullFiling();
    // Income tab is active; Deductions tab is inactive
    const res = core.injectStep('deductions', filing, document);
    expect(res.done).toBe(0);
    expect(document.getElementById('inc-pension').value).toBe('');
    expect(document.getElementById('ded-pensions').value).toBe('');

    // Activate Deductions tab -> fills Pensions and Other Deductions, never touches FII fields
    core.activateTab('deductions', document);
    const res2 = core.injectStep('deductions', filing, document);
    expect(res2.done).toBe(2);
    expect(document.getElementById('ded-pensions').value).toBe('800000');
    expect(document.getElementById('ded-other').value).toBe('120000');
    expect(document.getElementById('ded-int-fii').value).toBe('');
    expect(document.getElementById('ded-div-fii').value).toBe('');

    // Activate Reliefs tab -> pension is NOT duplicated into National Pension Scheme
    core.activateTab('reliefs', document);
    const res3 = core.injectStep('reliefs', filing, document);
    expect(res3.done).toBe(3);
    expect(document.getElementById('rel-nhis').value).toBe('100000');
    expect(document.getElementById('rel-nhf').value).toBe('250000');
    expect(document.getElementById('rel-la').value).toBe('150000');
    expect(document.getElementById('rel-nps').value).toBe('');
  });

  it('Auto-Fill All Tabs switches through every portal tab and fills all 16 mapped fields including PAYE & DTR', async () => {
    const filing = makeFullFiling();
    const results = await core.injectAllSteps(filing, document, 5);

    expect(results.length).toBe(6);
    expect(results.reduce((s, r) => s + r.miss, 0)).toBe(0);
    expect(document.getElementById('inc-emp').value).toBe('10000000');
    expect(document.getElementById('inc-bik').value).toBe('500000');
    expect(document.getElementById('ded-pensions').value).toBe('800000');
    expect(document.getElementById('ded-other').value).toBe('120000');
    expect(document.getElementById('adj-ca').value).toBe('600000');
    expect(document.getElementById('rel-nhis').value).toBe('100000');
    expect(document.getElementById('rel-nhf').value).toBe('250000');
    expect(document.getElementById('rel-la').value).toBe('150000');
    expect(document.getElementById('wht-others').value).toBe('350000');
    expect(document.getElementById('oth-paye').value).toBe('900000');
    expect(document.getElementById('oth-dtr').value).toBe('180000');
  });

  it('maps or lists for manual entry every single payload field (zero silent drops)', () => {
    const filing = makeFullFiling();
    const mapped = core.getMappedPaths();
    const manual = core.getManualFields(filing);
    const manualPaths = new Set(manual.map((m) => m.path));

    const allPayloadPaths = [
      'income.employment',
      'income.benefitsInKind',
      'income.business',
      'income.rental',
      'income.dividend',
      'income.interest',
      'income.capitalGain',
      'income.digitalAsset',
      'income.royalty',
      'income.prize',
      'income.other',
      'income.foreignIncomes',
      'accommodation.rentPaid',
      'accommodation.rentPaidByEmployer',
      'deductions.pension',
      'deductions.nhf',
      'deductions.nhis',
      'deductions.lifeAssurance',
      'deductions.rentReliefApplied',
      'deductions.otherApproved',
      'computation.totalCapitalAllowances',
      'computation.whtCredits',
      'computation.payeCredits',
      'computation.foreignTaxCredits',
    ];

    for (const p of allPayloadPaths) {
      const covered = mapped.has(p) || manualPaths.has(p);
      expect(covered, `Payload field "${p}" must be either auto-mapped or in Enter Manually`).toBe(true);
    }

    // Foreign currencies expand per currency (GBP and EUR)
    const fxManual = manual.filter((m) => m.path === 'income.foreignIncomes');
    expect(fxManual.length).toBe(2);
    expect(fxManual.some((m) => m.label.includes('GBP'))).toBe(true);
    expect(fxManual.some((m) => m.label.includes('EUR'))).toBe(true);
  });

  it('extracts per-session bridge token from URL hash fragment', () => {
    const tok = 'a1b2c3d4'.repeat(8);
    expect(core.extractTokenFromHash(`#lagosfile=${tok}`)).toBe(tok);
    expect(core.extractTokenFromHash(`#foo=1&lagosfile=${tok}&bar=2`)).toBe(tok);
    expect(core.extractTokenFromHash('#other=123')).toBeNull();
    expect(core.extractTokenFromHash('')).toBeNull();
  });

  it('keeps Chrome and Firefox extension files valid, in sync, and free of stray init() or direct content fetches', () => {
    const chromeCore = readFileSync(resolve(EXT_ROOT, 'chrome', 'autofill-core.js'), 'utf8');
    const firefoxCore = readFileSync(resolve(EXT_ROOT, 'firefox', 'autofill-core.js'), 'utf8');
    expect(chromeCore).toBe(firefoxCore);

    const chromePopupHtml = readFileSync(resolve(EXT_ROOT, 'chrome', 'popup.html'), 'utf8');
    const firefoxPopupHtml = readFileSync(resolve(EXT_ROOT, 'firefox', 'popup.html'), 'utf8');
    expect(firefoxPopupHtml).toBe(chromePopupHtml);
    expect(firefoxPopupHtml).toContain('<script src="popup.js"></script>');
    expect(firefoxPopupHtml).toContain('id="manual-section"');

    const chromePopupCss = readFileSync(resolve(EXT_ROOT, 'chrome', 'popup.css'), 'utf8');
    const firefoxPopupCss = readFileSync(resolve(EXT_ROOT, 'firefox', 'popup.css'), 'utf8');
    expect(firefoxPopupCss).toBe(chromePopupCss);
    expect(firefoxPopupCss).toContain('.error-text');

    const chromeContent = readFileSync(resolve(EXT_ROOT, 'chrome', 'content-script.js'), 'utf8');
    const firefoxContent = readFileSync(resolve(EXT_ROOT, 'firefox', 'content-script.js'), 'utf8');
    expect(chromeContent).not.toMatch(/\binit\s*\(\s*\)/);
    expect(firefoxContent).not.toMatch(/\binit\s*\(\s*\)/);
    expect(chromeContent).not.toMatch(/\bfetch\s*\(/);
    expect(firefoxContent).not.toMatch(/\bfetch\s*\(/);

    const chromeManifest = JSON.parse(readFileSync(resolve(EXT_ROOT, 'chrome', 'manifest.json'), 'utf8'));
    const firefoxManifest = JSON.parse(readFileSync(resolve(EXT_ROOT, 'firefox', 'manifest.json'), 'utf8'));
    expect(chromeManifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(firefoxManifest.version).toBe(chromeManifest.version);

    // Both manifests must capture #lagosfile=<token> at document_start to survive login redirects.
    const hasDocStart = (m) =>
      m.content_scripts.some(
        (cs) => cs.run_at === 'document_start' && Array.isArray(cs.js) && cs.js.includes('token-capture.js')
      );
    expect(hasDocStart(chromeManifest)).toBe(true);
    expect(hasDocStart(firefoxManifest)).toBe(true);

    const chromeTokenCap = readFileSync(resolve(EXT_ROOT, 'chrome', 'token-capture.js'), 'utf8');
    const firefoxTokenCap = readFileSync(resolve(EXT_ROOT, 'firefox', 'token-capture.js'), 'utf8');
    expect(firefoxTokenCap).toBe(chromeTokenCap);

    // Neither extension may persist PII or tokens to storage.local (only cleanup .remove is allowed).
    const chromeBg = readFileSync(resolve(EXT_ROOT, 'chrome', 'background.js'), 'utf8');
    const firefoxBg = readFileSync(resolve(EXT_ROOT, 'firefox', 'background.js'), 'utf8');
    expect(chromeBg).not.toMatch(/storage\.local\.(set|get)/);
    expect(firefoxBg).not.toMatch(/storage\.local\.(set|get)/);

    // Popup must not fall back to GET_FILINGS_DATA when bridge fails, and must surface 403 distinctly.
    const chromePopupJs = readFileSync(resolve(EXT_ROOT, 'chrome', 'popup.js'), 'utf8');
    const firefoxPopupJs = readFileSync(resolve(EXT_ROOT, 'firefox', 'popup.js'), 'utf8');
    expect(firefoxPopupJs).toBe(chromePopupJs);
    expect(chromePopupJs).not.toContain("'GET_FILINGS_DATA'");
    expect(chromePopupJs).toContain('status === 403');
    expect(chromeContent).toContain('status === 403');
  });

  it('activateTab prioritizes real tab elements over earlier generic links in DOM order', () => {
    document.body.innerHTML = `
      <header><a id="header-link" href="/deductions">Deductions</a></header>
      <ul class="nav">
        <li class="nav-item"><button id="real-tab" class="nav-link" role="tab">Deductions</button></li>
      </ul>
    `;
    const clicked = [];
    document.getElementById('header-link').addEventListener('click', () => clicked.push('header-link'));
    document.getElementById('real-tab').addEventListener('click', () => clicked.push('real-tab'));

    expect(core.activateTab('deductions', document)).toBe(true);
    expect(clicked).toEqual(['real-tab']);
  });
});
