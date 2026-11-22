import { TestBed } from '@angular/core/testing';
import { LIRSService } from './lirs.service';
import { TauriService } from './tauri.service';
import { CapitalAllowance, ComputationResult, Filing, IncomeEntry, LIRSFieldGroup, ReliefEntry } from '../models';

describe('LIRSService', () => {
  let service: LIRSService;
  let tauriSpy: jasmine.SpyObj<TauriService>;

  const filing: Filing = {
    id: 'f-1',
    taxpayerId: 'tp-1',
    yearOfAssessment: 2025,
    status: 'Confirmed',
    filingReference: 'LF-2025-001',
    createdAt: '2026-01-01T00:00:00Z',
    taxConfigVersion: 'NTA 2025',
  };

  function income(partial: Partial<IncomeEntry>): IncomeEntry {
    return {
      id: crypto.randomUUID(),
      filingId: 'f-1',
      incomeType: 'other',
      grossAmountNgn: 0,
      isForeign: false,
      isCgtExempt: false,
      documents: [],
      ...partial,
    };
  }

  function relief(reliefType: ReliefEntry['reliefType'], claimedAmount: number, approvedAmount = claimedAmount): ReliefEntry {
    return { id: crypto.randomUUID(), filingId: 'f-1', reliefType, claimedAmount, approvedAmount, documents: [] };
  }

  const computation: ComputationResult = {
    totalGrossIncome: 6_000_000,
    totalCapitalAllowances: 0,
    proratedCapitalAllowances: 0,
    totalDeductions: 0,
    chargeableIncome: 5_000_000,
    bandBreakdown: [],
    graduatedTax: 700_000,
    whtCredits: 50_000,
    payeCredits: 100_000,
    foreignTaxCredits: 25_000,
    netTaxPayable: 525_000,
    minimumTax: 0,
    finalTaxPayable: 525_000,
    cgtExemptAmount: 0,
    digitalAssetLossRingfenced: 0,
    configVersion: 'NTA 2025',
    rentReliefApplied: 200_000,
    consolidatedReliefAllowance: 300_000,
  };

  function group(groups: LIRSFieldGroup[], section: string): LIRSFieldGroup | undefined {
    return groups.find(g => g.section === section);
  }

  function field(g: LIRSFieldGroup | undefined, label: string) {
    return g?.fields.find(f => f.label === label);
  }

  beforeEach(() => {
    tauriSpy = jasmine.createSpyObj('TauriService', ['invoke']);
    TestBed.configureTestingModule({ providers: [{ provide: TauriService, useValue: tauriSpy }] });
    service = TestBed.inject(LIRSService);
  });

  it('opens the LIRS portal for a single filing', async () => {
    const result = { success: true, fallbackActive: false, message: 'ok', filingId: 'f-1' };
    tauriSpy.invoke.and.resolveTo(result);
    expect(await service.fileWithLirs('f-1')).toEqual(result);
    expect(tauriSpy.invoke).toHaveBeenCalledWith('open_lirs_portal', { id: 'f-1' });
  });

  it('opens the LIRS portal with all confirmed filings', async () => {
    tauriSpy.invoke.and.resolveTo({ success: true, fallbackActive: false, message: 'ok', filingId: '' });
    await service.openLirsPortalAll();
    expect(tauriSpy.invoke).toHaveBeenCalledWith('open_lirs_portal_all');
  });

  it('builds the taxpayer section with income year and LIRS year of assessment', () => {
    const groups = service.buildReferenceFields(filing, [], [], []);
    const tp = group(groups, 'Taxpayer');
    expect(field(tp, 'Filing Reference')).toEqual({ label: 'Filing Reference', value: 'LF-2025-001', copyText: 'LF-2025-001' });
    expect(field(tp, 'Income Year')?.copyText).toBe('2025');
    expect(field(tp, 'LIRS Year of Assessment')?.copyText).toBe('2026');
  });

  it('uses a dash and empty copy text when there is no filing reference', () => {
    const groups = service.buildReferenceFields({ ...filing, filingReference: undefined }, [], [], []);
    const ref = field(group(groups, 'Taxpayer'), 'Filing Reference');
    expect(ref?.value).toBe('—');
    expect(ref?.copyText).toBe('');
  });

  it('only lists non-zero income types plus Other Income, and omits optional sections', () => {
    const groups = service.buildReferenceFields(filing, [income({ incomeType: 'employment', grossAmountNgn: 5_000_000 })], [], []);
    const inc = group(groups, 'Income Declaration')!;
    expect(inc.fields.map(f => f.label)).toEqual(['Salary / Employment', 'Other Income']);
    expect(field(inc, 'Other Income')?.value).toBe('0');
    expect(field(inc, 'Salary / Employment')?.copyText).toBe('5000000');
    expect(group(groups, 'Capital Allowances')).toBeUndefined();
    expect(group(groups, 'Tax Computation')).toBeUndefined();
    expect(group(groups, 'Deductions & Reliefs')?.fields).toEqual([]);
  });

  it('values benefits-in-kind by category and caps accommodation at 20% of employment income', () => {
    const groups = service.buildReferenceFields(filing, [
      income({ incomeType: 'employment', grossAmountNgn: 1_000_000 }),
      income({ incomeType: 'benefits_in_kind', bikCategory: 'employer_owned_asset', bikCost: 2_000_000 }),
      income({ incomeType: 'benefits_in_kind', bikCategory: 'accommodation', bikCost: 150_000 }),
      income({ incomeType: 'benefits_in_kind', bikCategory: 'accommodation', bikCost: 150_000 }),
      income({ incomeType: 'benefits_in_kind', bikCategory: 'rented_asset', bikCost: -10 }),
      income({ incomeType: 'benefits_in_kind', grossAmountNgn: 7 }),
    ], [], []);
    // 100,000 asset + 150,000 + 50,000 accommodation (cap 200,000) + 0 + 7 uncategorised
    expect(field(group(groups, 'Income Declaration'), 'Benefits-in-Kind')?.copyText).toBe('300007');
  });

  it('uses the capital gain rather than proceeds and sums every income type', () => {
    const types: IncomeEntry['incomeType'][] = ['business', 'rental', 'dividend', 'interest', 'digital_asset', 'royalty', 'prize', 'other'];
    const groups = service.buildReferenceFields(filing, [
      income({ incomeType: 'capital_gain_shares', grossAmountNgn: 9_000_000, cgtGain: 400_000 }),
      income({ incomeType: 'capital_gain_shares', grossAmountNgn: 1_000 }),
      ...types.map((t, i) => income({ incomeType: t, grossAmountNgn: (i + 1) * 1000 })),
    ], [], []);
    const inc = group(groups, 'Income Declaration')!;
    expect(field(inc, 'Capital Gains')?.copyText).toBe('401000');
    expect(field(inc, 'Trade / Business')?.copyText).toBe('1000');
    expect(field(inc, 'Rental Income')?.copyText).toBe('2000');
    expect(field(inc, 'Dividend')?.copyText).toBe('3000');
    expect(field(inc, 'Interest')?.copyText).toBe('4000');
    expect(field(inc, 'Digital Asset')?.copyText).toBe('5000');
    expect(field(inc, 'Royalty')?.copyText).toBe('6000');
    expect(field(inc, 'Prize / Winnings')?.copyText).toBe('7000');
    expect(field(inc, 'Other Income')?.value).toBe('8,000');
  });

  it('summarises foreign income per currency with an effective exchange rate', () => {
    const groups = service.buildReferenceFields(filing, [
      income({ incomeType: 'business', isForeign: true, foreignCurrency: ' usd ', foreignAmount: 100, grossAmountNgn: 150_000, fxRateUsed: 1500 }),
      income({ incomeType: 'business', isForeign: true, foreignCurrency: 'USD', foreignAmount: 100, grossAmountNgn: 160_000 }),
      income({ incomeType: 'business', isForeign: true, foreignAmount: 0, grossAmountNgn: 0, fxRateUsed: 1600 }),
      income({ incomeType: 'business', isForeign: true, foreignCurrency: 'GBP' }),
    ], [], []);
    const inc = group(groups, 'Income Declaration')!;
    expect(field(inc, 'Foreign Currency Amount (USD)')?.copyText).toBe('200');
    expect(field(inc, 'Foreign Currency Amount (USD)')?.value).toBe('USD 200');
    expect(field(inc, 'Exchange Rate (USD/NGN)')?.copyText).toBe('1550');
    expect(inc.fields.filter(f => f.label.includes('GBP')).length).toBe(0);
  });

  it('falls back to the recorded rate when the foreign amount is zero', () => {
    const groups = service.buildReferenceFields(filing, [
      income({ incomeType: 'other', isForeign: true, foreignCurrency: 'EUR', foreignAmount: 0, grossAmountNgn: 0, fxRateUsed: 1700.123456 }),
    ], [], []);
    expect(field(group(groups, 'Income Declaration'), 'Exchange Rate (EUR/NGN)')?.copyText).toBe('1700.1235');
  });

  it('lists capital allowances with cost, rate and a total', () => {
    const allowance = (desc: string, amount: number): CapitalAllowance => ({
      id: desc || 'x', filingId: 'f-1', assetDescription: desc, assetType: 'computer_laptop', assetCost: 400_000,
      acquisitionDate: '2025-01-01', taxWrittenDownValue: 300_000, annualAllowanceRate: 0.25, annualAllowanceAmount: amount,
    } as CapitalAllowance);
    const groups = service.buildReferenceFields(filing, [], [allowance('MacBook', 100_000), allowance('', 50_000)], []);
    const ca = group(groups, 'Capital Allowances')!;
    expect(ca.fields.map(f => f.label)).toEqual(['MacBook', 'computer_laptop', 'Total Capital Allowances']);
    expect(ca.fields[0].value).toBe('₦100,000.00');
    expect(ca.fields[0].description).toBe('Cost: ₦400,000.00 · Rate: 25%');
    expect(field(ca, 'Total Capital Allowances')?.copyText).toBe('150000');
  });

  it('labels reliefs and drops zero rows when there is no computation', () => {
    const groups = service.buildReferenceFields(filing, [], [], [
      relief('pension', 200_000), relief('nhis', 0, 10), relief('nhf', 0), relief('wht', 30_000),
      relief('life_assurance', 5), relief('custom' as ReliefEntry['reliefType'], 9),
    ]);
    const labels = group(groups, 'Deductions & Reliefs')!.fields.map(f => f.label);
    expect(labels).toEqual(['Pension Contribution', 'NHIS (Health Insurance)', 'Withholding Tax Credit', 'Life Assurance', 'custom']);
  });

  it('replaces credit rows with computed credits and adds the computation section', () => {
    const groups = service.buildReferenceFields(filing, [], [], [
      relief('pension', 200_000), relief('wht', 30_000), relief('paye', 100_000), relief('foreign_tax', 25_000),
    ], computation);
    const ded = group(groups, 'Deductions & Reliefs')!;
    expect(ded.fields.map(f => f.label)).toEqual([
      'Pension Contribution', 'Consolidated Relief Allowance (CRA)', 'Rent Relief Applied',
      'WHT Credits', 'PAYE Credits', 'Foreign Tax Credits',
    ]);
    expect(field(ded, 'WHT Credits')?.copyText).toBe('50000');
    const tax = group(groups, 'Tax Computation')!;
    expect(tax.fields.map(f => f.copyText)).toEqual(['6000000', '5000000', '700000', '525000', '0', '525000']);
    expect(field(tax, 'Minimum Tax')?.value).toBe('₦0.00');
  });

  it('skips zero or missing computed credits', () => {
    const groups = service.buildReferenceFields(filing, [], [], [], {
      ...computation, consolidatedReliefAllowance: undefined, rentReliefApplied: 0, whtCredits: 0,
      payeCredits: undefined, foreignTaxCredits: undefined,
    });
    expect(group(groups, 'Deductions & Reliefs')!.fields).toEqual([]);
  });
});
