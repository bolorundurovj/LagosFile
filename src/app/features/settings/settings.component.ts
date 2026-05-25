import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ProfileService } from '../../core/services/profile.service';
import { Router } from '@angular/router';

@Component({
  selector: 'lf-settings',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="settings-page">
      <h1 class="headline-md">Settings</h1>

      <!-- Profile section -->
      <div class="card">
        <h2 class="title-md" style="margin-bottom:var(--space-5)">Taxpayer Profile</h2>
        @if (auth.taxpayer()) {
          <div class="settings-grid">
            <div class="form-group">
              <label class="form-label">Full Name</label>
              <input type="text" class="form-input" [(ngModel)]="editForm.fullName" name="fullName" />
            </div>
            <div class="form-group">
              <label class="form-label">TIN</label>
              <input type="text" class="form-input" [value]="auth.taxpayer()!.tin" readonly style="opacity:0.7" />
            </div>
            <div class="form-group">
              <label class="form-label">Lagos Address</label>
              <input type="text" class="form-input" [(ngModel)]="editForm.address" name="address" />
            </div>
            <div class="form-group">
              <label class="form-label">Phone</label>
              <input type="text" class="form-input" [(ngModel)]="editForm.phone" name="phone" />
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" class="form-input" [(ngModel)]="editForm.email" name="email" />
            </div>
            <div class="form-group">
              <label class="form-label">Filing Agent / Company</label>
              <input type="text" class="form-input" [(ngModel)]="editForm.filingAgent" name="filingAgent" />
            </div>
          </div>
          @if (profileSaved()) {
            <div class="alert alert--success" style="margin-top:var(--space-4)">
              <span class="alert__icon">✓</span>
              <div class="alert__content">Profile updated successfully.</div>
            </div>
          }
          <button class="btn btn--primary" style="margin-top:var(--space-5)" (click)="saveProfile()" [disabled]="savingProfile()">
            @if (savingProfile()) { Saving… } @else { Update Profile }
          </button>
        }
      </div>

      <!-- Security section -->
      <div class="card">
        <h2 class="title-md" style="margin-bottom:var(--space-2)">Security</h2>
        <p class="body-sm text-muted" style="margin-bottom:var(--space-5)">
          Your data is encrypted at rest using AES-256-GCM. Your PIN is never stored — only a derived key is used.
        </p>
        <div class="security-badges">
          <div class="security-badge">
            <span class="security-badge__icon">🔒</span>
            <div>
              <div class="security-badge__title">AES-256-GCM Encryption</div>
              <div class="security-badge__sub">All data encrypted at rest</div>
            </div>
          </div>
          <div class="security-badge">
            <span class="security-badge__icon">🗝</span>
            <div>
              <div class="security-badge__title">PBKDF2-SHA256 Key Derivation</div>
              <div class="security-badge__sub">480,000 iterations</div>
            </div>
          </div>
          <div class="security-badge">
            <span class="security-badge__icon">📁</span>
            <div>
              <div class="security-badge__title">Local Storage Only</div>
              <div class="security-badge__sub">~/LagosFile/ on your machine</div>
            </div>
          </div>
        </div>

        <button class="btn btn--danger" style="margin-top:var(--space-5)" (click)="lock()">
          🔒 Lock App Now
        </button>
      </div>

      <!-- Recovery / Security Questions -->
      <div class="card">
        <h2 class="title-md" style="margin-bottom:var(--space-2)">Account Recovery</h2>
        <p class="body-sm text-muted" style="margin-bottom:var(--space-4)">
          Security questions let you reset your PIN if you forget it. Answers are stored
          encrypted — only you can recover your account.
        </p>

        @if (auth.hasRecovery()) {
          <div class="security-badge" style="margin-bottom:var(--space-4)">
            <span class="security-badge__icon">✅</span>
            <div>
              <div class="security-badge__title">Recovery questions are set up</div>
              <div class="security-badge__sub">You can reset your PIN if you forget it.</div>
            </div>
          </div>
          <a routerLink="/setup-recovery" class="btn btn--secondary">
            Update Security Questions
          </a>
        } @else {
          <div class="security-badge security-badge--warn" style="margin-bottom:var(--space-4)">
            <span class="security-badge__icon">⚠️</span>
            <div>
              <div class="security-badge__title">No recovery questions set</div>
              <div class="security-badge__sub">If you forget your PIN, your data cannot be recovered.</div>
            </div>
          </div>
          <a routerLink="/setup-recovery" class="btn btn--primary">
            Set Up Security Questions
          </a>
        }
      </div>

      <!-- About -->
      <div class="card">
        <h2 class="title-md" style="margin-bottom:var(--space-3)">About LagosFile</h2>
        <div class="about-row"><span>Version</span><span>2.0.0</span></div>
        <div class="about-row"><span>Technology</span><span>Angular 19 + Tauri 2 (Rust)</span></div>
        <div class="about-row"><span>Legislation</span><span>Nigeria Tax Act (NTA) 2025</span></div>
        <div class="about-row"><span>Tax Authority</span><span>Lagos Internal Revenue Service (LIRS)</span></div>
        <div class="about-row">
          <span>LIRS e-Tax Portal</span>
          <a href="https://etax.lirs.net" target="_blank" class="btn btn--ghost btn--sm">Open Portal ↗</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .settings-page { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-6); }
    .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }

    .security-badges { display: flex; flex-direction: column; gap: var(--space-3); }
    .security-badge {
      display: flex; align-items: flex-start; gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      background: var(--color-surface-container-low); border-radius: var(--radius-lg);
    }
    .security-badge__icon { font-size: 1.25rem; }
    .security-badge__title { font-size: var(--text-body-md); font-weight: var(--font-weight-medium); }
    .security-badge__sub { font-size: var(--text-label-sm); color: var(--color-on-surface-variant); }
    .security-badge--warn { background: color-mix(in srgb, var(--color-warning, #d97706) 10%, transparent); }

    .about-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: var(--space-3) 0; border-bottom: 1px solid var(--color-surface-container);
      font-size: var(--text-body-md);
      &:first-of-type { border-top: 1px solid var(--color-surface-container); }
      span:first-child { color: var(--color-on-surface-variant); }
    }
  `],
})
export class SettingsComponent {
  auth = inject(AuthService);
  private profileService = inject(ProfileService);
  private router = inject(Router);

  editForm = {
    fullName: this.auth.taxpayer()?.fullName ?? '',
    address: this.auth.taxpayer()?.address ?? '',
    phone: this.auth.taxpayer()?.phone ?? '',
    email: this.auth.taxpayer()?.email ?? '',
    filingAgent: this.auth.taxpayer()?.filingAgent ?? '',
  };

  savingProfile = signal(false);
  profileSaved = signal(false);

  async saveProfile(): Promise<void> {
    this.savingProfile.set(true);
    try {
      const updated = await this.profileService.update(this.editForm);
      this.auth.setTaxpayer(updated);
      this.profileSaved.set(true);
      setTimeout(() => this.profileSaved.set(false), 3000);
    } finally {
      this.savingProfile.set(false);
    }
  }

  async lock(): Promise<void> {
    await this.auth.lock();
    this.router.navigate(['/unlock']);
  }
}
