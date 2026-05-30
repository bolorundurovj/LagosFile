import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { LucideAngularModule } from 'lucide-angular';
import { LogoMarkComponent } from '../../shared/components/logo-mark/logo-mark.component';

@Component({
  selector: 'lf-pin-setup',
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

        <h2 class="auth-card__title">Create your PIN</h2>
        <p class="auth-card__subtitle">
          Your PIN encrypts your local database. You will set up security questions
          on the next screen so you can recover your account if you forget it.
        </p>

        <form class="auth-card__form" (ngSubmit)="submit()">
          <div class="form-group">
            <label class="form-label" for="pin">PIN</label>
            <input
              id="pin"
              type="password"
              class="form-input"
              [class.is-invalid]="errors.pin"
              [(ngModel)]="pin"
              name="pin"
              placeholder="Enter a PIN"
              minlength="4"
              autocomplete="new-password"
            />
            @if (errors.pin) {
              <span class="form-error">{{ errors.pin }}</span>
            }
          </div>

          <div class="form-group">
            <label class="form-label" for="confirm">Confirm PIN</label>
            <input
              id="confirm"
              type="password"
              class="form-input"
              [class.is-invalid]="errors.confirm"
              [(ngModel)]="confirm"
              name="confirm"
              placeholder="Re-enter your PIN"
              autocomplete="new-password"
            />
            @if (errors.confirm) {
              <span class="form-error">{{ errors.confirm }}</span>
            }
          </div>

          @if (errors.general) {
            <div class="alert alert--error">
              <span class="alert__icon"><lucide-icon name="alert-triangle" [size]="16" [strokeWidth]="2"></lucide-icon></span>
              <div class="alert__content">{{ errors.general }}</div>
            </div>
          }

          <button type="submit" class="btn btn--primary btn--lg w-full" [disabled]="loading">
            @if (loading) { Setting up… } @else { Create PIN & Continue }
          </button>
        </form>
      </div>
    </div>
  `,
  styleUrls: ['./auth.styles.scss'],
})
export class PinSetupComponent {
  pin = '';
  confirm = '';
  loading = false;
  errors: { pin?: string; confirm?: string; general?: string } = {};

  private auth = inject(AuthService);
  private router = inject(Router);

  async submit(): Promise<void> {
    this.errors = {};
    if (this.pin.length < 4) {
      this.errors.pin = 'PIN must be at least 4 characters.';
      return;
    }
    if (this.pin !== this.confirm) {
      this.errors.confirm = 'PINs do not match.';
      return;
    }
    this.loading = true;
    try {
      await this.auth.setupPin(this.pin);
      this.router.navigate(['/setup-recovery']);
    } catch (e: any) {
      this.errors.general = e?.toString() ?? 'Failed to set PIN.';
    } finally {
      this.loading = false;
    }
  }
}
