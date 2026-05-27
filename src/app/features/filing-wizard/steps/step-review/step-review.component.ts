import { Component, input, output, inject, OnInit, signal } from '@angular/core';
import { FilingService } from '../../../../core/services/filing.service';
import { LIRSService } from '../../../../core/services/lirs.service';
import { ToastService } from '../../../../core/services/toast.service';
import {
  ComputationResult, LIRSFieldGroup, LIRSAutomationResult,
  Filing, IncomeEntry, CapitalAllowance, ReliefEntry,
} from '../../../../core/models';
import { NairaPipe } from '../../../../shared/pipes/naira.pipe';
import { HelpTooltipComponent } from '../../../../shared/components/help-tooltip/help-tooltip.component';
import { LIRSReferencePanelComponent } from '../../../../shared/components/lirs-reference-panel/lirs-reference-panel.component';
import { LucideAngularModule, AlertTriangle, Check, Info, Send } from 'lucide-angular';

@Component({
  selector: 'lf-step-review',
  standalone: true,
  imports: [NairaPipe, LucideAngularModule, HelpTooltipComponent, LIRSReferencePanelComponent],
  template: `
    <div class="step-page">
      <div class="step-page__header">
        <h2 class="headline-sm">Review & Confirm</h2>
        <p class="body-md text-muted">
          Review your full tax computation before confirming. Confirmed filings are immutable.
        </p>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height:500px;border-radius:var(--radius-xl)"></div>
      } @else if (confirmedFiling()) {
        <!-- Post-confirmation: success state -->
        <div class="card" style="text-align:center;padding:var(--space-8)">
          <div style="font-size:3rem;margin-bottom:var(--space-4);color:var(--color-success)">
            <lucide-icon name="check" [size]="48" [strokeWidth]="2.5"></lucide-icon>
          </div>
          <h2 class="headline-sm" style="margin-bottom:var(--space-2)">Filing Confirmed</h2>
          <p class="body-md" style="margin-bottom:var(--space-4)">
            Reference: <strong>{{ confirmedFiling()!.filingReference }}</strong>
          </p>

          <div class="computation-total" style="margin-bottom:var(--space-5)">
            <div class="total-label">Final Tax Payable</div>
            <div class="total-value">{{ confirmedFiling()!.finalTaxPayable ?? 0 | naira }}</div>
          </div>

          <p class="body-sm text-muted" style="margin-bottom:var(--space-6)">
            Your filing is ready to submit to LIRS. Click below to open the LIRS e-Tax portal.
            The extension will read your filing data from <code>~/LagosFile/pending_filing.json</code>.
          </p>

          <div class="flex gap-3 justify-center" style="flex-wrap:wrap">
            <button class="btn btn--ghost" (click)="onGoToHistory()">Go to History</button>
            <button
              class="btn btn--primary btn--lg"
              (click)="fileWithLirs()"
              [disabled]="filingWithLirs()"
            >
              @if (filingWithLirs()) {
                Opening Portal...
              } @else {
                <lucide-icon name="send" [size]="16" [strokeWidth]="2" style="vertical-align:middle;margin-right:6px"></lucide-icon>
                File with LIRS
              }
            </button>
          </div>
        </div>
      } @else if (result()) {
        <!-- Tax breakdown card -->
        <div class="card">
          <h3 class="title-md" style="margin-bottom:var(--space-5)">Tax Computation Breakdown</h3>

          <div class="breakdown-table">
            <div class="breakdown-row">
              <span>Total Gross Income<lf-help text="Sum of all income entries across all sources for the year of assessment, before any deductions."></lf-help></span>
              <span class="financial-value">{{ result()!.totalGrossIncome | naira }}</span>
            </div>
            <div class="breakdown-row breakdown-row--deduct">
              <span>Less: Capital Allowances<lf-help text="Annual allowances on qualifying professional assets, prorated to the taxable period (NTA 2025, Fourth Schedule)."></lf-help></span>
              <span class="financial-value">({{ result()!.proratedCapitalAllowances | naira }})</span>
            </div>
            <div class="breakdown-row breakdown-row--deduct">
              <span>Less: Deductions &amp; Reliefs<lf-help text="Total of pension, NHIS, NHF, life assurance, rent relief, WHT credits and other approved deductions."></lf-help></span>
              <span class="financial-value">({{ result()!.totalDeductions | naira }})</span>
            </div>
            <div class="breakdown-row breakdown-row--subtotal">
              <span>Chargeable Income<lf-help text="The income base on which tax rate bands are applied. = Gross Income − Capital Allowances − Deductions & Reliefs."></lf-help></span>
              <span class="financial-value">{{ result()!.chargeableIncome | naira }}</span>
            </div>
          </div>

          <!-- Band breakdown -->
          <div style="margin:var(--space-5) 0">
            <div class="label-sm" style="margin-bottom:var(--space-3)">TAX BY BAND</div>
            @for (band of result()!.bandBreakdown; track band.lower) {
              <div class="band-row">
                <span class="band-label">
                  {{ band.lower | naira }} – {{ band.upper != null ? (band.upper | naira) : 'above' }}
                  <span class="badge badge--draft" style="margin-left:4px">{{ (band.rate * 100).toFixed(0) }}%</span>
                </span>
                <div class="band-bar-wrapper">
                  <div class="band-bar"
                    [style.width.%]="bandPct(band.taxableAmount)"
                    [style.background]="bandColor(band.rate)">
                  </div>
                </div>
                <span class="financial-value band-amount">{{ band.taxAmount | naira }}</span>
              </div>
            }
          </div>

          <div class="breakdown-table" style="margin-top:var(--space-3)">
            <div class="breakdown-row">
              <span>Graduated Tax<lf-help text="Tax computed by applying the progressive rate bands (7% → 11% → 15% → 19% → 21% → 24%) to slices of chargeable income."></lf-help></span>
              <span class="financial-value">{{ result()!.graduatedTax | naira }}</span>
            </div>
            <div class="breakdown-row breakdown-row--deduct">
              <span>Less: WHT Credits<lf-help text="Withholding Tax already deducted at source by payers and evidenced by WHT receipts. Directly reduces tax payable."></lf-help></span>
              <span class="financial-value">({{ result()!.whtCredits | naira }})</span>
            </div>
            <div class="breakdown-row breakdown-row--subtotal">
              <span>Net Tax Payable<lf-help text="Graduated tax after subtracting WHT credits. Compared against minimum tax — the higher figure becomes the final liability."></lf-help></span>
              <span class="financial-value">{{ result()!.netTaxPayable | naira }}</span>
            </div>
          </div>

          <!-- Minimum tax comparison -->
          <div class="min-tax-panel">
            <div class="min-tax-panel__title">Minimum Tax Comparison<lf-help text="NTA 2025 s.43 may require a minimum tax of 1% of gross income regardless of deductions. Applicability to individuals is unconfirmed — verify with LIRS." align="left"></lf-help></div>
            <div class="min-tax-panel__row">
              <span>Graduated Tax<lf-help text="Tax computed by applying the progressive rate bands (7% → 11% → 15% → 19% → 21% → 24%) to slices of chargeable income."></lf-help></span>
              <span [class.highlighted]="result()!.graduatedTax >= result()!.minimumTax">
                {{ result()!.netTaxPayable | naira }}
              </span>
            </div>
            <div class="min-tax-panel__row">
              <span>1% Minimum Tax (of gross income)</span>
              <span [class.highlighted]="result()!.minimumTax > result()!.graduatedTax">
                {{ result()!.minimumTax | naira }}
              </span>
            </div>
            <div class="alert alert--warning" style="margin-top:var(--space-3)">
              <span class="alert__icon"><lucide-icon name="alert-triangle" [size]="16" [strokeWidth]="2"></lucide-icon></span>
              <div class="alert__content">
                The applicability of the 1% minimum tax rule to individuals under NTA 2025 is unconfirmed.
                This computation applies the rule as configured. Verify with LIRS or a tax advisor.
              </div>
            </div>
          </div>

          @if (result()!.cgtExemptAmount > 0) {
            <div class="alert alert--success" style="margin-top:var(--space-4)">
              <span class="alert__icon"><lucide-icon name="check" [size]="16" [strokeWidth]="2.5"></lucide-icon></span>
              <div class="alert__content">
                <strong>CGT Exemption Applied:</strong>
                {{ result()!.cgtExemptAmount | naira }} excluded from chargeable income.
                Proceeds &lt; ₦150,000,000 and gain ≤ ₦10,000,000.
              </div>
            </div>
          }

          @if (result()!.digitalAssetLossRingfenced > 0) {
            <div class="alert alert--info" style="margin-top:var(--space-3)">
              <span class="alert__icon"><lucide-icon name="info" [size]="16" [strokeWidth]="2"></lucide-icon></span>
              <div class="alert__content">
                {{ result()!.digitalAssetLossRingfenced | naira }} in digital asset losses
                ring-fenced — applied only against digital asset gains, not other income.
              </div>
            </div>
          }
        </div>

        <!-- Final total -->
        <div class="computation-total">
          <div class="total-label">Final Tax Payable<lf-help text="The higher of net graduated tax and minimum tax. This is the amount you owe LIRS for the year of assessment." align="left"></lf-help></div>
          <div class="total-value">{{ result()!.finalTaxPayable | naira }}</div>
          <div style="font-size:var(--text-label-sm);opacity:0.7;margin-top:var(--space-2)">
            Tax Config: {{ result()!.configVersion }}
          </div>
        </div>

        <!-- Confirm warning -->
        <div class="alert alert--warning">
          <span class="alert__icon"><lucide-icon name="alert-triangle" [size]="16" [strokeWidth]="2"></lucide-icon></span>
          <div class="alert__content">
            <strong>Once confirmed, this filing is immutable.</strong>
            You may file an amendment separately but the original record will not be altered.
          </div>
        </div>
      }

      <!-- Nav buttons (pre-confirmation) -->
      @if (!confirmedFiling()) {
        <div class="step-nav">
          <button class="btn btn--ghost btn--lg" (click)="back.emit()">← Back</button>
          <div class="flex gap-3">
            <button class="btn btn--secondary btn--lg" (click)="saveDraft()" [disabled]="confirming()">
              Save for Later
            </button>
            <button class="btn btn--primary btn--lg" (click)="confirm()" [disabled]="confirming() || loading()">
              @if (confirming()) { Confirming… } @else {
                <lucide-icon name="check" [size]="16" [strokeWidth]="2.5" style="vertical-align:middle;margin-right:4px"></lucide-icon>Confirm Filing
              }
            </button>
          </div>
        </div>
      }

      <!-- Reference Panel -->
      <lf-lirs-reference-panel
        [visible]="showReferencePanel()"
        [fieldGroups]="referenceFields()"
        [statusMessage]="referenceStatus()"
        [showMarkSubmitted]="true"
        (close)="showReferencePanel.set(false)"
        (markSubmitted)="onMarkSubmitted()"
      />
    </div>
  `,
  styles: [`
    .step-page { display: flex; flex-direction: column; gap: var(--space-6); }
    .step-page__header { display: flex; flex-direction: column; gap: var(--space-2); }

    .breakdown-table { display: flex; flex-direction: column; }
    .breakdown-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: var(--space-3) 0;
      border-bottom: 1px solid var(--color-surface-container);
      font-size: var(--text-body-md);
    }
    .breakdown-row--deduct { color: var(--color-on-surface-variant); }
    .breakdown-row--subtotal {
      font-weight: var(--font-weight-semibold);
      font-size: var(--text-title-sm);
      border-bottom: 2px solid var(--color-surface-container-highest);
    }

    .band-row {
      display: flex; align-items: center; gap: var(--space-3);
      padding: var(--space-2) 0;
    }
    .band-label { min-width: 220px; font-size: var(--text-body-sm); }
    .band-bar-wrapper {
      flex: 1; height: 8px; background: var(--color-surface-container);
      border-radius: var(--radius-full); overflow: hidden;
    }
    .band-bar { height: 100%; border-radius: var(--radius-full); transition: width 0.4s ease; }
    .band-amount { min-width: 140px; font-size: var(--text-body-sm); }

    .min-tax-panel {
      margin-top: var(--space-5);
      background: var(--color-surface-container-low);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
    }
    .min-tax-panel__title { font-size: var(--text-label-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-3); }
    .min-tax-panel__row {
      display: flex; justify-content: space-between;
      font-size: var(--text-body-md); padding: var(--space-2) 0;
    }
    .highlighted { font-weight: var(--font-weight-bold); color: var(--color-primary); }

    .step-nav { display: flex; justify-content: space-between; align-items: center; padding-top: var(--space-4); border-top: 1px solid var(--color-surface-container); }

    .justify-center { justify-content: center; }
    .flex-1 { flex: 1; }
  `],
})
export class StepReviewComponent implements OnInit {
  filingId = input.required<string>();
  back = output<void>();
  confirmed = output<void>();

