import { TestBed } from '@angular/core/testing';
import { StepIncomeComponent } from './step-income.component';
import { FilingService } from '../../../../core/services/filing.service';
import { FxService } from '../../../../core/services/fx.service';
import { ConfigService } from '../../../../core/services/config.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LIRSService } from '../../../../core/services/lirs.service';
import { TauriService } from '../../../../core/services/tauri.service';
import { Filing, FxResult, IncomeEntry, TaxConfig } from '../../../../core/models';
import {
  LUCIDE_ICONS,
  LucideIconProvider,
  Plus,
  RefreshCw,
  Upload,
  FileText,
  X,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  Info,
  Paperclip,
  Check,
} from 'lucide-angular';

describe('StepIncomeComponent (S13 foreign amounts and share gains)', () => {
  let filingServiceSpy: jasmine.SpyObj<FilingService>;
  let fxServiceSpy: jasmine.SpyObj<FxService>;
  let configServiceMock: { activeConfig: () => TaxConfig | null };
  let toastSpy: jasmine.SpyObj<ToastService>;

  const defaultConfig: TaxConfig = {
    id: 'cfg-1',
    versionLabel: 'NTA 2025',
    governedBy: 'NTA 2025',
    bands: [],
    reliefCaps: { rentReliefCap: 500_000, rentReliefRate: 0.2 },
    cgtThresholds: { proceedsThreshold: 150_000_000, gainThreshold: 10_000_000 },
    allowanceRates: {},
    minimumTaxRate: 0,
    isActive: true,
    lastModified: '2026-01-01T00:00:00Z',
    modifiedBy: 'system',
  };

  beforeEach(async () => {
    filingServiceSpy = jasmine.createSpyObj('FilingService', [
      'listIncomeEntries',
      'upsertIncomeEntry',
      'deleteIncomeEntry',
      'saveIncomeEntries',
      'attachDocument',
      'deleteDocument',
    ]);
    fxServiceSpy = jasmine.createSpyObj('FxService', ['resolveRate']);
    toastSpy = jasmine.createSpyObj('ToastService', ['error', 'success', 'info', 'warning']);
    configServiceMock = { activeConfig: () => defaultConfig };

    filingServiceSpy.listIncomeEntries.and.resolveTo([]);
    filingServiceSpy.upsertIncomeEntry.and.callFake(async (e: IncomeEntry) => e);
    filingServiceSpy.saveIncomeEntries.and.callFake(async (_fid, upserts) => upserts.map(u => u.id ?? ''));

    await TestBed.configureTestingModule({
      imports: [StepIncomeComponent],
      providers: [
        { provide: FilingService, useValue: filingServiceSpy },
        { provide: FxService, useValue: fxServiceSpy },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: ToastService, useValue: toastSpy },
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({
            Plus,
            RefreshCw,
            Upload,
            FileText,
            X,
            HelpCircle,
            CheckCircle2,
            AlertTriangle,
            Info,
            Paperclip,
            Check,
          }),
        },
      ],
    }).compileComponents();
  });

  function createComponent() {
    const fixture = TestBed.createComponent(StepIncomeComponent);
    fixture.componentRef.setInput('filingId', 'filing-1');
    fixture.detectChanges();
    return fixture;
  }

  it('recalculates NGN when typing foreign amount after fetching rate and resets to 0 when zeroed', async () => {
    fxServiceSpy.resolveRate.and.resolveTo({
      rate: 1600,
      source: 'fawazahmed0',
      rateDate: '2025-06-01',
      isCached: false,
    });

    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.addEntry();
    const entry = comp.entries()[0];
    entry.isForeign = true;
    entry.foreignCurrency = 'USD';
    entry.incomeDate = '2025-06-01';
    fixture.detectChanges();

    // Fetch rate BEFORE entering foreignAmount
    await comp.fetchRate(entry);
    expect(entry.fxRateFetched).toBe(1600);
    expect(entry.grossAmountNgn).toBe(0);

    // Type foreignAmount after rate was fetched
    entry.foreignAmount = 1000;
    comp.applyRate(entry);
    expect(entry.grossAmountNgn).toBe(1_600_000);
    expect(entry.fxRateUsed).toBe(1600);

    // Apply CBN override
    entry.fxRateCbnOverride = 1650;
    comp.applyRate(entry);
    expect(entry.grossAmountNgn).toBe(1_650_000);
    expect(entry.fxRateSource).toBe('cbn_override');

    // Zeroing foreignAmount resets grossAmountNgn to 0 instead of leaving 1,650,000
    entry.foreignAmount = 0;
    comp.applyRate(entry);
    expect(entry.grossAmountNgn).toBe(0);
  });

  it('hides the plain Amount input for capital_gain_shares and syncs grossAmountNgn from cgtGain', async () => {
    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.addEntry();
    const entry = comp.entries()[0];
    entry.grossAmountNgn = 200_000_000; // stale proceeds value if user had typed it first
    entry.incomeType = 'capital_gain_shares';
    comp.onTypeChange(entry);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).not.toContain('Amount (₦ NGN)');
    expect(el.textContent).toContain('Gain Amount (₦)');

    entry.cgtProceeds = 200_000_000;
    entry.cgtGain = 15_000_000;
    comp.onCgtGainChange(entry);
    expect(entry.grossAmountNgn).toBe(15_000_000);

    await comp.saveAndNext();
    expect(filingServiceSpy.saveIncomeEntries).toHaveBeenCalledTimes(1);
    const [, savedEntries] = filingServiceSpy.saveIncomeEntries.calls.mostRecent().args;
    expect(savedEntries.length).toBe(1);
    const saved = savedEntries[0];
    expect(saved.grossAmountNgn).toBe(15_000_000);
    expect(saved.cgtGain).toBe(15_000_000);
    expect(saved.isCgtExempt).toBeFalse();
  });

  it('reopening the step displays saved BIK category and cost and hides the foreign toggle', async () => {
    const savedBik: IncomeEntry = {
      id: 'bik-1',
      filingId: 'filing-1',
      incomeType: 'benefits_in_kind',
      description: 'Company Car',
      grossAmountNgn: 1_000_000,
      bikCategory: 'employer_owned_asset',
      bikCost: 20_000_000,
      isForeign: false,
      isCgtExempt: false,
      documents: [],
    };
    filingServiceSpy.listIncomeEntries.and.resolveTo([savedBik]);

    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    const el: HTMLElement = fixture.nativeElement;
    expect(comp.entries()[0].bikCategory).toBe('employer_owned_asset');
    expect(comp.entries()[0].bikCost).toBe(20_000_000);
    expect(comp.estimatedBikValue(comp.entries()[0])).toBe(1_000_000);
    expect(el.textContent).not.toContain('Foreign Currency Income');
    expect(el.textContent).toContain('BIK Category');
  });

  it('includes Benefits-in-Kind in LIRSService.buildReferenceFields using s.14 valuation', () => {
    const tauriMock = jasmine.createSpyObj('TauriService', ['invoke']);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [LIRSService, { provide: TauriService, useValue: tauriMock }],
    });
    const lirs = TestBed.inject(LIRSService);
    const filing: Filing = {
      id: 'f-1',
      taxpayerId: 'tp-1',
      yearOfAssessment: 2026,
      status: 'Confirmed',
      createdAt: '2027-01-01T00:00:00Z',
      taxConfigVersion: 'NTA 2025',
    };
    const entries: IncomeEntry[] = [
      {
        id: 'e-1',
        filingId: 'f-1',
        incomeType: 'employment',
        grossAmountNgn: 10_000_000,
        isForeign: false,
        isCgtExempt: false,
        documents: [],
      },
      {
        id: 'e-2',
        filingId: 'f-1',
        incomeType: 'benefits_in_kind',
        grossAmountNgn: 3_000_000,
        bikCategory: 'accommodation',
        bikCost: 3_000_000,
        isForeign: false,
        isCgtExempt: false,
        documents: [],
      },
    ];
    const groups = lirs.buildReferenceFields(filing, entries, [], []);
    const incomeGroup = groups.find(g => g.section === 'Income Declaration');
    const bikField = incomeGroup?.fields.find(f => f.label === 'Benefits-in-Kind');
    expect(bikField).toBeTruthy();
    expect(bikField?.copyText).toBe('2000000');
  });

  it('replaces temp doc id after save so removing an attachment in the same session deletes the real DB id', async () => {
    filingServiceSpy.attachDocument.and.resolveTo({
      id: 'real-db-doc-99',
      fileName: 'payslip.pdf',
      filePath: 'documents/e1/real_payslip.pdf.enc',
      fileSizeBytes: 1234,
    });
    filingServiceSpy.deleteDocument.and.resolveTo();

    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.addEntry();
    const entry = comp.entries()[0];
    comp.onFileSelected(
      { path: 'C:/tmp/payslip.pdf', name: 'payslip.pdf', type: 'pdf', size: 1234 },
      entry,
    );
    expect(entry.documents.length).toBe(1);
    const tempId = entry.documents[0].id;
    expect(tempId).not.toBe('real-db-doc-99');

    await comp.save();
    expect(entry.documents[0].id).toBe('real-db-doc-99');

    await comp.onRemoveDocument(entry, entry.documents[0].id);
    expect(filingServiceSpy.deleteDocument).toHaveBeenCalledWith('real-db-doc-99');
    expect(entry.documents.length).toBe(0);
  });

  it('saves multiple income upserts and deletes in a single batch invoke', async () => {
    const existing: IncomeEntry = {
      id: 'inc-old',
      filingId: 'filing-1',
      incomeType: 'employment',
      grossAmountNgn: 1_000_000,
      isForeign: false,
      isCgtExempt: false,
      documents: [],
    };
    filingServiceSpy.listIncomeEntries.and.resolveTo([existing]);

    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.removeEntry('inc-old');
    comp.addEntry();
    comp.entries()[0].grossAmountNgn = 2_000_000;
    comp.addEntry();
    comp.entries()[1].grossAmountNgn = 3_000_000;

    await comp.save();

    expect(filingServiceSpy.saveIncomeEntries).toHaveBeenCalledTimes(1);
    expect(filingServiceSpy.upsertIncomeEntry).not.toHaveBeenCalled();
    expect(filingServiceSpy.deleteIncomeEntry).not.toHaveBeenCalled();
    const [fid, upserts, deleteIds] = filingServiceSpy.saveIncomeEntries.calls.mostRecent().args;
    expect(fid).toBe('filing-1');
    expect(upserts.length).toBe(2);
    expect(deleteIds).toEqual(['inc-old']);
  });

  it('coerces cleared null numeric inputs to 0, clears foreignTaxPaidNgn when untoggling foreign, and fails save if attachment upload fails', async () => {
    filingServiceSpy.attachDocument.and.rejectWith(new Error('disk error'));

    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.addEntry();
    const entry = comp.entries()[0];
    entry.isForeign = true;
    entry.foreignCurrency = 'EUR';
    entry.foreignTaxPaidNgn = 50_000;
    entry.isForeign = false;
    comp.onForeignToggle(entry);
    expect(entry.foreignTaxPaidNgn).toBeUndefined();

    // Simulate clearing NumericFormatDirective (writes null)
    (entry as unknown as { grossAmountNgn: number | null }).grossAmountNgn = null;
    comp.onFileSelected({ path: 'C:/tmp/fail.pdf', name: 'fail.pdf', type: 'pdf', size: 10 }, entry);

    const saved = await comp.save();
    expect(saved).toBeFalse();
    expect(comp.isDirty()).toBeTrue();
    const [, upserts] = filingServiceSpy.saveIncomeEntries.calls.mostRecent().args;
    expect(upserts[0].grossAmountNgn).toBe(0);
  });

  it('LIRSService.buildReferenceFields includes prize income, real currency code, and does not duplicate WHT/PAYE credits', () => {
    const lirs = TestBed.inject(LIRSService);
    const filing: Filing = {
      id: 'f-ref-1',
      taxpayerId: 'tp-1',
      yearOfAssessment: 2025,
      status: 'Confirmed',
      createdAt: '2026-01-01T00:00:00Z',
      taxConfigVersion: 'PITA',
    };
    const groups = lirs.buildReferenceFields(
      filing,
      [
        {
          id: 'i1', filingId: 'f-ref-1', incomeType: 'prize', grossAmountNgn: 500_000,
          isForeign: false, isCgtExempt: false, documents: [],
        },
        {
          id: 'i2', filingId: 'f-ref-1', incomeType: 'business', grossAmountNgn: 1_800_000,
          isForeign: true, foreignCurrency: 'EUR', foreignAmount: 1_000, fxRateUsed: 1800,
          isCgtExempt: false, documents: [],
        },
      ],
      [],
      [
        { id: 'r1', filingId: 'f-ref-1', reliefType: 'wht', claimedAmount: 50_000, approvedAmount: 50_000, documents: [] },
        { id: 'r2', filingId: 'f-ref-1', reliefType: 'paye', claimedAmount: 100_000, approvedAmount: 100_000, documents: [] },
      ],
      {
        totalGrossIncome: 2_300_000, totalCapitalAllowances: 0, proratedCapitalAllowances: 0,
        totalDeductions: 660_000, chargeableIncome: 1_640_000, bandBreakdown: [],
        graduatedTax: 232_400, whtCredits: 50_000, payeCredits: 100_000, foreignTaxCredits: 0,
        netTaxPayable: 82_400, minimumTax: 23_000, finalTaxPayable: 82_400,
        cgtExemptAmount: 0, digitalAssetLossRingfenced: 0, configVersion: 'PITA',
        rentReliefApplied: 0, consolidatedReliefAllowance: 660_000,
      },
    );
    const incFields = groups.find(g => g.section === 'Income Declaration')!.fields;
    expect(incFields.some(f => f.label === 'Prize / Winnings' && f.copyText === '500000')).toBeTrue();
    expect(incFields.some(f => f.label === 'Foreign Currency Amount (EUR)')).toBeTrue();

    const relFields = groups.find(g => g.section === 'Deductions & Reliefs')!.fields;
    expect(relFields.filter(f => f.label.includes('WHT') || f.label.includes('Withholding')).length).toBe(1);
    expect(relFields.filter(f => f.label.includes('PAYE')).length).toBe(1);
    expect(relFields.some(f => f.label.includes('Consolidated Relief Allowance'))).toBeTrue();
  });

  it('uses filing pinned config for CGT thresholds, clears foreign on capital_gain_shares, and resets fxRateSource when clearing override', async () => {
    (configServiceMock as unknown as { getForFiling: (id: string) => Promise<TaxConfig> }).getForFiling =
      async () => ({
        ...defaultConfig,
        cgtThresholds: { proceedsThreshold: 20_000_000, gainThreshold: 2_000_000 },
      });

    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();
    const comp = fixture.componentInstance;

    comp.addEntry();
    const entry = comp.entries()[0];
    entry.isForeign = true;
    entry.foreignCurrency = 'USD';
    entry.foreignAmount = 1000;
    entry.fxRateFetched = 1500;
    entry.fxRateCbnOverride = 1600;
    comp.applyRate(entry);
    expect(entry.fxRateSource).toBe('cbn_override');

    // Clearing override must reset fxRateSource instead of leaving it stuck on 'cbn_override'
    entry.fxRateCbnOverride = undefined;
    comp.applyRate(entry);
    expect(entry.fxRateSource).toBe('fawazahmed0');
    expect(entry.grossAmountNgn).toBe(1_500_000);

    // Switching to capital_gain_shares clears foreign state and evaluates against pinned config thresholds
    entry.incomeType = 'capital_gain_shares';
    comp.onTypeChange(entry);
    expect(entry.isForeign).toBeFalse();
    entry.cgtProceeds = 25_000_000;
    entry.cgtGain = 1_000_000;
    expect(comp.cgtSummary().exempt).toBeFalse();
  });

  it('discards out-of-order FX responses, blocks saving after a failed replacement lookup unless CBN override is set, and clears stale override/share-gain foreign fields', async () => {
    let resolveUsd!: (v: FxResult) => void;
    let resolveEur!: (v: FxResult) => void;
    let rejectGbp!: (err: unknown) => void;

    fxServiceSpy.resolveRate.and.callFake((currency: string) => {
      if (currency === 'USD') {
        return new Promise(res => { resolveUsd = res; });
      }
      if (currency === 'EUR') {
        return new Promise(res => { resolveEur = res; });
      }
      return new Promise((_, rej) => { rejectGbp = rej; });
    });

    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();
    const comp = fixture.componentInstance;

    comp.addEntry();
    const entry = comp.entries()[0];
    entry.isForeign = true;
    entry.foreignAmount = 1000;
    entry.foreignCurrency = 'USD';
    entry.incomeDate = '2026-03-01';
    const usdPromise = comp.fetchRate(entry);

    // Switch to EUR before USD finishes, then resolve EUR first and USD second (reverse order).
    entry.foreignCurrency = 'EUR';
    const eurPromise = comp.fetchRate(entry);

    resolveEur({ rate: 1800, source: 'fawazahmed0', rateDate: '2026-03-01', isCached: false });
    await eurPromise;
    resolveUsd({ rate: 1500, source: 'fawazahmed0', rateDate: '2026-03-01', isCached: false });
    await usdPromise;

    // Must keep EUR's 1800 rate, never overwritten by late USD 1500 response!
    expect(entry.fxRateFetched).toBe(1800);
    expect(entry.fxRateUsed).toBe(1800);
    expect(entry.grossAmountNgn).toBe(1_800_000);

    // Now switch to GBP and have the GBP lookup fail: previous EUR rate must be cleared and save blocked!
    entry.foreignCurrency = 'GBP';
    const gbpPromise = comp.fetchRate(entry);
    rejectGbp(new Error('network offline'));
    await gbpPromise;

    expect(entry.fxRateFetched).toBeUndefined();
    expect(entry.fxRateUsed).toBeUndefined();
    expect(entry.grossAmountNgn).toBe(0);
    const savedWithoutRate = await comp.save();
    expect(savedWithoutRate).toBeFalse();
    expect(filingServiceSpy.saveIncomeEntries).not.toHaveBeenCalled();

    // Entering an explicit CBN override makes it saveable; clearing it resets all conversion fields.
    entry.fxRateCbnOverride = 2050;
    comp.applyRate(entry);
    expect(entry.fxRateUsed).toBe(2050);
    expect(entry.fxRateSource).toBe('cbn_override');
    expect(entry.grossAmountNgn).toBe(2_050_000);

    entry.fxRateCbnOverride = undefined;
    comp.applyRate(entry);
    expect(entry.fxRateUsed).toBeUndefined();
    expect(entry.fxRateSource).toBeUndefined();
    expect(entry.grossAmountNgn).toBe(0);

    // Re-apply CBN override -> now save succeeds, and legacy foreign fields on capital_gain_shares are stripped.
    entry.fxRateCbnOverride = 2050;
    comp.addEntry();
    const shares = comp.entries()[1];
    shares.incomeType = 'capital_gain_shares';
    shares.isForeign = true;
    shares.foreignTaxPaidNgn = 50_000;
    shares.cgtProceeds = 5_000_000;
    shares.cgtGain = 1_000_000;

    const savedWithOverride = await comp.save();
    expect(savedWithOverride).toBeTrue();
    const [, upserts] = filingServiceSpy.saveIncomeEntries.calls.mostRecent().args;
    expect(upserts[0].grossAmountNgn).toBe(2_050_000);
    expect(upserts[1].isForeign).toBeFalse();
    expect(upserts[1].foreignTaxPaidNgn).toBeUndefined();
  });
});
