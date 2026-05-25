import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FilingService } from '../../core/services/filing.service';
import { StepIncomeComponent } from './steps/step-income/step-income.component';
import { StepAllowancesComponent } from './steps/step-allowances/step-allowances.component';
import { StepDeductionsComponent } from './steps/step-deductions/step-deductions.component';
import { StepReviewComponent } from './steps/step-review/step-review.component';
import { IncomeEntry, CapitalAllowance, ReliefEntry } from '../../core/models';

type WizardStep = 1 | 2 | 3 | 4;

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
    StepIncomeComponent,
    StepAllowancesComponent,
    StepDeductionsComponent,
    StepReviewComponent,
  ],
  template: `
    <div class="wizard">
      <!-- Left: vertical progress strip -->
      <aside class="wizard__sidebar">
        <div class="wizard__yoa-badge">YOA {{ yearOfAssessment() }}</div>
        <nav class="progress-strip" aria-label="Filing steps">
          @for (s of steps; track s.step) {
            <div
              class="progress-strip__item"
              [class.progress-strip__item--active]="currentStep() === s.step"
              [class.progress-strip__item--done]="currentStep() > s.step"
              [class.progress-strip__item--upcoming]="currentStep() < s.step"
            >
              <div class="progress-strip__bar"></div>
              <div class="progress-strip__content">
                <div class="progress-strip__title">
                  @if (currentStep() > s.step) { ✓ }
                  {{ s.title }}
                </div>
                <div class="progress-strip__subtitle">{{ s.subtitle }}</div>
              </div>
            </div>
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
  `,
  styles: [`
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
  `],
})
export class FilingWizardComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private filingService = inject(FilingService);

  filingId = signal<string | undefined>(undefined);
  yearOfAssessment = signal(new Date().getFullYear());
  currentStep = signal<WizardStep>(1);
  loading = signal(true);

  readonly steps = STEPS;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    let yoa = Number(this.route.snapshot.queryParamMap.get('yoa')) || new Date().getFullYear();

    if (id) {
      // Resuming an existing draft
      this.filingId.set(id);
      const filing = await this.filingService.getFiling(id);
      this.yearOfAssessment.set(filing.yearOfAssessment);
    } else {
      // New filing — create draft
      const draft = await this.filingService.createDraft(yoa);
      this.filingId.set(draft.id);
      this.yearOfAssessment.set(draft.yearOfAssessment);
    }
    this.loading.set(false);
  }

  goNext(_payload?: unknown): void {
    if (this.currentStep() < 4) {
      this.currentStep.update(s => (s + 1) as WizardStep);
    }
  }

  goBack(): void {
    if (this.currentStep() > 1) {
      this.currentStep.update(s => (s - 1) as WizardStep);
    }
  }

  onConfirmed(): void {
    this.router.navigate(['/history']);
  }
}
