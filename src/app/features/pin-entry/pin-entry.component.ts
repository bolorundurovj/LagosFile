import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { LucideAngularModule } from 'lucide-angular';
import { LogoMarkComponent } from '../../shared/components/logo-mark/logo-mark.component';

@Component({
  selector: 'lf-pin-entry',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule, LogoMarkComponent],
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

          <div class="auth-card__actions">
            <button type="submit" class="btn btn--primary btn--lg auth-submit-btn" [disabled]="loading">
              @if (loading) { Unlocking… } @else { Unlock }
            </button>
            @if (auth.biometricEnabled()) {
              <button type="button" class="btn btn--secondary btn--lg btn--biometric" (click)="unlockWithBiometric()" [disabled]="loading" title="Unlock with Biometric">
                <lucide-icon name="fingerprint" [size]="28" [strokeWidth]="1.5"></lucide-icon>
              </button>
            }
          </div>
        </form>

        <div class="auth-card__footer">
          @if (auth.hasRecovery()) {
            <a routerLink="/recover-pin" class="forgot-link">Forgot PIN? Use security questions →</a>
          } @else {
            <div class="auth-card__warning">
              <span><lucide-icon name="lock" [size]="14" [strokeWidth]="2"></lucide-icon></span>
              <span>Your data is encrypted. Set up security questions in Settings to enable recovery.</span>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./auth.styles.scss'],
  styles: [`
    .auth-card__actions { display: flex; gap: var(--space-3); width: 100%; }
    .auth-submit-btn { flex: 1; height: 56px; }
    .btn--biometric {
      width: 56px;
      height: 56px;
      padding: 0;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-surface-container-high);
      border: 1px solid var(--color-outline-variant);
      color: var(--color-primary);
    }
    .btn--biometric:hover:not(:disabled) {
      background: var(--color-surface-container-highest);
      border-color: var(--color-primary);
      transform: translateY(-1px);
    }
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
        this.errorMsg = result.error ?? 'Incorrect PIN. Please try again.';
      }
    } finally {
      this.loading = false;
    }
  }

  async unlockWithBiometric(): Promise<void> {
    this.loading = true;
    this.errorMsg = '';
    try {
      const result = await this.auth.unlockWithBiometric();
      if (result.success) {
        this.router.navigate([this.auth.state() === 'needs_profile' ? '/profile-setup' : '/dashboard']);
      } else {
        this.errorMsg = result.error ?? 'Biometric authentication failed.';
      }
    } finally {
      this.loading = false;
    }
  }
}
