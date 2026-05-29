import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LowerCasePipe } from '@angular/common';
import { FilingService } from '../../core/services/filing.service';
import { AuthService } from '../../core/services/auth.service';
import { Filing } from '../../core/models';
import { NairaPipe } from '../../shared/pipes/naira.pipe';
import {
  LucideAngularModule,
} from 'lucide-angular';
import { HelpTooltipComponent } from '../../shared/components/help-tooltip/help-tooltip.component';

@Component({
  selector: 'lf-dashboard',
  standalone: true,
  imports: [RouterLink, NairaPipe, LowerCasePipe,
    LucideAngularModule, HelpTooltipComponent],
  template: `
    <div class="dashboard">
      <!-- Deadline countdown banner -->
      @if (showDeadlineBanner()) {
        <div class="alert alert--warning deadline-banner">
          <span class="alert__icon"><lucide-icon name="clock" [size]="16" [strokeWidth]="2"></lucide-icon></span>
          <div class="alert__content">
            <div class="alert__title">Filing Deadline Approaching</div>
            <div>{{ daysLeft() }} days until March 31 — the Direct Assessment filing deadline.</div>
          </div>
        </div>
      }

      <!-- Missing filing warnings -->
      @if (missingCurrentYear()) {
        <div class="alert alert--error">
          <span class="alert__icon"><lucide-icon name="alert-triangle" [size]="16" [strokeWidth]="2"></lucide-icon></span>
          <div class="alert__content">
            <div class="alert__title">No confirmed filing for {{ currentYear }}</div>
            <div>You have not filed your YOA {{ currentYear }} return yet.</div>
          </div>
        </div>
      }
      @if (missingPreviousYear()) {
        <div class="alert alert--error" style="margin-top:var(--space-3)">
          <span class="alert__icon"><lucide-icon name="alert-triangle" [size]="16" [strokeWidth]="2"></lucide-icon></span>
          <div class="alert__content">
            <div class="alert__title">No confirmed filing for {{ currentYear - 1 }}</div>
            <div>You may have an outstanding liability for YOA {{ currentYear - 1 }}.</div>
          </div>
        </div>
      }

      <!-- Header row -->
      <div class="dashboard__header">
        <div>
          <h1 class="headline-md">Dashboard<lf-help text="Direct Assessment is self-assessed tax for individuals outside PAYE. You must file and pay annually by 31 March following the year of assessment." align="left"></lf-help></h1>
          <p class="body-md text-muted mt-2">
            Welcome back{{ taxpayer() ? ', ' + taxpayer()!.fullName.split(' ')[0] : '' }}.
            Here is your tax overview.
          </p>
        </div>
        <a routerLink="/filing/new" class="btn btn--primary btn--lg">+ Start New Filing</a>
      </div>

      <!-- Quick-access module cards -->
      <div class="dashboard__modules">
        <div class="module-card">
          <div class="module-card__icon"><lucide-icon name="file-text" [size]="26" [strokeWidth]="1.5"></lucide-icon></div>
          <div class="module-card__title">Tax Receipts</div>
          <div class="module-card__desc">Download confirmed filing receipts and export PDFs.</div>
          <a routerLink="/history" class="btn btn--ghost btn--sm" style="margin-top:auto">View History →</a>
        </div>
        <div class="module-card">
          <div class="module-card__icon"><lucide-icon name="calculator" [size]="26" [strokeWidth]="1.5"></lucide-icon></div>
          <div class="module-card__title">Tax Calculator</div>
          <div class="module-card__desc">Estimate your tax liability before filing.</div>
          <a routerLink="/filing/new" class="btn btn--ghost btn--sm" style="margin-top:auto">Start Filing →</a>
        </div>
        <div class="module-card">
          <div class="module-card__icon"><lucide-icon name="check-circle" [size]="26" [strokeWidth]="1.5"></lucide-icon></div>
          <div class="module-card__title">Compliance Status</div>
          <div class="module-card__desc">
            @if (confirmedCount() > 0) {
              {{ confirmedCount() }} confirmed filing{{ confirmedCount() > 1 ? 's' : '' }} on record.
            } @else {
              No confirmed filings yet.
            }
          </div>
        </div>
        <div class="module-card">
          <div class="module-card__icon"><lucide-icon name="book-open" [size]="26" [strokeWidth]="1.5"></lucide-icon></div>
          <div class="module-card__title">Help & Guides</div>
          <div class="module-card__desc">NTA 2025 guidance, LIRS notices, and FAQs.</div>
          <a href="https://lirs.gov.ng" target="_blank" class="btn btn--ghost btn--sm" style="margin-top:auto">LIRS Website ↗</a>
        </div>
      </div>

      <!-- Filing history table -->
      <div class="card" style="margin-top:var(--space-8)">
        <div class="flex items-center justify-between mb-6">
          <h2 class="title-md">Recent Filings</h2>
          <a routerLink="/history" class="btn btn--ghost btn--sm">View All →</a>
        </div>

        @if (loading()) {
          <div class="skeleton" style="height:120px;border-radius:var(--radius-lg)"></div>
        } @else if (filings().length === 0) {
          <div style="text-align:center;padding:var(--space-8);color:var(--color-on-surface-variant)">
            <div style="margin-bottom:var(--space-3);color:var(--color-on-surface-variant)"><lucide-icon name="clipboard-list" [size]="40" [strokeWidth]="1.25"></lucide-icon></div>
            <div class="title-sm">No filings yet</div>
            <div class="body-sm text-muted mt-2">Start a new filing to see it here.</div>
          </div>
        } @else {
          <table class="data-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Reference</th>
                <th>Status</th>
                <th class="align-right">Tax Payable</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (filing of filings().slice(0, 5); track filing.id) {
                <tr>
                  <td><strong>{{ filing.yearOfAssessment }}</strong></td>
                  <td class="text-muted">{{ filing.filingReference ?? '---' }}</td>
                  <td><span class="badge badge--{{ filing.status | lowercase }}">{{ filing.status }}</span></td>
                  <td class="align-right financial-value">{{ filing.finalTaxPayable | naira }}</td>
                  <td>
                    <a [routerLink]="['/filing', filing.id]" class="btn btn--ghost btn--sm">View</a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

      <!-- Year-over-year chart -->
      @if (chartData().length > 1) {
        <div class="card" style="margin-top:var(--space-4)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-5)">
            <h2 class="title-md">Year-over-Year<lf-help text="Compares Gross Income and Final Tax Payable across all confirmed filings. Useful for spotting trends in your tax profile over time."></lf-help></h2>
            <div class="chart-legend">
              <span class="chart-legend__item chart-legend__item--income">Gross Income</span>
              <span class="chart-legend__item chart-legend__item--tax">Tax Payable</span>
            </div>
          </div>
          <div class="yoy-chart">
            @for (item of chartData(); track item.year) {
              <div class="yoy-col">
                <div class="yoy-bars">
                  <div class="yoy-bar yoy-bar--income"
                    [style.height.%]="item.incomePct"
                    [title]="'Gross Income: ₦' + item.income.toLocaleString()">
                  </div>
                  <div class="yoy-bar yoy-bar--tax"
                    [style.height.%]="item.taxPct"
                    [title]="'Tax Payable: ₦' + item.tax.toLocaleString()">
                  </div>
                </div>
                <div class="yoy-label">{{ item.year }}</div>
                <div class="yoy-value">{{ item.tax | naira }}</div>
              </div>
            }
          </div>
        </div>
      }


      <!-- Lifetime total footer -->
      <div class="dashboard__footer">
        <span class="text-muted label-md">Lifetime Total Tax Filed<lf-help text="Sum of Final Tax Payable across all confirmed filings on this device."></lf-help></span>
        <span class="headline-sm text-primary">{{ lifetimeTotal() | naira }}</span>
      </div>
    </div>
  `,
  styles: [`
    .dashboard {
      max-width: var(--content-max-width);
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
    }

    .deadline-banner { margin-bottom: var(--space-2); }

    .dashboard__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--space-4);
    }

    .dashboard__modules {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-4);
    }

    .module-card {
      background: var(--color-surface-container-lowest);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-card);
      padding: var(--space-5);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-height: 160px;
    }

    .module-card__icon {
      display: flex;
      align-items: center;
      color: var(--color-primary);
    }
    .module-card__title {
      font-size: var(--text-title-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-on-surface);
    }
    .module-card__desc {
      font-size: var(--text-body-sm);
      color: var(--color-on-surface-variant);
      flex: 1;
    }

    .chart-legend { display: flex; gap: var(--space-4); }
    .chart-legend__item { font-size: var(--text-label-sm); color: var(--color-on-surface-variant); display: flex; align-items: center; gap: var(--space-2); }
    .chart-legend__item::before { content: ''; width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
    .chart-legend__item--income::before { background: var(--color-secondary-container); border: 2px solid var(--color-secondary); }
    .chart-legend__item--tax::before { background: var(--color-primary-container); border: 2px solid var(--color-primary); }

    .yoy-chart {
      display: flex; align-items: flex-end; gap: var(--space-4);
      height: 180px; padding: 0 var(--space-2);
    }
    .yoy-col { display: flex; flex-direction: column; align-items: center; flex: 1; gap: var(--space-2); }
    .yoy-bars { display: flex; align-items: flex-end; gap: var(--space-1); height: 140px; width: 100%; justify-content: center; }
    .yoy-bar {
      flex: 1; border-radius: var(--radius-sm) var(--radius-sm) 0 0;
      min-height: 4px; transition: height var(--transition-slow);
      cursor: default; max-width: 28px;
    }
    .yoy-bar--income { background: var(--color-secondary-container); border: 1.5px solid var(--color-secondary); }
    .yoy-bar--tax { background: var(--color-primary-container); border: 1.5px solid var(--color-primary); }
    .yoy-bar:hover { filter: brightness(0.92); }
    .yoy-label { font-size: var(--text-label-sm); color: var(--color-on-surface-variant); font-weight: var(--font-weight-medium); }
    .yoy-value { font-size: var(--text-label-sm); color: var(--color-on-surface); font-weight: var(--font-weight-semibold); }

    .dashboard__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-5) var(--space-6);
      background: var(--color-surface-container-low);
      border-radius: var(--radius-lg);
    }

    @media (max-width: 900px) {
      .dashboard__modules { grid-template-columns: 1fr 1fr; }
    }
  `],
})
export class DashboardComponent implements OnInit {
  private filingService = inject(FilingService);
  auth = inject(AuthService);

