import { Component, inject, OnInit, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { FilingService } from '../../core/services/filing.service';
import { ToastService } from '../../core/services/toast.service';
import { CapitalAllowance, Filing, IncomeEntry, ReliefEntry } from '../../core/models';
import { NairaPipe } from '../../shared/pipes/naira.pipe';
import { StepIncomeComponent } from './steps/step-income/step-income.component';
import { StepAllowancesComponent } from './steps/step-allowances/step-allowances.component';
import { StepDeductionsComponent } from './steps/step-deductions/step-deductions.component';
import { StepReviewComponent } from './steps/step-review/step-review.component';
import { LucideAngularModule } from 'lucide-angular';
import { HelpTooltipComponent } from '../../shared/components/help-tooltip/help-tooltip.component';

type WizardStep = 1 | 2 | 3 | 4;
type WizardMode = 'selecting-year' | 'active' | 'readonly';

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
    DatePipe,
    NairaPipe,
    StepIncomeComponent,
    StepAllowancesComponent,
    StepDeductionsComponent,
    StepReviewComponent,
    LucideAngularModule,
    HelpTooltipComponent,
  ],
  template: `
    <!-- ── Year-selection pre-step (new filings only) ── -->
    @if (mode() === 'selecting-year') {
      <div class="yoa-select-page">
        <div class="yoa-select-card card">
          <div class="yoa-select-card__icon"><lucide-icon name="file-text" [size]="36" [strokeWidth]="1.5"></lucide-icon></div>
          <h1 class="headline-sm" style="margin-bottom:var(--space-2)">New Direct Assessment Filing</h1>
          <p class="body-md text-muted" style="margin-bottom:var(--space-6)">
            Select the Year of Assessment you are filing for.
          </p>

          <div class="form-group" style="margin-bottom:var(--space-6)">
            <label class="form-label">Year of Assessment<lf-help text="The calendar year in which the income was earned. Direct Assessment filings are due by 31 March of the following year." align="left"></lf-help></label>
            <select class="form-input" [(ngModel)]="selectedYear">
              @for (y of availableYears; track y) {
                <option [ngValue]="y">{{ y }}</option>
              }
            </select>
            <div class="form-hint" style="margin-top:var(--space-2)">
              Income year {{ selectedYear }} · LIRS year of assessment {{ selectedYear + 1 }} (due 31 March {{ selectedYear + 1 }}).
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

    <!-- ── Read-only summary (Confirmed / Submitted filings) ── -->
    @if (mode() === 'readonly' && readonlyFiling(); as filing) {
      <div class="readonly-filing" data-testid="readonly-filing-summary">
        <div class="readonly-filing__header">
          <div>
            <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-2)">
              <span class="wizard__yoa-badge">Income year {{ filing.yearOfAssessment }} · LIRS year of assessment {{ filing.yearOfAssessment + 1 }}</span>
              <span class="badge" [class.badge--confirmed]="filing.status === 'Confirmed'" [class.badge--submitted]="filing.status === 'Submitted'">
                {{ filing.status }}
              </span>
            </div>
            <h1 class="headline-sm">{{ filing.filingReference || 'Filed Return' }}</h1>
            <p class="body-sm text-muted" style="margin-top:var(--space-1)">
              This return is final and read-only. To make changes, create an amendment.
            </p>
          </div>
          <div style="display:flex;gap:var(--space-3);align-items:center">
            <button class="btn btn--secondary" type="button" (click)="goToHistory()">Back to History</button>
            <button class="btn btn--primary" type="button" (click)="amendReadonlyFiling()" [disabled]="amending()">
              @if (amending()) { Creating Amendment… } @else { Amend }
            </button>
          </div>
        </div>

        <div class="card">
          <h2 class="title-md" style="margin-bottom:var(--space-4)">Tax Computation Summary</h2>
          <div class="readonly-grid">
            <div class="readonly-row"><span>Total Gross Income</span><strong class="financial-value">{{ filing.totalIncomeNgn ?? 0 | naira }}</strong></div>
            <div class="readonly-row"><span>Chargeable Income</span><strong class="financial-value">{{ filing.chargeableIncome ?? 0 | naira }}</strong></div>
            <div class="readonly-row"><span>Gross Tax Payable</span><strong class="financial-value">{{ filing.taxPayable ?? 0 | naira }}</strong></div>
            <div class="readonly-row"><span>WHT Credits</span><strong class="financial-value">{{ filing.whtCredit ?? 0 | naira }}</strong></div>
            @if ((filing.payeCredit ?? 0) > 0) {
              <div class="readonly-row"><span>PAYE Credits</span><strong class="financial-value">{{ filing.payeCredit ?? 0 | naira }}</strong></div>
            }
            @if ((filing.foreignTaxCredit ?? 0) > 0) {
              <div class="readonly-row"><span>Foreign Tax Credits</span><strong class="financial-value">{{ filing.foreignTaxCredit ?? 0 | naira }}</strong></div>
            }
            <div class="readonly-row"><span>Net Tax Payable</span><strong class="financial-value">{{ filing.netTaxPayable ?? 0 | naira }}</strong></div>
            <div class="readonly-row"><span>Minimum Tax</span><strong class="financial-value">{{ filing.minimumTax ?? 0 | naira }}</strong></div>
            <div class="readonly-row readonly-row--total"><span>Final Tax Payable</span><strong class="financial-value">{{ filing.finalTaxPayable ?? 0 | naira }}</strong></div>
          </div>

          <div class="readonly-meta">
            <div><span class="text-muted">Tax Config:</span> {{ filing.taxConfigVersion }}</div>
            @if (filing.confirmedAt) {
              <div><span class="text-muted">Confirmed:</span> {{ filing.confirmedAt | date:'dd MMM yyyy, HH:mm' }}</div>
            }
            @if (filing.submittedAt) {
              <div><span class="text-muted">Submitted:</span> {{ filing.submittedAt | date:'dd MMM yyyy, HH:mm' }}</div>
            }
          </div>
        </div>

        @if (readonlyIncome().length > 0) {
          <div class="card">
            <h2 class="title-md" style="margin-bottom:var(--space-3)">Income Entries ({{ readonlyIncome().length }})</h2>
            @for (item of readonlyIncome(); track item.id) {
              <div class="readonly-row">
                <span>{{ item.description || item.incomeType }}</span>
                <span class="financial-value">{{ item.grossAmountNgn | naira }}</span>
              </div>
            }
          </div>
        }

        @if (readonlyAllowances().length > 0) {
          <div class="card">
            <h2 class="title-md" style="margin-bottom:var(--space-3)">Capital Allowances ({{ readonlyAllowances().length }})</h2>
            @for (ca of readonlyAllowances(); track ca.id) {
              <div class="readonly-row">
                <span>{{ ca.assetDescription }} ({{ ca.assetType }})</span>
                <span class="financial-value">{{ ca.annualAllowanceAmount | naira }}</span>
              </div>
            }
          </div>
        }

        @if (readonlyReliefs().length > 0) {
          <div class="card">
            <h2 class="title-md" style="margin-bottom:var(--space-3)">Deductions & Reliefs ({{ readonlyReliefs().length }})</h2>
            @for (r of readonlyReliefs(); track r.id) {
              <div class="readonly-row">
                <span>{{ r.description || r.reliefType }}</span>
                <span class="financial-value">{{ r.approvedAmount | naira }}</span>
              </div>
            }
          </div>
        }
      </div>
    }

    <!-- ── Active wizard (Draft filings only) ── -->
    @if (mode() === 'active') {
      <div class="wizard">
        <!-- Left: vertical progress strip -->
        <aside class="wizard__sidebar">
          <div class="wizard__yoa-badge">Income year {{ yearOfAssessment() }} · LIRS year of assessment {{ yearOfAssessment() + 1 }}</div>
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
                    @if (currentStep() > s.step) {
                      <lucide-icon name="check" [size]="14" [strokeWidth]="2.5"></lucide-icon>
                    } @else { {{ s.step }} }
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
                  [yearOfAssessment]="yearOfAssessment()"
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

    /* ── Read-only summary ── */
    .readonly-filing {
      max-width: 820px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      padding-bottom: var(--space-8);
    }
    .readonly-filing__header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: var(--space-4);
    }
    .readonly-grid {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .readonly-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-2) 0;
      border-bottom: 1px solid var(--color-surface-container);
      font-size: var(--text-body-md);
    }
    .readonly-row:last-child { border-bottom: none; }
    .readonly-row--total {
      border-top: 2px solid var(--color-outline-variant);
      padding-top: var(--space-3);
      font-size: var(--text-title-sm);
    }
    .readonly-meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-5);
      margin-top: var(--space-4);
      padding-top: var(--space-3);
      border-top: 1px solid var(--color-surface-container);
      font-size: var(--text-label-md);
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
  private toast = inject(ToastService);

  mode = signal<WizardMode>('active');
  filingId = signal<string | undefined>(undefined);
  yearOfAssessment = signal(new Date().getFullYear());
  currentStep = signal<WizardStep>(1);
  loading = signal(true);
  starting = signal(false);
  amending = signal(false);

  readonlyFiling = signal<Filing | null>(null);
  readonlyIncome = signal<IncomeEntry[]>([]);
  readonlyAllowances = signal<CapitalAllowance[]>([]);
  readonlyReliefs = signal<ReliefEntry[]>([]);

  readonly currentYear = new Date().getFullYear();

  selectedYear = this.currentYear - 1;

  readonly availableYears: number[] = Array.from(
    { length: 10 },
    (_, i) => this.currentYear - 1 - i,
  );

  readonly steps = STEPS;

  private stepIncome = viewChild(StepIncomeComponent);
  private stepAllowances = viewChild(StepAllowancesComponent);
  private stepDeductions = viewChild(StepDeductionsComponent);
  private stepReview = viewChild(StepReviewComponent);

  private activeStepRef(): { isDirty(): boolean; save(): Promise<boolean> } | undefined {
    switch (this.currentStep()) {
      case 1: return this.stepIncome();
      case 2: return this.stepAllowances();
      case 3: return this.stepDeductions();
      case 4: return this.stepReview();
    }
  }

  canDeactivate(): boolean {
    if (this.mode() !== 'active') return true;
    const active = this.activeStepRef();
    if (!active || !active.isDirty()) return true;
    return window.confirm('You have unsaved changes on this step. Leave without saving?');
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loading.set(true);
      try {
        const filing = await this.filingService.getFiling(id);
        this.filingId.set(filing.id);
        this.yearOfAssessment.set(filing.yearOfAssessment);
        if (filing.status !== 'Draft') {
          this.readonlyFiling.set(filing);
          const [income, allowances, reliefs] = await Promise.all([
            this.filingService.listIncomeEntries(filing.id),
            this.filingService.listAllowances(filing.id),
            this.filingService.listReliefEntries(filing.id),
          ]);
          this.readonlyIncome.set(income);
          this.readonlyAllowances.set(allowances);
          this.readonlyReliefs.set(reliefs);
          this.mode.set('readonly');
        } else {
          this.mode.set('active');
        }
      } catch (err: unknown) {
        this.toast.error('Failed to load filing: ' + (err instanceof Error ? err.message : String(err)));
        this.router.navigate(['/history']);
      } finally {
        this.loading.set(false);
      }
    } else {
      this.mode.set('selecting-year');
      this.loading.set(false);
    }
  }

  async beginFiling(): Promise<void> {
    if (this.selectedYear >= this.currentYear) {
      this.toast.error('Filings can only be created for past years of assessment, not the current or future years.');
      return;
    }
    this.starting.set(true);
    try {
      const draft = await this.filingService.createDraft(this.selectedYear);
      this.filingId.set(draft.id);
      this.yearOfAssessment.set(draft.yearOfAssessment);
      this.mode.set('active');
    } catch (err: unknown) {
      this.toast.error('Failed to create filing: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      this.starting.set(false);
    }
  }

  async amendReadonlyFiling(): Promise<void> {
    const filing = this.readonlyFiling();
    if (!filing || this.amending()) return;
    this.amending.set(true);
    try {
      const amended = await this.filingService.amendFiling(filing.id);
      this.filingId.set(amended.id);
      this.yearOfAssessment.set(amended.yearOfAssessment);
      this.readonlyFiling.set(null);
      this.currentStep.set(1);
      this.mode.set('active');
      this.router.navigate(['/filing', amended.id]);
    } catch (err: unknown) {
      this.toast.error('Failed to create amendment: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      this.amending.set(false);
    }
  }

  goToHistory(): void { this.router.navigate(['/history']); }

  cancel(): void { this.router.navigate(['/dashboard']); }

  async goToStep(step: WizardStep): Promise<void> {
    if (step === this.currentStep()) return;
    const active = this.activeStepRef();
    if (active?.isDirty()) {
      const ok = await active.save();
      if (!ok) return;
    }
    this.currentStep.set(step);
  }

  goNext(_?: unknown): void {
    const next = (this.currentStep() + 1) as WizardStep;
    if (next <= 4) this.currentStep.set(next);
  }

  async goBack(): Promise<void> {
    const prev = (this.currentStep() - 1) as WizardStep;
    if (prev >= 1) {
      await this.goToStep(prev);
    }
  }

  onConfirmed(): void {
    this.router.navigate(['/history']);
  }
}
