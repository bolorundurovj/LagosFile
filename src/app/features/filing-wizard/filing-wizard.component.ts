import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FilingService } from '../../core/services/filing.service';
import { StepIncomeComponent } from './steps/step-income/step-income.component';
import { StepAllowancesComponent } from './steps/step-allowances/step-allowances.component';
import { StepDeductionsComponent } from './steps/step-deductions/step-deductions.component';
import { StepReviewComponent } from './steps/step-review/step-review.component';
import { IncomeEntry, CapitalAllowance, ReliefEntry } from '../../core/models';

type WizardStep = 1 | 2 | 3 | 4;
type WizardMode = 'selecting-year' | 'active';

const STEPS = [
  { step: 1 as WizardStep, title: 'Income Sources',        subtitle: 'Domestic & foreign income' },
  { step: 2 as WizardStep, title: 'Capital Allowances',    subtitle: 'Professional equipment' },
  { step: 3 as WizardStep, title: 'Deductions & Reliefs',  subtitle: 'Pension, NHIS, rent relief…' },
  { step: 4 as WizardStep, title: 'Review & Confirm',      subtitle: 'Full tax computation' },
];

@Component({
  selector: 'lf-filing-wizard',
  standalone: true,
  imports: [
    FormsModule,
    StepIncomeComponent,
    StepAllowancesComponent,
    StepDeductionsComponent,
    StepReviewComponent,
  ],
  template: `
    <!-- ── Year-selection pre-step (new filings only) ── -->
    @if (mode() === 'selecting-year') {
      <div class="yoa-select-page">
        <div class="yoa-select-card card">
          <div class="yoa-select-card__icon">📄</div>
          <h1 class="headline-sm" style="margin-bottom:var(--space-2)">New Direct Assessment Filing</h1>
          <p class="body-md text-muted" style="margin-bottom:var(--space-6)">
            Select the Year of Assessment you are filing for.
          </p>

          <div class="form-group" style="margin-bottom:var(--space-6)">
            <label class="form-label">Year of Assessment</label>
            <select class="form-input" [(ngModel)]="selectedYear">
              @for (y of availableYears; track y) {
                <option [ngValue]="y">{{ y }}</option>
              }
            </select>
            <div class="form-hint" style="margin-top:var(--space-2)">
              Filing for income earned in {{ selectedYear }}, due 31 March {{ selectedYear + 1 }}.
            </div>
          </div>

          <div class="yoa-select-card__actions">
            <button class="btn btn--ghost" (click)="cancel()">Cancel</button>
            <button
              class="btn btn--primary"
              (click)="beginFiling()"
              [disabled]="starting()"
            >
              @if (starting()) { Creating draft… } @else { Start Filing → }
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ── Active wizard ── -->
    @if (mode() === 'active') {
      <div class="wizard">
        <!-- Left: vertical progress strip -->
        <aside class="wizard__sidebar">
          <div class="wizard__yoa-badge">YOA {{ yearOfAssessment() }}</div>
          <nav class="progress-strip" aria-label="Filing steps">
            @for (s of steps; track s.step) {
              <button
                class="progress-strip__item"
                [class.progress-strip__item--active]="currentStep() === s.step"
                [class.progress-strip__item--done]="currentStep() > s.step"
                [class.progress-strip__item--upcoming]="currentStep() < s.step"
                (click)="goToStep(s.step)"
                [attr.aria-current]="currentStep() === s.step ? 'step' : null"
                type="button"
              >
                <div class="progress-strip__bar"></div>
                <div class="progress-strip__content">
                  <div class="progress-strip__step-num">
                    @if (currentStep() > s.step) { ✓ } @else { {{ s.step }} }
                  </div>
                  <div class="progress-strip__text">
                    <div class="progress-strip__title">{{ s.title }}</div>
                    <div class="progress-strip__subtitle">{{ s.subtitle }}</div>
                  </div>
                </div>
              </button>
            }
          </nav>
        </aside>

        <!-- Right: step content -->
        <div class="wizard__body">
          @if (loading()) {
            <div class="skeleton" style="height:400px;border-radius:var(--radius-xl)"></div>
          } @else {
            @switch (currentStep()) {
              @case (1) {
                <lf-step-income
                  [filingId]="filingId()!"
                  (next)="goNext($event)"
                />
              }
              @case (2) {
                <lf-step-allowances
                  [filingId]="filingId()!"
                  (next)="goNext($event)"
                  (back)="goBack()"
                />
              }
              @case (3) {
                <lf-step-deductions
                  [filingId]="filingId()!"
                  (next)="goNext($event)"
                  (back)="goBack()"
                />
              }
              @case (4) {
                <lf-step-review
                  [filingId]="filingId()!"
                  (back)="goBack()"
                  (confirmed)="onConfirmed()"
                />
              }
            }
          }
        </div>
      </div>
    }
  `,
  styles: [`
    /* ── Year selector ── */
    .yoa-select-page {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - var(--topbar-height) - var(--space-16));
    }

    .yoa-select-card {
      width: 100%;
      max-width: 480px;
      text-align: center;
    }

    .yoa-select-card__icon {
      font-size: 2.5rem;
      margin-bottom: var(--space-4);
    }

    .yoa-select-card .form-group { text-align: left; }

    .yoa-select-card__actions {
      display: flex;
      gap: var(--space-3);
      justify-content: flex-end;
    }

    /* ── Wizard ── */
    .wizard {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: var(--space-8);
      height: calc(100vh - var(--topbar-height) - var(--space-16));
      max-width: var(--content-max-width);
      margin: 0 auto;
    }

    .wizard__sidebar {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
    }

    .wizard__yoa-badge {
      display: inline-flex;
      align-items: center;
      padding: var(--space-2) var(--space-4);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
      border-radius: var(--radius-full);
      font-size: var(--text-label-lg);
      font-weight: var(--font-weight-semibold);
      width: fit-content;
    }

    .wizard__body {
      overflow-y: auto;
      padding-bottom: var(--space-8);
    }

    /* ── Progress strip ── */
    .progress-strip {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .progress-strip__item {
      display: flex;
      align-items: stretch;
      gap: var(--space-3);
      background: none;
      border: none;
      padding: 0;
      text-align: left;
      cursor: pointer;
      width: 100%;
      position: relative;
    }

    .progress-strip__bar {
      width: 3px;
      border-radius: 999px;
      flex-shrink: 0;
      min-height: 56px;
      background: var(--color-surface-container);
      transition: background var(--transition-fast);
      margin: 2px 0;
    }

    .progress-strip__item--active .progress-strip__bar {
      background: var(--color-primary);
    }

    .progress-strip__item--done .progress-strip__bar {
      background: var(--color-success, #2e7d32);
    }

    .progress-strip__content {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-2);
      border-radius: var(--radius-lg);
      flex: 1;
      transition: background var(--transition-fast);
    }

    .progress-strip__item:hover .progress-strip__content {
      background: var(--color-surface-container-low);
    }

    .progress-strip__item--active .progress-strip__content {
      background: var(--color-primary-container);
    }

    .progress-strip__step-num {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--text-label-sm);
      font-weight: var(--font-weight-bold);
      flex-shrink: 0;
      background: var(--color-surface-container);
      color: var(--color-on-surface-variant);
      transition: all var(--transition-fast);
    }


    .progress-strip__item--active .progress-strip__step-num {
      background: var(--color-primary);
      color: white;
    }

    .progress-strip__item--done .progress-strip__step-num {
      background: var(--color-success, #2e7d32);
      color: white;
    }

    .progress-strip__text { flex: 1; min-width: 0; }

    .progress-strip__title {
      font-size: var(--text-body-md);
      font-weight: var(--font-weight-medium);
      color: var(--color-on-surface-variant);
      transition: color var(--transition-fast);
    }

    .progress-strip__item--active .progress-strip__title {
      color: var(--color-on-primary-container);
      font-weight: var(--font-weight-semibold);
    }

    .progress-strip__item--done .progress-strip__title {
      color: var(--color-on-surface);
    }

    .progress-strip__subtitle {
      font-size: var(--text-label-sm);
      color: var(--color-on-surface-variant);
      margin-top: 1px;
      opacity: 0.75;
    }

    .progress-strip__item--active .progress-strip__subtitle {
      opacity: 1;
    }
  `],
})
export class FilingWizardComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private filingService = inject(FilingService);

  mode = signal<WizardMode>('active');
  filingId = signal<string | undefined>(undefined);
  yearOfAssessment = signal(new Date().getFullYear());
  currentStep = signal<WizardStep>(1);
  loading = signal(true);
  starting = signal(false);

  selectedYear = new Date().getFullYear();

  readonly availableYears: number[] = Array.from(
    { length: 5 },
    (_, i) => new Date().getFullYear() - i
  );

  readonly steps = STEPS;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loading.set(true);
      const filing = await this.filingService.getFiling(id);
      this.filingId.set(filing.id);
      this.yearOfAssessment.set(filing.yearOfAssessment);
      this.mode.set('active');
      this.loading.set(false);
    } else {
      this.mode.set('selecting-year');
      this.loading.set(false);
    }
  }

  async beginFiling(): Promise<void> {
    this.starting.set(true);
    try {
      const draft = await this.filingService.createDraft(this.selectedYear);
      this.filingId.set(draft.id);
      this.yearOfAssessment.set(draft.yearOfAssessment);
      this.mode.set('active');
    } finally {
      this.starting.set(false);
    }
  }

  cancel(): void { this.router.navigate(['/dashboard']); }

  goToStep(step: WizardStep): void { this.currentStep.set(step); }

  goNext(_payload?: unknown): void {
    if (this.currentStep() < 4) this.currentStep.update(s => (s + 1) as WizardStep);
  }

  goBack(): void {
    if (this.currentStep() > 1) this.currentStep.update(s => (s - 1) as WizardStep);
  }

  onConfirmed(): void { this.router.navigate(['/history']); }
}