  filings = signal<Filing[]>([]);
  loading = signal(true);

  readonly currentYear = new Date().getFullYear();
  readonly taxpayer = this.auth.taxpayer;

  daysLeft = signal(0);
  showDeadlineBanner = signal(false);
  missingCurrentYear = signal(false);
  missingPreviousYear = signal(false);
  confirmedCount = signal(0);
  lifetimeTotal = signal(0);

  chartData = computed(() => {
    const confirmed = this.filings().filter(f => f.status === 'Confirmed' || f.status === 'Submitted');
    if (confirmed.length < 2) return [];
    const sorted = [...confirmed].sort((a, b) => a.yearOfAssessment - b.yearOfAssessment);
    const maxIncome = Math.max(...sorted.map(f => f.totalIncomeNgn ?? 0), 1);
    const maxTax = Math.max(...sorted.map(f => f.finalTaxPayable ?? 0), 1);
    const maxVal = Math.max(maxIncome, maxTax, 1);
    return sorted.map(f => ({
      year: f.yearOfAssessment,
      income: f.totalIncomeNgn ?? 0,
      tax: f.finalTaxPayable ?? 0,
      incomePct: Math.round(((f.totalIncomeNgn ?? 0) / maxVal) * 100),
      taxPct: Math.round(((f.finalTaxPayable ?? 0) / maxVal) * 100),
    }));
  });

  async ngOnInit(): Promise<void> {
    try {
      const all = await this.filingService.listFilings();
      this.filings.set(all);

      const confirmed = all.filter(f => f.status === 'Confirmed');
      this.confirmedCount.set(confirmed.length);
      this.lifetimeTotal.set(confirmed.reduce((s, f) => s + (f.finalTaxPayable ?? 0), 0));

      const cy = this.currentYear;
      this.missingCurrentYear.set(!confirmed.some(f => f.yearOfAssessment === cy));
      this.missingPreviousYear.set(!confirmed.some(f => f.yearOfAssessment === cy - 1));

      // Deadline banner: show if within 60 days of March 31
      const deadline = new Date(cy + 1, 2, 31); // March 31 next year
      const today = new Date();
      const diff = Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
      if (diff > 0 && diff <= 60) {
        this.daysLeft.set(diff);
        this.showDeadlineBanner.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }
}
