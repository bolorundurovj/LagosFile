import { TestBed } from '@angular/core/testing';
import { StepReviewComponent } from './step-review.component';
import { FilingService } from '../../../../core/services/filing.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ComputationResult, Filing } from '../../../../core/models';
import {
  LUCIDE_ICONS,
  LucideIconProvider,
  icons,
  AlertTriangle,
  TriangleAlert,
  Check,
  Info,
} from 'lucide-angular';

describe('StepReviewComponent', () => {
  let filingServiceSpy: jasmine.SpyObj<FilingService>;
  let toastSpy: jasmine.SpyObj<ToastService>;

  const baseResult: ComputationResult = {
    totalGrossIncome: 10_000_000,
    totalCapitalAllowances: 500_000,
    proratedCapitalAllowances: 500_000,
    totalDeductions: 1_000_000,
    chargeableIncome: 8_500_000,
    bandBreakdown: [
      { lower: 0, upper: 800_000, rate: 0, taxableAmount: 800_000, taxAmount: 0 },
      { lower: 800_000, upper: 3_000_000, rate: 0.15, taxableAmount: 2_200_000, taxAmount: 330_000 },
      { lower: 3_000_000, upper: 12_000_000, rate: 0.18, taxableAmount: 5_500_000, taxAmount: 990_000 },
    ],
    graduatedTax: 1_320_000,
    whtCredits: 100_000,
    payeCredits: 200_000,
    foreignTaxCredits: 50_000,
    netTaxPayable: 970_000,
    minimumTax: 0,
    finalTaxPayable: 970_000,
    cgtExemptAmount: 0,
    digitalAssetLossRingfenced: 0,
    configVersion: 'Tax Config v2.0 — NTA 2025',
    rentReliefApplied: 400_000,
  };

  beforeEach(async () => {
    filingServiceSpy = jasmine.createSpyObj('FilingService', [
      'compute',
      'listIncomeEntries',
      'listFilings',
      'confirmFiling',
    ]);
    toastSpy = jasmine.createSpyObj('ToastService', ['error', 'success', 'info', 'warning']);

    filingServiceSpy.compute.and.resolveTo(baseResult);
    filingServiceSpy.listIncomeEntries.and.resolveTo([]);
    filingServiceSpy.listFilings.and.resolveTo([]);
    filingServiceSpy.confirmFiling.and.resolveTo({
      id: 'filing-1',
      taxpayerId: 'tp-1',
      yearOfAssessment: 2025,
      status: 'Confirmed',
      filingReference: 'LIRS/REF/2025/00001',
      createdAt: '2026-01-01T00:00:00Z',
      taxConfigVersion: 'NTA 2025',
    });

    await TestBed.configureTestingModule({
      imports: [StepReviewComponent],
      providers: [
        { provide: FilingService, useValue: filingServiceSpy },
        { provide: ToastService, useValue: toastSpy },
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({ ...icons, AlertTriangle, TriangleAlert, Check, Info }),
        },
      ],
    }).compileComponents();
  });

  function createComponent() {
    const fixture = TestBed.createComponent(StepReviewComponent);
    fixture.componentRef.setInput('filingId', 'filing-1');
    fixture.detectChanges();
    return fixture;
  }

  it('renders tax breakdown, dynamic band rates, and PAYE/FTC credits without minimum tax panel when minimumTax is 0', async () => {
    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(comp.loading()).toBeFalse();
    expect(comp.validationIssues()).toEqual([]);
    expect(comp.graduatedTaxTooltip()).toContain('0% → 15% → 18%');
    expect(text).toContain('PAYE Credits');
    expect(text).toContain('Foreign Tax Credits');
    expect(text).not.toContain('Minimum Tax Floor Comparison');
  });

  it('shows minimum tax floor comparison panel when minimumTax > 0', async () => {
    filingServiceSpy.compute.and.resolveTo({
      ...baseResult,
      minimumTax: 100_000,
    });

    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Minimum Tax Floor Comparison');
    expect(fixture.componentInstance.minTaxRateLabel()).toBe('1%');
  });

  it('computes year-over-year comparison against prior year confirmed filing and flags large swings', async () => {
    const filings: Filing[] = [
      {
        id: 'filing-1',
        taxpayerId: 'tp-1',
        yearOfAssessment: 2025,
        status: 'Draft',
        createdAt: '2026-01-01T00:00:00Z',
        taxConfigVersion: 'NTA 2025',
      },
      {
        id: 'filing-prior',
        taxpayerId: 'tp-1',
        yearOfAssessment: 2024,
        status: 'Confirmed',
        createdAt: '2025-01-01T00:00:00Z',
        confirmedAt: '2025-02-01T00:00:00Z',
        totalIncomeNgn: 5_000_000,
        chargeableIncome: 4_500_000,
        finalTaxPayable: 500_000,
        taxConfigVersion: 'PITA',
      },
    ];
    filingServiceSpy.listFilings.and.resolveTo(filings);

    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const cmp = fixture.componentInstance.comparison();
    expect(cmp).toBeTruthy();
    expect(cmp!.priorYoa).toBe(2024);
    expect(cmp!.flagged).toBeTrue();
    expect(cmp!.rows.length).toBe(3);
  });

  it('emits confirmed on successful confirm() and back on saveDraft()', async () => {
    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    let confirmedEmitted = false;
    let backEmitted = false;
    comp.confirmed.subscribe(() => { confirmedEmitted = true; });
    comp.back.subscribe(() => { backEmitted = true; });

    await comp.saveDraft();
    expect(backEmitted).toBeTrue();

    await comp.confirm();
    expect(filingServiceSpy.confirmFiling).toHaveBeenCalledWith('filing-1', baseResult);
    expect(toastSpy.success).toHaveBeenCalled();
    expect(confirmedEmitted).toBeTrue();
    expect(comp.confirming()).toBeFalse();
  });

  it('surfaces compute error via toast and stops loading', async () => {
    filingServiceSpy.compute.and.rejectWith(new Error('No active config'));

    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.loading()).toBeFalse();
    expect(toastSpy.error).toHaveBeenCalledWith(jasmine.stringContaining('No active config'));
  });
});
