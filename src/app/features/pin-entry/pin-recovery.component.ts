import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { LucideAngularModule, AlertTriangle, CheckCircle } from 'lucide-angular';
import { LogoMarkComponent } from '../../shared/components/logo-mark/logo-mark.component';

type Step = 'answers' | 'reset' | 'done';

@Component({
  selector: 'lf-pin-recovery',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, LogoMarkComponent],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-card__brand">
          <lf-logo-mark [size]="120" />
          <h1 class="brand-name">LagosFile</h1>
          <span class="brand-tagline">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Workspaces are encrypted on your device
          </span>
        </div>

        <!-- Step 1: answer security questions -->
        @if (step() === 'answers') {
          <div>
            <h2 class="auth-card__title">Account recovery</h2>
            <p class="auth-card__subtitle">
              Answer your three security questions to regain access.
              Answers are not case-sensitive.
            </p>
          </div>

          @if (loadError()) {
            <div class="alert alert--error">
              <span class="alert__icon"><lucide-icon name="alert-triangle" [size]="16" [strokeWidth]="2"></lucide-icon></span>
              <div class="alert__content">{{ loadError() }}</div>
            </div>
          } @else if (questions().length) {
            <form class="auth-card__form" (ngSubmit)="verifyAnswers()">
              @for (q of questions(); track $index) {
                <div class="form-group">
                  <label class="form-label">{{ q }}</label>
                  <input
                    type="text" class="form-input"
                    [(ngModel)]="answers[$index]" [name]="'a' + $index"
                    placeholder="Your answer" autocomplete="off"
                  />
                </div>
              }

              @if (error()) {
                <div class="alert alert--error">
                  <span class="alert__icon"><lucide-icon name="alert-triangle" [size]="16" [strokeWidth]="2"></lucide-icon></span>
                  <div class="alert__content">{{ error() }}</div>
                </div>
              }

              <button type="submit" class="btn btn--primary btn--lg w-full" [disabled]="loading()">
                @if (loading()) { Verifying… } @else { Verify Answers }
              </button>
              <button type="button" class="btn btn--ghost btn--sm w-full" style="margin-top:var(--space-2)"
                (click)="goBack()">
                ← Back to PIN entry
              </button>
            </form>
          } @else {
            <div class="skeleton" style="height:180px;border-radius:var(--radius-lg)"></div>
          }
        }

        <!-- Step 2: set new PIN -->
        @if (step() === 'reset') {
          <div>
            <h2 class="auth-card__title">Set a new PIN</h2>
            <p class="auth-card__subtitle">
              Your identity has been verified. Choose a new PIN for your account.
            </p>
          </div>

          <form class="auth-card__form" (ngSubmit)="resetPin()">
            <div class="form-group">
              <label class="form-label" for="newPin">New PIN</label>
              <input
                id="newPin" type="password" class="form-input"
                [(ngModel)]="newPin" name="newPin"
                placeholder="Minimum 4 characters"
                autocomplete="new-password"
              />
            </div>
            <div class="form-group">
              <label class="form-label" for="confirmPin">Confirm PIN</label>
              <input
                id="confirmPin" type="password" class="form-input"
                [(ngModel)]="confirmPin" name="confirmPin"
                placeholder="Repeat your new PIN"
                autocomplete="new-password"
              />
            </div>

            @if (error()) {
              <div class="alert alert--error">
                <span class="alert__icon"><lucide-icon name="alert-triangle" [size]="16" [strokeWidth]="2"></lucide-icon></span>
                <div class="alert__content">{{ error() }}</div>
              </div>
            }

            <button type="submit" class="btn btn--primary btn--lg w-full" [disabled]="loading()">
              @if (loading()) { Saving… } @else { Set New PIN }
            </button>
            <button type="button" class="btn btn--ghost btn--sm w-full" style="margin-top:var(--space-2)"
              (click)="goBack()">
              ← Back to PIN entry
            </button>
          </form>
        }

        <!-- Step 3: success -->
        @if (step() === 'done') {
          <div class="success-panel">
            <div class="success-icon"><lucide-icon name="check-circle" [size]="40" [strokeWidth]="1.5"></lucide-icon></div>
            <h2 class="auth-card__title">PIN reset successfully</h2>
            <p class="auth-card__subtitle">
              Your new PIN is active. You are now signed in.
              <br><br>
              <strong>Important:</strong> your previous security questions have been
              cleared. Please set up new recovery questions in Settings.
            </p>
            <button class="btn btn--primary btn--lg w-full" (click)="goToDashboard()">
              Go to Dashboard
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styleUrls: ['./auth.styles.scss'],
  styles: [`
    .success-panel { display: flex; flex-direction: column; gap: var(--space-4); text-align: center; }
    .success-icon {
      font-size: 2.5rem;
      width: 72px; height: 72px;
      border-radius: 50%;
      background: var(--color-success, #16a34a);
      color: #fff;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto;
    }
  `],
})
export class PinRecoveryComponent implements OnInit {
  step = signal<Step>('answers');
  questions = signal<string[]>([]);
  loadError = signal('');
  error = signal('');
  loading = signal(false);

  answers: string[] = ['', '', ''];
  newPin = '';
  confirmPin = '';

  private auth = inject(AuthService);
  private router = inject(Router);

  async ngOnInit(): Promise<void> {
    try {
      const qs = await this.auth.getRecoveryQuestions();
      this.questions.set(qs);
    } catch (err: unknown) {
      this.loadError.set(
        err instanceof Error ? err.message : 'Could not load recovery questions.',
      );
    }
  }

  async verifyAnswers(): Promise<void> {
    this.error.set('');
    if (this.answers.some(a => !a.trim())) {
      this.error.set('Please answer all three questions.');
      return;
    }
    this.loading.set(true);
    try {
      const result = await this.auth.recoverWithAnswers([
        this.answers[0], this.answers[1], this.answers[2],
      ]);
      if (result.success) {
        this.step.set('reset');
      } else {
        this.error.set(result.error ?? 'Incorrect answers. Please try again.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  async resetPin(): Promise<void> {
    this.error.set('');
    if (this.newPin.length < 4) {
      this.error.set('PIN must be at least 4 characters.');
      return;
    }
    if (this.newPin !== this.confirmPin) {
      this.error.set('PINs do not match.');
      return;
    }
    this.loading.set(true);
    try {
      await this.auth.resetPin(this.newPin);
      this.step.set('done');
    } catch (e: any) {
      this.error.set(e?.toString() ?? 'Failed to reset PIN.');
    } finally {
      this.loading.set(false);
    }
  }

  async goBack(): Promise<void> {
    // recoverWithAnswers() unlocks the session optimistically before the PIN
    // is actually reset. If the user bails out we must lock first -- otherwise
    // publicGuard sees them as unlocked and redirects to /dashboard.
    // `finally` guarantees the navigation fires even if lock() throws.
    try {
      if (this.auth.isUnlocked()) {
        await this.auth.lock();
      }
    } finally {
      this.router.navigate(['/unlock']);
    }
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
