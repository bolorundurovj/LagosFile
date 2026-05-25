import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'lf-pin-setup',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-card__brand">
          <div class="brand-mark">LF</div>
          <h1 class="brand-name">LagosFile</h1>
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
              <span class="alert__icon">⚠</span>
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
    } catch (err: unknown) {
      this.errors.general = err instanceof Error ? err.message : 'An unexpected error occurred.';
    } finally {
      this.loading = false;
    }
  }
}
