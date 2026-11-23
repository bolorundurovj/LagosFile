import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LUCIDE_ICONS, LucideIconProvider, icons } from 'lucide-angular';
import { TaxCalculatorComponent } from './tax-calculator.component';
import { FilingService } from '../../core/services/filing.service';
import { ComputationResult } from '../../core/models';

describe('TaxCalculatorComponent', () => {
  let filingSpy: jasmine.SpyObj<FilingService>;

  const result: ComputationResult = {
    totalGrossIncome: 10_000_000,
    totalCapitalAllowances: 0,
    proratedCapitalAllowances: 100_000,
    totalDeductions: 500_000,
    chargeableIncome: 9_400_000,
    bandBreakdown: [
      { lower: 0, upper: 800_000, rate: 0, taxableAmount: 800_000, taxAmount: 0 } as any,
      { lower: 800_000, upper: null, rate: 0.15, taxableAmount: 8_600_000, taxAmount: 1_290_000 } as any,
    ],
    graduatedTax: 1_290_000,
    whtCredits: 90_000,
    netTaxPayable: 1_200_000,
    minimumTax: 0,
    finalTaxPayable: 1_200_000,
    cgtExemptAmount: 0,
    digitalAssetLossRingfenced: 0,
    configVersion: 'NTA 2025',
    rentReliefApplied: 0,
  };

  beforeEach(() => {
    filingSpy = jasmine.createSpyObj('FilingService', ['estimateTax']);
    filingSpy.estimateTax.and.resolveTo(result);
    TestBed.configureTestingModule({
      imports: [TaxCalculatorComponent],
      providers: [
        provideRouter([]),
        { provide: FilingService, useValue: filingSpy },
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider(icons) },
      ],
    });
  });

  function create() {
    const fixture = TestBed.createComponent(TaxCalculatorComponent);
    fixture.detectChanges();
    return { fixture, comp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('defaults to the previous year with a single employment line and a placeholder result', () => {
    const { comp, el } = create();
    const year = new Date().getFullYear();
    expect(comp.selectedYear).toBe(year - 1);
    expect(comp.availableYears.length).toBe(8);
    expect(comp.availableYears[0]).toBe(year);
    expect(comp.income).toEqual([{ incomeType: 'employment', grossAmountNgn: 0 }]);
    expect(comp.effectiveRate()).toBe(0);
    expect(el.querySelector('.calc__result')?.textContent).toContain('Enter your income to see an estimate.');
  });

  it('debounces recompute and sends mapped income, assets and reliefs to the estimator', fakeAsync(() => {
    const { comp, fixture, el } = create();
    comp.income = [
      { incomeType: 'employment', grossAmountNgn: 8_000_000 },
      { incomeType: 'capital_gain_shares', grossAmountNgn: 2_000_000, cgtProceeds: 20_000_000 },
    ];
    comp.assetCost = 300_000;
    comp.reliefs.pension = 400_000;
    comp.selectedYear = 2025;

    comp.recompute();
    comp.recompute();
    tick(249);
    expect(filingSpy.estimateTax).not.toHaveBeenCalled();
    tick(1);
    flushMicrotasks();

    expect(filingSpy.estimateTax).toHaveBeenCalledTimes(1);
    const [income, assets, reliefs, year] = filingSpy.estimateTax.calls.mostRecent().args;
    expect(income).toEqual([
      { incomeType: 'employment', grossAmountNgn: 8_000_000, cgtProceeds: undefined, cgtGain: undefined },
      { incomeType: 'capital_gain_shares', grossAmountNgn: 2_000_000, cgtProceeds: 20_000_000, cgtGain: 2_000_000 },
    ]);
    expect(assets).toEqual([{ assetType: 'computer_laptop', assetCost: 300_000 }]);
    expect(reliefs.length).toBe(6);
    expect(reliefs).toContain({ reliefType: 'pension', claimedAmount: 400_000 } as any);
    expect(reliefs).toContain({ reliefType: 'rent', claimedAmount: 0 } as any);
    expect(year).toBe(2025);

    expect(comp.result()).toEqual(result);
    expect(comp.effectiveRate()).toBeCloseTo(0.12, 5);
    fixture.detectChanges();
    const text = el.querySelector('.calc__result')!.textContent!;
    expect(text).toContain('Effective rate 12.00%');
    expect(text).toContain('Deductions & reliefs');
    expect(el.querySelectorAll('.calc__line--band').length).toBe(2);
    expect(text).not.toContain('Minimum tax floor');
  }));

  it('defaults missing amounts and omits assets when no asset cost is entered', fakeAsync(() => {
    const { comp } = create();
    comp.income = [{ incomeType: 'capital_gain_shares', grossAmountNgn: undefined as any }];
    comp.recompute();
    tick(250);
    flushMicrotasks();
    const [income, assets] = filingSpy.estimateTax.calls.mostRecent().args;
    expect(income).toEqual([
      { incomeType: 'capital_gain_shares', grossAmountNgn: 0, cgtProceeds: 0, cgtGain: 0 },
    ]);
    expect(assets).toEqual([]);
  }));

  it('renders PITA CRA, minimum tax and CGT exemption lines when present', fakeAsync(() => {
    filingSpy.estimateTax.and.resolveTo({
      ...result,
      consolidatedReliefAllowance: 200_000,
      minimumTax: 100_000,
      cgtExemptAmount: 50_000,
    });
    const { comp, fixture, el } = create();
    comp.recompute();
    tick(250);
    flushMicrotasks();
    fixture.detectChanges();
    const text = el.querySelector('.calc__result')!.textContent!;
    expect(text).toContain('Consolidated Relief Allowance (PITA)');
    expect(text).toContain('Other deductions & reliefs');
    expect(text).toContain('Minimum tax floor');
    expect(text).toContain('of share gains is CGT-exempt');
  }));

  it('shows the estimator error and clears it on the next success', fakeAsync(() => {
    filingSpy.estimateTax.and.rejectWith('Config missing');
    const { comp, fixture, el } = create();
    comp.recompute();
    tick(250);
    flushMicrotasks();
    expect(comp.error()).toBe('Config missing');
    fixture.detectChanges();
    expect(el.querySelector('.alert--error')?.textContent).toContain('Config missing');

    filingSpy.estimateTax.and.resolveTo(result);
    comp.recompute();
    tick(250);
    flushMicrotasks();
    expect(comp.error()).toBeNull();
    expect(comp.result()).toEqual(result);
  }));

  it('adds and removes income lines, recomputing after removal', fakeAsync(() => {
    const { comp, fixture, el } = create();
    expect(el.querySelector('[aria-label="Remove income line"]')).toBeNull();

    comp.addIncome();
    expect(comp.income.length).toBe(2);
    expect(comp.income[1]).toEqual({ incomeType: 'business', grossAmountNgn: 0 });
    fixture.detectChanges();
    expect(el.querySelectorAll('[aria-label="Remove income line"]').length).toBe(2);

    comp.removeIncome(0);
    expect(comp.income).toEqual([{ incomeType: 'business', grossAmountNgn: 0 }]);
    tick(250);
    flushMicrotasks();
    expect(filingSpy.estimateTax).toHaveBeenCalledTimes(1);
  }));

  it('returns zero effective rate when gross income is zero', () => {
    const { comp } = create();
    comp.result.set({ ...result, totalGrossIncome: 0 });
    expect(comp.effectiveRate()).toBe(0);
  });
});