  private filingService = inject(FilingService);
  private lirsService = inject(LIRSService);
  private toast = inject(ToastService);

  result = signal<ComputationResult | null>(null);
  loading = signal(true);
  confirming = signal(false);

  confirmedFiling = signal<Filing | null>(null);
  filingWithLirs = signal(false);
  showReferencePanel = signal(false);
  referenceFields = signal<LIRSFieldGroup[]>([]);
  referenceStatus = signal('');

  async ngOnInit(): Promise<void> {
    try {
      const r = await this.filingService.compute(this.filingId());
      this.result.set(r);
    } finally {
      this.loading.set(false);
    }
  }

  bandPct(amount: number): number {
    const total = this.result()?.chargeableIncome ?? 1;
    return Math.min((amount / total) * 100, 100);
  }

  bandColor(rate: number): string {
    const shades: Record<string, string> = {
      '0':    '#cce0ff',
      '0.07': '#99c2ff',
      '0.11': '#5599ff',
      '0.15': '#2277ee',
      '0.19': '#0055cc',
      '0.21': '#003da0',
      '0.24': '#002880',
    };
    return shades[String(rate)] ?? '#5599ff';
  }

  async saveDraft(): Promise<void> {
    this.back.emit();
  }

  async confirm(): Promise<void> {
    const r = this.result();
    if (!r) return;
    this.confirming.set(true);
    try {
      const filing = await this.filingService.confirmFiling(this.filingId(), r);
      this.confirmedFiling.set(filing);
      this.confirmed.emit();
    } finally {
      this.confirming.set(false);
    }
  }

