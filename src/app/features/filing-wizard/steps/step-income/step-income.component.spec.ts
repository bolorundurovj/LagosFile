import { TestBed } from '@angular/core/testing';
import { StepIncomeComponent } from './step-income.component';
import { FilingService } from '../../../../core/services/filing.service';
import { FxService } from '../../../../core/services/fx.service';
import { ConfigService } from '../../../../core/services/config.service';
import { ToastService } from '../../../../core/services/toast.service';
import { IncomeEntry, TaxConfig } from '../../../../core/models';
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
      'attachDocument',
    ]);
    fxServiceSpy = jasmine.createSpyObj('FxService', ['resolveRate']);
    toastSpy = jasmine.createSpyObj('ToastService', ['error', 'success', 'info', 'warning']);
    configServiceMock = { activeConfig: () => defaultConfig };

    filingServiceSpy.listIncomeEntries.and.resolveTo([]);
    filingServiceSpy.upsertIncomeEntry.and.callFake(async (e: IncomeEntry) => e);

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
    expect(filingServiceSpy.upsertIncomeEntry).toHaveBeenCalled();
    const saved = filingServiceSpy.upsertIncomeEntry.calls.mostRecent().args[0];
    expect(saved.grossAmountNgn).toBe(15_000_000);
    expect(saved.cgtGain).toBe(15_000_000);
    expect(saved.isCgtExempt).toBeFalse();
  });
});
