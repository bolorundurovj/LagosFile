import { Injectable, inject } from '@angular/core';
import { TauriService } from './tauri.service';
import {
  LIRSAutomationResult, LIRSFieldGroup, LIRSFieldItem,
  Filing, IncomeEntry, CapitalAllowance, ReliefEntry,
  ComputationResult,
} from '../models';

@Injectable({ providedIn: 'root' })
export class LIRSService {
  private tauri = inject(TauriService);

  async fileWithLirs(filingId: string): Promise<LIRSAutomationResult> {
    return this.tauri.invoke<LIRSAutomationResult>('open_lirs_portal', { id: filingId });
  }

  /** Start the LIRS bridge with ALL confirmed filings so the extension
   *  picker shows the full list. */
  async openLirsPortalAll(): Promise<LIRSAutomationResult> {
    return this.tauri.invoke<LIRSAutomationResult>('open_lirs_portal_all');
  }

  /**
   * Build a list of field groups for the Reference Panel from a loaded filing
   * and its associated entries. Each group has fields with label, value, and
   * copy-ready text.
   */
  buildReferenceFields(
    filing: Filing,
    incomeEntries: IncomeEntry[],
    allowances: CapitalAllowance[],
    reliefs: ReliefEntry[],
    computation?: ComputationResult,
  ): LIRSFieldGroup[] {
    const groups: LIRSFieldGroup[] = [];

    // ── Taxpayer Info ──
    groups.push({
      section: 'Taxpayer',
      fields: [
        { label: 'Filing Reference', value: filing.filingReference ?? '—', copyText: filing.filingReference ?? '' },
        { label: 'Year of Assessment', value: filing.yearOfAssessment, copyText: String(filing.yearOfAssessment) },
      ],
    });

    // ── Income Declaration ──
    const incomeByType = this.aggregateIncomeByType(incomeEntries);
    const incomeFields = [
      { label: 'Salary / Employment', value: this.fmt(incomeByType.employment), copyText: String(incomeByType.employment) },
      { label: 'Trade / Business', value: this.fmt(incomeByType.business), copyText: String(incomeByType.business) },
      { label: 'Rental Income', value: this.fmt(incomeByType.rental), copyText: String(incomeByType.rental) },
      { label: 'Dividend', value: this.fmt(incomeByType.dividend), copyText: String(incomeByType.dividend) },
      { label: 'Interest', value: this.fmt(incomeByType.interest), copyText: String(incomeByType.interest) },
      { label: 'Capital Gains', value: this.fmt(incomeByType.capitalGain), copyText: String(incomeByType.capitalGain) },
      { label: 'Digital Asset', value: this.fmt(incomeByType.digitalAsset), copyText: String(incomeByType.digitalAsset) },
      { label: 'Royalty', value: this.fmt(incomeByType.royalty), copyText: String(incomeByType.royalty) },
      { label: 'Other Income', value: this.fmt(incomeByType.other), copyText: String(incomeByType.other) },
    ].filter(f => Number(f.copyText) > 0 || f.label === 'Other Income');

    // Foreign income summary
    const foreignEntries = incomeEntries.filter(e => e.isForeign && e.foreignAmount != null);
    if (foreignEntries.length > 0) {
      const totalForeign = foreignEntries.reduce((sum, e) => sum + (e.foreignAmount ?? 0), 0);
      const rate = foreignEntries[0]?.fxRateUsed ?? 0;
      incomeFields.push(
        { label: 'Foreign Currency Amount (USD)', value: `$${this.fmt(totalForeign)}`, copyText: String(totalForeign) },
        { label: 'Exchange Rate', value: String(rate), copyText: String(rate) },
      );
    }

    groups.push({ section: 'Income Declaration', fields: incomeFields });

    // ── Capital Allowances ──
    if (allowances.length > 0) {
      const totalCa = allowances.reduce((s, a) => s + a.annualAllowanceAmount, 0);
      const caFields: LIRSFieldItem[] = allowances.map(a => ({
        label: `${a.assetDescription || a.assetType}`,
        value: this.fmt(a.annualAllowanceAmount, true),
        copyText: String(a.annualAllowanceAmount),
        description: `Cost: ${this.fmt(a.assetCost, true)} · Rate: ${(a.annualAllowanceRate * 100).toFixed(0)}%`,
      }));
      caFields.push({ label: 'Total Capital Allowances', value: this.fmt(totalCa, true), copyText: String(totalCa) });
      groups.push({ section: 'Capital Allowances', fields: caFields });
    }

    // ── Deductions & Reliefs ──
    const reliefFields: LIRSFieldItem[] = reliefs.map(r => ({
      label: this.reliefLabel(r.reliefType),
      value: this.fmt(r.claimedAmount, true),
      copyText: String(r.claimedAmount),
    }));
    if (computation) {
      reliefFields.push({ label: 'Rent Relief Applied', value: this.fmt(computation.rentReliefApplied, true), copyText: String(computation.rentReliefApplied) });
      reliefFields.push({ label: 'WHT Credits', value: this.fmt(computation.whtCredits, true), copyText: String(computation.whtCredits) });
    }
    groups.push({ section: 'Deductions & Reliefs', fields: reliefFields });

    // ── Computation Summary ──
    if (computation) {
      groups.push({
        section: 'Tax Computation',
        fields: [
          { label: 'Total Gross Income', value: this.fmt(computation.totalGrossIncome, true), copyText: String(computation.totalGrossIncome) },
          { label: 'Chargeable Income', value: this.fmt(computation.chargeableIncome, true), copyText: String(computation.chargeableIncome) },
          { label: 'Graduated Tax', value: this.fmt(computation.graduatedTax, true), copyText: String(computation.graduatedTax) },
          { label: 'Net Tax Payable', value: this.fmt(computation.netTaxPayable, true), copyText: String(computation.netTaxPayable) },
          { label: 'Minimum Tax', value: this.fmt(computation.minimumTax, true), copyText: String(computation.minimumTax) },
          { label: 'Final Tax Payable', value: this.fmt(computation.finalTaxPayable, true), copyText: String(computation.finalTaxPayable) },
        ],
      });
    }

    return groups;
  }

  private aggregateIncomeByType(entries: IncomeEntry[]) {
    const map: Record<string, number> = {};
    for (const e of entries) {
      map[e.incomeType] = (map[e.incomeType] ?? 0) + e.grossAmountNgn;
    }
    return {
      employment: map['employment'] ?? 0,
      business: map['business'] ?? 0,
      rental: map['rental'] ?? 0,
      dividend: map['dividend'] ?? 0,
      interest: map['interest'] ?? 0,
      capitalGain: map['capital_gain_shares'] ?? 0,
      digitalAsset: map['digital_asset'] ?? 0,
      royalty: map['royalty'] ?? 0,
      prize: map['prize'] ?? 0,
      other: map['other'] ?? 0,
    };
  }

  private reliefLabel(type: string): string {
    const labels: Record<string, string> = {
      pension: 'Pension Contribution',
      nhis: 'NHIS (Health Insurance)',
      nhf: 'NHF (National Housing Fund)',
      rent: 'Rent Relief',
      wht: 'Withholding Tax Credit',
      life_assurance: 'Life Assurance',
      foreign_tax: 'Foreign Tax Credit',
      other_approved: 'Other Approved Deduction',
    };
    return labels[type] ?? type;
  }

  private fmt(n: number, currency?: boolean): string {
    if (n === 0 && !currency) return '0';
    const formatted = Math.abs(n).toLocaleString('en-NG', currency ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined);
    return currency ? `₦${formatted}` : formatted;
  }
}
