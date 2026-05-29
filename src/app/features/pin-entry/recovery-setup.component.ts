import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { LucideAngularModule } from 'lucide-angular';

const QUESTIONS = [
  'What was the name of your first pet?',
  'What city were you born in?',
  'What is your mother\'s maiden name?',
  'What was the name of your primary school?',
  'What street did you grow up on?',
  'What was the make of your first car?',
  'What is the middle name of your oldest sibling?',
  'What was your childhood nickname?',
  'In what city did your parents meet?',
  'What was the name of your first employer?',
];

@Component({
  selector: 'lf-recovery-setup',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="auth-page">
      <div class="auth-card" style="max-width:540px;">
        <div class="auth-card__brand">
          <div class="brand-mark">LF</div>
          <h1 class="brand-name">LagosFile</h1>
        </div>

        <div>
          <h2 class="auth-card__title">Set up account recovery</h2>
          <p class="auth-card__subtitle">
            Choose three security questions. If you ever forget your PIN, you can
            answer these to regain access. <strong>Answers are case-insensitive.</strong>
          </p>
        </div>

        <form class="auth-card__form" (ngSubmit)="submit()">

          @for (i of [0, 1, 2]; track i) {
            <div class="form-group">
              <label class="form-label">Question {{ i + 1 }}</label>
              <select class="form-input" [(ngModel)]="selectedQuestions[i]" [name]="'q' + i">
                <option value="">— Select a question —</option>
                @for (q of availableFor(i); track q) {
                  <option [value]="q">{{ q }}</option>
                }
              </select>
              @if (selectedQuestions[i]) {
                <input
                  type="text" class="form-input" style="margin-top:var(--space-2)"
                  [(ngModel)]="answers[i]" [name]="'a' + i"
                  placeholder="Your answer"
                  autocomplete="off"
                />
              }
            </div>
          }

          @if (error) {
            <div class="alert alert--error">
              <span class="alert__icon"><lucide-icon name="alert-triangle" [size]="16" [strokeWidth]="2"></lucide-icon></span>
              <div class="alert__content">{{ error }}</div>
            </div>
          }

          <div class="btn-row">
            <button type="button" class="btn btn--ghost btn--lg" (click)="skip()">
              Skip for now
            </button>
            <button type="submit" class="btn btn--primary btn--lg" [disabled]="loading">
              @if (loading) { Saving… } @else { Save & Continue }
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styleUrls: ['./auth.styles.scss'],
  styles: [`
    .btn-row { display: flex; gap: var(--space-3); }
    .btn-row .btn { flex: 1; }
    select.form-input { cursor: pointer; }
  `],
})
export class RecoverySetupComponent {
  readonly allQuestions = QUESTIONS;
  selectedQuestions = ['', '', ''];
  answers = ['', '', ''];
  loading = false;
  error = '';

  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  private get returnPath(): string {
    return this.auth.isUnlocked() ? '/settings' : '/profile-setup';
  }

  /** Only offer questions not already chosen in another slot */
  availableFor(idx: number): string[] {
    const others = this.selectedQuestions.filter((_, i) => i !== idx);
    return this.allQuestions.filter(q => !others.includes(q));
  }

  async submit(): Promise<void> {
    this.error = '';
    for (let i = 0; i < 3; i++) {
      if (!this.selectedQuestions[i]) {
        this.error = `Please select question ${i + 1}.`;
        return;
      }
      if (!this.answers[i].trim()) {
        this.error = `Please provide an answer for question ${i + 1}.`;
        return;
      }
    }

    this.loading = true;
    try {
      await this.auth.setupRecovery(
        [this.selectedQuestions[0], this.selectedQuestions[1], this.selectedQuestions[2]],
        [this.answers[0], this.answers[1], this.answers[2]],
      );
      this.router.navigate([this.returnPath]);
    } catch (err: unknown) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.loading = false;
    }
  }

  skip(): void {
    this.router.navigate([this.returnPath]);
  }
}
