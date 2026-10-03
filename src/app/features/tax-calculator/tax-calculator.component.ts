import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FilingService } from '../../core/services/filing.service';
import { ComputationResult, IncomeType } from '../../core/models';
import { NairaPipe } from '../../shared/pipes/naira.pipe';
import { HelpTooltipComponent } from '../../shared/components/help-tooltip/help-tooltip.component';

const INCOME_TYPES: { value: IncomeType; label: string }[] = [
  { value: 'employment', label: 'Employment' },
  { value: 'business', label: 'Business / Trade' },
  { value: 'rental', label: 'Rental' },
  { value: 'dividend', label: 'Dividend' },
  { value: 'interest', label: 'Interest' },
  { value: 'capital_gain_shares', label: 'Share Gains' },
  { value: 'digital_asset', label: 'Digital Assets' },
  { value: 'royalty', label: 'Royalties' },
  { value: 'other', label: 'Other' },
];

interface IncomeLine { incomeType: IncomeType; grossAmountNgn: number; cgtProceeds?: number; }

@Component({
  selector: 'lf-tax-calculator',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule, NairaPipe, HelpTooltipComponent],
  templateUrl: './tax-calculator.component.html',
  styleUrl: './tax-calculator.component.scss',
})
export class TaxCalculatorComponent {
  private filingService = inject(FilingService);

  readonly incomeTypes = INCOME_TYPES;
  income: IncomeLine[] = [{ incomeType: 'employment', grossAmountNgn: 0 }];
  assetCost = 0;
  reliefs = { pension: 0, nhis: 0, nhf: 0, life_assurance: 0, rent: 0, wht: 0 };

  result = signal<ComputationResult | null>(null);
  error = signal<string | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  addIncome(): void {
    this.income = [...this.income, { incomeType: 'business', grossAmountNgn: 0 }];
  }

  removeIncome(i: number): void {
    this.income = this.income.filter((_, idx) => idx !== i);
    this.recompute();
  }

  recompute(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), 250);
  }

  effectiveRate(): number {
    const r = this.result();
    return r && r.totalGrossIncome > 0 ? r.finalTaxPayable / r.totalGrossIncome : 0;
  }

  private async run(): Promise<void> {
    try {
      const income = this.income.map(l => ({
        incomeType: l.incomeType,
        grossAmountNgn: l.grossAmountNgn || 0,
        cgtProceeds: l.incomeType === 'capital_gain_shares' ? l.cgtProceeds ?? 0 : undefined,
        cgtGain: l.incomeType === 'capital_gain_shares' ? l.grossAmountNgn || 0 : undefined,
      }));
      const assets = this.assetCost > 0 ? [{ assetType: 'computer_laptop' as const, assetCost: this.assetCost }] : [];
      const reliefs = Object.entries(this.reliefs).map(([reliefType, amount]) => ({
        reliefType: reliefType as any, claimedAmount: amount || 0,
      }));
      this.result.set(await this.filingService.estimateTax(income, assets, reliefs));
      this.error.set(null);
    } catch (err) {
      this.error.set(String(err));
    }
  }
}
