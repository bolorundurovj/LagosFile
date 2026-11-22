import { Component, input, output, inject, OnInit, signal, computed } from '@angular/core';
import { FilingService } from '../../../../core/services/filing.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ComputationResult, Filing } from '../../../../core/models';
import { NairaPipe } from '../../../../shared/pipes/naira.pipe';
import { HelpTooltipComponent } from '../../../../shared/components/help-tooltip/help-tooltip.component';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'lf-step-review',
  standalone: true,
  imports: [NairaPipe, LucideAngularModule, HelpTooltipComponent],
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
            @if ((result()!.consolidatedReliefAllowance ?? 0) > 0) {
              <div class="breakdown-row breakdown-row--deduct">
                <span>Includes: Consolidated Relief Allowance (PITA)<lf-help text="Higher of ₦200,000 or 1% of gross income plus 20% of gross income after tax-exempt items (PITA / Finance Act 2020)."></lf-help></span>
                <span class="financial-value">({{ result()!.consolidatedReliefAllowance | naira }})</span>
              </div>
            }
            <div class="breakdown-row breakdown-row--deduct">
              <span>Less: Deductions &amp; Reliefs<lf-help text="Total of pension, NHIS, NHF, life assurance, rent relief (NTA 2025) or CRA (PITA), and other approved deductions."></lf-help></span>
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
            @for (band of result()!.bandBreakdown; track band.lower; let idx = $index) {
              <div class="band-row">
                <span class="band-label">
                  {{ band.lower | naira }} – {{ band.upper != null ? (band.upper | naira) : 'above' }}
                  <span class="badge badge--draft" style="margin-left:4px">{{ (band.rate * 100).toFixed(0) }}%</span>
                </span>
                <div class="band-bar-wrapper">
                  <div class="band-bar"
                    [style.width.%]="bandPct(band.taxableAmount)"
                    [style.background]="bandColor(idx)">
                  </div>
                </div>
                <span class="financial-value band-amount">{{ band.taxAmount | naira }}</span>
              </div>
            }
          </div>

          <div class="breakdown-table" style="margin-top:var(--space-3)">
            <div class="breakdown-row">
              <span>Graduated Tax<lf-help [text]="graduatedTaxTooltip()"></lf-help></span>
              <span class="financial-value">{{ result()!.graduatedTax | naira }}</span>
            </div>
            @if (result()!.minimumTax > 0) {
              <div class="breakdown-row">
                <span>Minimum Tax Floor<lf-help text="Minimum tax liability floor configured for this return's tax regime, applied before subtracting tax credits."></lf-help></span>
                <span class="financial-value">{{ result()!.minimumTax | naira }}</span>
              </div>
            }
            <div class="breakdown-row breakdown-row--deduct">
              <span>Less: WHT Credits<lf-help text="Withholding Tax already deducted at source by payers and evidenced by WHT receipts. Directly reduces tax payable after any minimum tax floor."></lf-help></span>
              <span class="financial-value">({{ result()!.whtCredits | naira }})</span>
            </div>
            @if ((result()!.payeCredits ?? 0) > 0) {
              <div class="breakdown-row breakdown-row--deduct">
                <span>Less: PAYE Credits<lf-help text="PAYE tax already withheld by your employer(s) during the income year. Directly reduces tax payable."></lf-help></span>
                <span class="financial-value">({{ result()!.payeCredits | naira }})</span>
              </div>
            }
            @if ((result()!.foreignTaxCredits ?? 0) > 0) {
              <div class="breakdown-row breakdown-row--deduct">
                <span>Less: Foreign Tax Credits<lf-help text="Double-taxation credit for foreign tax paid on foreign income, capped per entry at the Nigerian tax attributable to that entry."></lf-help></span>
                <span class="financial-value">({{ result()!.foreignTaxCredits | naira }})</span>
              </div>
            }
            <div class="breakdown-row breakdown-row--subtotal">
              <span>Net Tax Payable<lf-help text="Tax liability after applying any minimum tax floor and subtracting tax credits (floored at zero)."></lf-help></span>
              <span class="financial-value">{{ result()!.netTaxPayable | naira }}</span>
            </div>
          </div>

          <!-- Minimum tax comparison (shown only when a minimum tax floor applies) -->
          @if (result()!.minimumTax > 0) {
            <div class="min-tax-panel">
              <div class="min-tax-panel__title">Minimum Tax Floor Comparison<lf-help text="The higher of graduated tax and the configured minimum tax floor is used before tax credits are deducted." align="left"></lf-help></div>
              <div class="min-tax-panel__row">
                <span>Graduated Tax<lf-help [text]="graduatedTaxTooltip()"></lf-help></span>
                <span [class.highlighted]="result()!.graduatedTax >= result()!.minimumTax">
                  {{ result()!.graduatedTax | naira }}
                </span>
              </div>
              <div class="min-tax-panel__row">
                <span>Minimum Tax Floor ({{ minTaxRateLabel() }} of gross income)</span>
                <span [class.highlighted]="result()!.minimumTax > result()!.graduatedTax">
                  {{ result()!.minimumTax | naira }}
                </span>
              </div>
            </div>
          }

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
          <div class="total-label">Final Tax Payable<lf-help text="Graduated tax (or minimum tax floor, if higher) less WHT, PAYE, and foreign tax credits. This is the amount you owe LIRS for the year of assessment." align="left"></lf-help></div>
          <div class="total-value">{{ result()!.finalTaxPayable | naira }}</div>
          <div style="font-size:var(--text-label-sm);opacity:0.7;margin-top:var(--space-2)">
            Tax Config: {{ result()!.configVersion }}
          </div>
        </div>

        @if (comparison(); as cmp) {
          <div class="card yoy">
            <h3 class="title-md">Compared with YOA {{ cmp.priorYoa }}<lf-help text="Checks this return against last year's confirmed filing. Large swings are not errors, but they are worth double-checking before you confirm." align="left"></lf-help></h3>
            <table class="yoy__table">
              <thead><tr><th></th><th class="align-right">YOA {{ cmp.priorYoa }}</th><th class="align-right">This return</th><th class="align-right">Change</th></tr></thead>
              <tbody>
                @for (row of cmp.rows; track row.label) {
                  <tr [class.yoy__flag]="row.flagged">
                    <td>{{ row.label }}</td>
                    <td class="align-right">{{ row.prior | naira }}</td>
                    <td class="align-right">{{ row.current | naira }}</td>
                    <td class="align-right">
                      {{ row.delta >= 0 ? '+' : '−' }}{{ (row.delta < 0 ? -row.delta : row.delta) | naira }}
                      @if (row.pct !== null) { ({{ row.pct >= 0 ? '+' : '' }}{{ row.pct.toFixed(0) }}%) }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            @if (cmp.flagged) {
              <p class="body-sm yoy__note">Highlighted lines moved by more than {{ flagPct }}% from last year. Check that no income or relief is missing or duplicated.</p>
            }
          </div>
        }

        <!-- Confirm warning -->
        <div class="alert alert--warning">
          <span class="alert__icon"><lucide-icon name="alert-triangle" [size]="16" [strokeWidth]="2"></lucide-icon></span>
          <div class="alert__content">
            <strong>Once confirmed, this filing is immutable.</strong>
            You may file an amendment separately but the original record will not be altered.
          </div>
        </div>
      }

      <!-- incomplete filing validation warning -->
      @if (!loading() && validationIssues().length > 0) {
        <div class="alert alert--warning">
          <span class="alert__icon">
            <lucide-icon name="triangle-alert" [size]="18" [strokeWidth]="2"></lucide-icon>
          </span>
          <div class="alert__content">
            <strong>Filing is incomplete — please resolve the following before confirming:</strong>
            <ul style="margin:var(--space-2) 0 0 var(--space-4);display:flex;flex-direction:column;gap:var(--space-1)">
              @for (issue of validationIssues(); track issue) {
                <li style="font-size:var(--text-body-sm)">{{ issue }}</li>
              }
            </ul>
          </div>
        </div>
      }

      <!-- Nav buttons -->
      <div class="step-nav">
        <button class="btn btn--ghost btn--lg" (click)="back.emit()">← Back</button>
        <div class="flex gap-3">
          <button class="btn btn--secondary btn--lg" (click)="saveDraft()" [disabled]="confirming()">
            Save for Later
          </button>
          <button class="btn btn--primary btn--lg" (click)="confirm()"
            [disabled]="confirming() || loading() || validationIssues().length > 0"
            [title]="validationIssues().length > 0 ? 'Resolve the issues above before confirming' : ''">
            @if (confirming()) { Confirming… } @else {
              <lucide-icon name="check" [size]="16" [strokeWidth]="2.5" style="vertical-align:middle;margin-right:4px"></lucide-icon>Confirm Filing
            }
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .yoy { display: flex; flex-direction: column; gap: var(--space-3); }
    .yoy__table { width: 100%; border-collapse: collapse; font-size: var(--text-body-sm); font-variant-numeric: tabular-nums; }
    .yoy__table th { font-size: var(--text-label-sm); color: var(--color-on-surface-variant); font-weight: var(--font-weight-medium); padding: var(--space-2); text-align: left; }
    .yoy__table td { padding: var(--space-2); }
    .yoy__table .align-right { text-align: right; }
    .yoy__flag td { background: var(--color-warning-container); color: var(--color-warning); }
    .yoy__note { color: var(--color-warning); }

    .step-page {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
    }

    .step-page__header {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .breakdown-table {
      display: flex;
      flex-direction: column;
    }

    .breakdown-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-3) 0;
      border-bottom: 1px solid var(--color-surface-container);
      font-size: var(--text-body-md);
    }

    .breakdown-row--deduct {
      color: var(--color-on-surface-variant);
    }

    .breakdown-row--subtotal {
      font-weight: var(--font-weight-semibold);
      font-size: var(--text-title-sm);
      border-bottom: 2px solid var(--color-surface-container-highest);
    }

    .band-row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) 0;
    }

    .band-label {
      min-width: 220px;
      font-size: var(--text-body-sm);
    }

    .band-bar-wrapper {
      flex: 1;
      height: 8px;
      background: var(--color-surface-container);
      border-radius: var(--radius-full);
      overflow: hidden;
    }

    .band-bar {
      height: 100%;
      border-radius: var(--radius-full);
      transition: width 0.4s ease;
    }

    .band-amount {
      min-width: 140px;
      font-size: var(--text-body-sm);
    }

    .min-tax-panel {
      margin-top: var(--space-5);
      background: var(--color-surface-container-low);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
    }

    .min-tax-panel__title {
      font-size: var(--text-label-lg);
      font-weight: var(--font-weight-semibold);
      margin-bottom: var(--space-3);
    }

    .min-tax-panel__row {
      display: flex;
      justify-content: space-between;
      font-size: var(--text-body-md);
      padding: var(--space-2) 0;
    }

    .highlighted {
      font-weight: var(--font-weight-bold);
      color: var(--color-primary);
    }

    .step-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: var(--space-4);
      border-top: 1px solid var(--color-surface-container);
    }

    .justify-center {
      justify-content: center;
    }
  `],
})
export class StepReviewComponent implements OnInit {
  filingId = input.required<string>();
  back = output<void>();
  confirmed = output<void>();

  private readonly filingService = inject(FilingService);
  private readonly toast = inject(ToastService);

  result = signal<ComputationResult | null>(null);
  loading = signal(true);
  confirming = signal(false);
  hasExemptOrDigitalIncome = signal(false);

  isDirty(): boolean {
    return false;
  }

  save(): Promise<boolean> {
    return Promise.resolve(true);
  }

  // Validation — list of human-readable issues before user can confirm
  validationIssues = computed<string[]>(() => {
    const r = this.result();
    if (!r) return ['Tax computation has not been loaded yet.'];
    const issues: string[] = [];
    const hasAnyIncome =
      r.totalGrossIncome > 0 ||
      r.cgtExemptAmount > 0 ||
      r.digitalAssetLossRingfenced > 0 ||
      this.hasExemptOrDigitalIncome();
    if (!hasAnyIncome) {
      issues.push('No income entries found. Add at least one income source in Step 1.');
    }
    if (r.chargeableIncome < 0) {
      issues.push('Chargeable income is negative — please review your allowances and deductions.');
    }
    return issues;
  });

  readonly flagPct = 25;
  prior = signal<Filing | null>(null);

  comparison = computed(() => {
    const r = this.result();
    const p = this.prior();
    if (!r || !p) return null;
    const row = (label: string, prior: number, current: number) => {
      const delta = current - prior;
      const pct = prior !== 0 ? (delta / prior) * 100 : null;
      const flagged = Math.abs(delta) >= 100_000 && (pct === null || Math.abs(pct) >= this.flagPct);
      return { label, prior, current, delta, pct, flagged };
    };
    const rows = [
      row('Gross income', p.totalIncomeNgn ?? 0, r.totalGrossIncome),
      row('Chargeable income', p.chargeableIncome ?? 0, r.chargeableIncome),
      row('Final tax payable', p.finalTaxPayable ?? 0, r.finalTaxPayable),
    ];
    return { priorYoa: p.yearOfAssessment, rows, flagged: rows.some(x => x.flagged) };
  });

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const [r, entries] = await Promise.all([
        this.filingService.compute(this.filingId()),
        this.filingService.listIncomeEntries(this.filingId()).catch(() => []),
      ]);
      this.result.set(r);
      this.hasExemptOrDigitalIncome.set(
        entries.some(e => e.incomeType === 'capital_gain_shares' || e.incomeType === 'digital_asset'),
      );
      void this.loadPrior();
    } catch (err: unknown) {
      this.toast.error('Failed to compute tax: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      this.loading.set(false);
    }
  }

  /** Latest confirmed or submitted filing for the previous year, amendments included. */
  private async loadPrior(): Promise<void> {
    try {
      const filings = await this.filingService.listFilings();
      const current = filings.find(f => f.id === this.filingId());
      if (!current) return;
      const prior = filings
        .filter(f => f.yearOfAssessment === current.yearOfAssessment - 1 && f.status !== 'Draft')
        .sort((a, b) => (b.confirmedAt ?? '').localeCompare(a.confirmedAt ?? ''))[0];
      this.prior.set(prior ?? null);
    } catch {
      // the comparison is informational only
    }
  }

  graduatedTaxTooltip = computed(() => {
    const bands = this.result()?.bandBreakdown ?? [];
    if (bands.length === 0) {
      return 'Tax computed by applying the configured progressive rate bands to slices of chargeable income.';
    }
    const rates = bands.map(b => `${(b.rate * 100).toFixed(0)}%`).join(' → ');
    return `Tax computed by applying this filing's progressive rate bands (${rates}) to slices of chargeable income.`;
  });

  minTaxRateLabel = computed(() => {
    const r = this.result();
    if (!r || r.totalGrossIncome <= 0 || r.minimumTax <= 0) return '0%';
    const pct = (r.minimumTax / r.totalGrossIncome) * 100;
    return `${Number(pct.toFixed(2))}%`;
  });

  bandPct(amount: number): number {
    const total = this.result()?.chargeableIncome ?? 1;
    return total > 0 ? Math.min((amount / total) * 100, 100) : 0;
  }

  bandColor(index: number): string {
    const palette = ['#cce0ff', '#99c2ff', '#5599ff', '#2277ee', '#0055cc', '#003da0', '#002880'];
    return palette[Math.min(index, palette.length - 1)];
  }

  saveDraft(): void {
    this.back.emit();
  }

  async confirm(): Promise<void> {
    const r = this.result();
    if (!r) return;
    this.confirming.set(true);
    try {
      await this.filingService.confirmFiling(this.filingId(), r);
      this.toast.success('Filing confirmed.');
      this.confirmed.emit();
    } catch (err: unknown) {
      this.toast.error('Failed to confirm filing: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      this.confirming.set(false);
    }
  }
}