  onGoToHistory(): void {
    this.confirmed.emit();
  }

  async fileWithLirs(): Promise<void> {
    this.filingWithLirs.set(true);
    try {
      const res = await this.lirsService.fileWithLirs(this.filingId());
      if (res.fallbackActive) {
        this.showReferencePanel.set(true);
        this.referenceStatus.set(res.message);
        this.loadReferenceFields();
      } else {
        this.toast.success(res.message);
      }
    } catch (err: unknown) {
      this.toast.error(
        'Failed to open LIRS portal: ' + (err instanceof Error ? err.message : String(err))
      );
      this.showReferencePanel.set(true);
      this.referenceStatus.set('Could not open LIRS portal automatically. Use the values below to fill Form A manually.');
      this.loadReferenceFields();
    } finally {
      this.filingWithLirs.set(false);
    }
  }

  private async loadReferenceFields(): Promise<void> {
    try {
      const filing = this.confirmedFiling();
      if (!filing) return;
      const [incomeEntries, allowances, reliefs] = await Promise.all([
        this.filingService.listIncomeEntries(filing.id),
        this.filingService.listAllowances(filing.id),
        this.filingService.listReliefEntries(filing.id),
      ]);
      const fields = this.lirsService.buildReferenceFields(
        filing, incomeEntries, allowances, reliefs, this.result() ?? undefined,
      );
      this.referenceFields.set(fields);
    } catch {
      this.referenceFields.set([]);
    }
  }

  async onMarkSubmitted(): Promise<void> {
    const f = this.confirmedFiling();
    if (!f) return;
    try {
      await this.filingService.markSubmitted(f.id);
      this.toast.success('Filing marked as Submitted.');
      this.showReferencePanel.set(false);
      this.confirmed.emit();
    } catch (err: unknown) {
      this.toast.error(
        'Failed to mark as submitted: ' + (err instanceof Error ? err.message : String(err))
      );
    }
  }
}
