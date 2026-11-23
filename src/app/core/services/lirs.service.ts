import { Injectable, inject } from '@angular/core';
import { TauriService } from './tauri.service';
import {
  LIRSAutomationResult, LIRSFieldGroup, LIRSFieldItem,
  Filing, IncomeEntry, CapitalAllowance, ReliefEntry,
  ComputationResult,
} from '../models';

@Injectable({ providedIn: 'root' })
export class LIRSService {
  private readonly tauri = inject(TauriService);

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

    groups.push({
      section: 'Taxpayer',
      fields: [
        { label: 'Filing Reference', value: filing.filingReference ?? '—', copyText: filing.filingReference ?? '' },
        { label: 'Income Year', value: filing.yearOfAssessment, copyText: String(filing.yearOfAssessment) },
        { label: 'LIRS Year of Assessment', value: filing.yearOfAssessment + 1, copyText: String(filing.yearOfAssessment + 1) },
      ],
    });

    const incomeByType = this.aggregateIncomeByType(incomeEntries);
    const incomeFields = [
      { label: 'Salary / Employment', value: this.fmt(incomeByType.employment), copyText: String(incomeByType.employment) },
      { label: 'Benefits-in-Kind', value: this.fmt(incomeByType.benefitsInKind), copyText: String(incomeByType.benefitsInKind) },
      { label: 'Trade / Business', value: this.fmt(incomeByType.business), copyText: String(incomeByType.business) },
      { label: 'Rental Income', value: this.fmt(incomeByType.rental), copyText: String(incomeByType.rental) },
      { label: 'Dividend', value: this.fmt(incomeByType.dividend), copyText: String(incomeByType.dividend) },
      { label: 'Interest', value: this.fmt(incomeByType.interest), copyText: String(incomeByType.interest) },
      { label: 'Capital Gains', value: this.fmt(incomeByType.capitalGain), copyText: String(incomeByType.capitalGain) },
      { label: 'Digital Asset', value: this.fmt(incomeByType.digitalAsset), copyText: String(incomeByType.digitalAsset) },
      { label: 'Royalty', value: this.fmt(incomeByType.royalty), copyText: String(incomeByType.royalty) },
      { label: 'Prize / Winnings', value: this.fmt(incomeByType.prize), copyText: String(incomeByType.prize) },
      { label: 'Other Income', value: this.fmt(incomeByType.other), copyText: String(incomeByType.other) },
    ].filter(f => Number(f.copyText) > 0 || f.label === 'Other Income');

    // Foreign income summary grouped by actual currency code
    const foreignEntries = incomeEntries.filter(e => e.isForeign && e.foreignAmount != null);
    if (foreignEntries.length > 0) {
      const byCurr = new Map<string, { amount: number; ngn: number; rate: number }>();
      for (const e of foreignEntries) {
        const curr = (e.foreignCurrency || 'USD').trim().toUpperCase();
        const prev = byCurr.get(curr) ?? { amount: 0, ngn: 0, rate: 0 };
        prev.amount += e.foreignAmount ?? 0;
        prev.ngn += e.grossAmountNgn ?? 0;
        if (e.fxRateUsed) prev.rate = e.fxRateUsed;
        byCurr.set(curr, prev);
      }
      for (const [curr, acc] of byCurr.entries()) {
        const effRate = acc.amount > 0 && acc.ngn > 0 ? acc.ngn / acc.amount : acc.rate;
        incomeFields.push(
          { label: `Foreign Currency Amount (${curr})`, value: `${curr} ${this.fmt(acc.amount)}`, copyText: String(acc.amount) },
          { label: `Exchange Rate (${curr}/NGN)`, value: String(Number(effRate.toFixed(4))), copyText: String(Number(effRate.toFixed(4))) },
        );
      }
    }

    groups.push({ section: 'Income Declaration', fields: incomeFields });

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

    const creditTypes = new Set(['wht', 'paye', 'foreign_tax']);
    const reliefFields: LIRSFieldItem[] = reliefs
      .filter(r => (r.claimedAmount > 0 || r.approvedAmount > 0) && (!computation || !creditTypes.has(r.reliefType)))
      .map(r => ({
        label: this.reliefLabel(r.reliefType),
        value: this.fmt(r.claimedAmount, true),
        copyText: String(r.claimedAmount),
      }));
    if (computation) {
      const cra = computation.consolidatedReliefAllowance ?? 0;
      if (cra > 0) {
        reliefFields.push({ label: 'Consolidated Relief Allowance (CRA)', value: this.fmt(cra, true), copyText: String(cra) });
      }
      if (computation.rentReliefApplied > 0) {
        reliefFields.push({ label: 'Rent Relief Applied', value: this.fmt(computation.rentReliefApplied, true), copyText: String(computation.rentReliefApplied) });
      }
      if (computation.whtCredits > 0) {
        reliefFields.push({ label: 'WHT Credits', value: this.fmt(computation.whtCredits, true), copyText: String(computation.whtCredits) });
      }
      const paye = computation.payeCredits ?? 0;
      if (paye > 0) {
        reliefFields.push({ label: 'PAYE Credits', value: this.fmt(paye, true), copyText: String(paye) });
      }
      const ftc = computation.foreignTaxCredits ?? 0;
      if (ftc > 0) {
        reliefFields.push({ label: 'Foreign Tax Credits', value: this.fmt(ftc, true), copyText: String(ftc) });
      }
    }
    groups.push({ section: 'Deductions & Reliefs', fields: reliefFields });

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
    const totalEmployment = entries
      .filter(e => e.incomeType === 'employment')
      .reduce((sum, e) => sum + Math.max(e.grossAmountNgn, 0), 0);
    let remainingAccomCap = totalEmployment * 0.2;

    for (const e of entries) {
      let val = e.grossAmountNgn;
      if (e.incomeType === 'benefits_in_kind' && e.bikCategory && e.bikCost != null) {
        const cost = Math.max(e.bikCost, 0);
        if (e.bikCategory === 'employer_owned_asset') {
          val = cost * 0.05;
        } else if (e.bikCategory === 'accommodation') {
          val = Math.min(cost, remainingAccomCap);
          remainingAccomCap = Math.max(remainingAccomCap - val, 0);
        } else {
          val = cost;
        }
      } else if (e.incomeType === 'capital_gain_shares' && e.cgtGain != null) {
        val = e.cgtGain;
      }
      map[e.incomeType] = (map[e.incomeType] ?? 0) + val;
    }
    return {
      employment: map['employment'] ?? 0,
      benefitsInKind: map['benefits_in_kind'] ?? 0,
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
      rent: 'Rent paid',
      wht: 'Withholding Tax Credit',
      paye: 'PAYE Already Deducted',
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
