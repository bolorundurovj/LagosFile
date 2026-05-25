import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'lf-pin-entry',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-card__brand">
          <div class="brand-mark">LF</div>
          <h1 class="brand-name">LagosFile</h1>
        </div>

        <h2 class="auth-card__title">Unlock your data</h2>
        <p class="auth-card__subtitle">Enter your PIN to access your filings.</p>

        <form class="auth-card__form" (ngSubmit)="submit()">
          <div class="form-group">
            <label class="form-label" for="pin">PIN</label>
            <input
              id="pin"
              type="password"
              class="form-input"
              [class.is-invalid]="!!errorMsg"
              [(ngModel)]="pin"
              name="pin"
              placeholder="Enter your PIN"
              autocomplete="current-password"
              (input)="errorMsg = ''"
            />
            @if (errorMsg) {
              <span class="form-error">{{ errorMsg }}</span>
            }
          </div>

          <button type="submit" class="btn btn--primary btn--lg w-full" [disabled]="loading">
            @if (loading) { Unlocking… } @else { Unlock }
          </button>
        </form>

        <div class="auth-card__footer">
          @if (auth.hasRecovery()) {
            <a routerLink="/recover-pin" class="forgot-link">Forgot PIN? Use security questions →</a>
          } @else {
            <div class="auth-card__warning">
              <span>🔒</span>
              <span>Your data is encrypted. Set up security questions in Settings to enable recovery.</span>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./auth.styles.scss'],
  styles: [`
    .auth-card__footer { margin-top: var(--space-4); text-align: center; }
    .forgot-link {
      font-size: var(--text-body-sm);
      color: var(--color-primary);
      text-decoration: none;
      opacity: 0.85;
    }
    .forgot-link:hover { opacity: 1; text-decoration: underline; }
  `],
})
export class PinEntryComponent {
  pin = '';
  loading = false;
  errorMsg = '';

  auth = inject(AuthService);
  private router = inject(Router);

  async submit(): Promise<void> {
    if (!this.pin) { this.errorMsg = 'PIN is required.'; return; }
    this.loading = true;
    this.errorMsg = '';
    try {
      const result = await this.auth.unlock(this.pin);
      if (result.success) {
        this.router.navigate([this.auth.state() === 'needs_profile' ? '/profile-setup' : '/dashboard']);
      } else {
        this.errorMsg = result.error ?? 'Incorrect PIN.';
      }
    } finally {
      this.loading = false;
    }
  }
}
