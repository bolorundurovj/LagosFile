import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { LucideAngularModule } from 'lucide-angular';
import { LogoMarkComponent } from '../../shared/components/logo-mark/logo-mark.component';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

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

        @if (!restoreMode) {
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

          <div style="margin-top:var(--space-4);text-align:center">
            <button type="button" class="btn btn--ghost btn--sm" (click)="enterRestoreMode()">
              <lucide-icon name="folder" [size]="14" [strokeWidth]="2" style="vertical-align:middle;margin-right:6px"></lucide-icon>
              Restore from backup
            </button>
          </div>
        } @else {
          <h2 class="auth-card__title">Restore from backup</h2>
          <p class="auth-card__subtitle">
            Select a LagosFile backup file and enter the PIN it was created with.
            That PIN will become your vault PIN on this device.
          </p>

          <form class="auth-card__form" (ngSubmit)="submitRestore()">
            <div class="form-group">
              <label class="form-label" for="backupFile">Backup File</label>
              <div style="display:flex;gap:var(--space-2)">
                <input
                  id="backupFile"
                  type="text"
                  class="form-input"
                  [value]="backupPath"
                  readonly
                  placeholder="Choose a .lf.enc backup file"
                />
                <button type="button" class="btn btn--secondary" (click)="pickBackupFile()">Browse</button>
              </div>
              @if (errors.file) {
                <span class="form-error">{{ errors.file }}</span>
              }
            </div>

            <div class="form-group">
              <label class="form-label" for="backupPin">Backup PIN</label>
              <input
                id="backupPin"
                type="password"
                class="form-input"
                [class.is-invalid]="errors.pin"
                [(ngModel)]="backupPin"
                name="backupPin"
                placeholder="Enter the PIN used when creating the backup"
                autocomplete="current-password"
              />
              @if (errors.pin) {
                <span class="form-error">{{ errors.pin }}</span>
              }
            </div>

            @if (errors.general) {
              <div class="alert alert--error">
                <span class="alert__icon"><lucide-icon name="alert-triangle" [size]="16" [strokeWidth]="2"></lucide-icon></span>
                <div class="alert__content">{{ errors.general }}</div>
              </div>
            }

            <button type="submit" class="btn btn--primary btn--lg w-full" [disabled]="loading">
              @if (loading) { Restoring… } @else { Restore & Unlock }
            </button>
          </form>

          <div style="margin-top:var(--space-4);text-align:center">
            <button type="button" class="btn btn--ghost btn--sm" (click)="exitRestoreMode()" [disabled]="loading">
              Back to Create PIN
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styleUrls: ['./auth.styles.scss'],
})
export class PinSetupComponent {
  pin = '';
  confirm = '';
  restoreMode = false;
  backupPath = '';
  backupPin = '';
  loading = false;
  errors: { pin?: string; confirm?: string; file?: string; general?: string } = {};

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  enterRestoreMode(): void {
    this.restoreMode = true;
    this.errors = {};
  }

  exitRestoreMode(): void {
    this.restoreMode = false;
    this.errors = {};
    this.backupPin = '';
  }

  async pickBackupFile(): Promise<void> {
    const chosen = await openDialog({
      title: 'Select LagosFile Backup',
      multiple: false,
      filters: [{ name: 'LagosFile Backup', extensions: ['lf.enc', 'enc', '*'] }],
    });
    if (!chosen) return;
    const src = typeof chosen === 'string' ? chosen : chosen[0];
    if (src) {
      this.backupPath = src;
      this.errors.file = undefined;
    }
  }

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
      void this.router.navigate(['/setup-recovery']);
    } catch (e: unknown) {
      this.errors.general = e instanceof Error ? e.message : String(e ?? 'Failed to set PIN.');
    } finally {
      this.loading = false;
    }
  }

  async submitRestore(): Promise<void> {
    this.errors = {};
    if (!this.backupPath) {
      this.errors.file = 'Please select a backup file.';
      return;
    }
    if (!this.backupPin) {
      this.errors.pin = 'Please enter the backup PIN.';
      return;
    }
    this.loading = true;
    try {
      const taxpayer = await this.auth.restoreBackupFresh(this.backupPath, this.backupPin);
      if (taxpayer) {
        void this.router.navigate(['/dashboard']);
      } else {
        void this.router.navigate(['/profile-setup']);
      }
    } catch (e: unknown) {
      this.errors.general = e instanceof Error ? e.message : String(e ?? 'Restore failed.');
    } finally {
      this.loading = false;
    }
  }
}
