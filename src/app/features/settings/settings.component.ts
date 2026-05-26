import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ProfileService } from '../../core/services/profile.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog';
import { homeDir, join } from '@tauri-apps/api/path';

@Component({
  selector: 'lf-settings',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule],
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
          <button class="btn btn--primary" style="margin-top:var(--space-5)" (click)="saveProfile()" [disabled]="savingProfile()">
            @if (savingProfile()) { Saving... } @else { Update Profile }
          </button>
        }
      </div>

      <!-- Appearance section -->
      <div class="card">
        <h2 class="title-md" style="margin-bottom:var(--space-2)">Appearance</h2>
        <p class="body-sm text-muted" style="margin-bottom:var(--space-5)">
          Choose how LagosFile looks. System follows your OS preference automatically.
        </p>
        <div class="theme-switcher">
          <button class="theme-btn" [class.theme-btn--active]="themeService.theme() === 'light'"
            (click)="themeService.setTheme('light')" type="button">
            <lucide-icon name="sun" [size]="20" [strokeWidth]="1.75"></lucide-icon>
            <span>Light</span>
          </button>
          <button class="theme-btn" [class.theme-btn--active]="themeService.theme() === 'dark'"
            (click)="themeService.setTheme('dark')" type="button">
            <lucide-icon name="moon" [size]="20" [strokeWidth]="1.75"></lucide-icon>
            <span>Dark</span>
          </button>
          <button class="theme-btn" [class.theme-btn--active]="themeService.theme() === 'system'"
            (click)="themeService.setTheme('system')" type="button">
            <lucide-icon name="monitor" [size]="20" [strokeWidth]="1.75"></lucide-icon>
            <span>System</span>
          </button>
        </div>
      </div>

      <!-- Backup & Restore -->
      <div class="card">
        <h2 class="title-md" style="margin-bottom:var(--space-2)">Data & Backup</h2>
        <p class="body-sm text-muted" style="margin-bottom:var(--space-5)">
          Back up your encrypted vault to any location. The backup file is protected by your current PIN —
          it cannot be opened without it. Restore replaces your current data with the backup.
        </p>
        <div class="backup-row">
          <div class="backup-item">
            <div class="backup-item__title">Backup vault</div>
            <div class="backup-item__sub">Save an encrypted copy of all your filing data</div>
          </div>
          <button class="btn btn--secondary" (click)="backupDb()" [disabled]="backingUp()">
            @if (backingUp()) { Saving… } @else {
              <lucide-icon name="paperclip" [size]="14" [strokeWidth]="2" style="vertical-align:middle;margin-right:6px"></lucide-icon>Backup
            }
          </button>
        </div>
        <div class="backup-row" style="margin-top:var(--space-3)">
          <div class="backup-item">
            <div class="backup-item__title">Restore from backup</div>
            <div class="backup-item__sub">Replace current data with a previous backup (requires same PIN)</div>
          </div>
          <button class="btn btn--danger-outline" (click)="restoreDb()" [disabled]="restoring()">
            @if (restoring()) { Restoring… } @else {
              <lucide-icon name="folder" [size]="14" [strokeWidth]="2" style="vertical-align:middle;margin-right:6px"></lucide-icon>Restore
            }
          </button>
        </div>
      </div>

      <!-- Security section -->
      <div class="card">
        <h2 class="title-md" style="margin-bottom:var(--space-2)">Security</h2>
        <p class="body-sm text-muted" style="margin-bottom:var(--space-5)">
          Your data is encrypted at rest using AES-256-GCM. Your PIN is never stored.
        </p>
        <div class="security-badges">
          <div class="security-badge">
            <span class="security-badge__icon"><lucide-icon name="lock" [size]="18" [strokeWidth]="1.75"></lucide-icon></span>
            <div>
              <div class="security-badge__title">AES-256-GCM Encryption</div>
              <div class="security-badge__sub">All data encrypted at rest</div>
            </div>
          </div>
          <div class="security-badge">
            <span class="security-badge__icon"><lucide-icon name="key" [size]="18" [strokeWidth]="1.75"></lucide-icon></span>
            <div>
              <div class="security-badge__title">PBKDF2-SHA256 Key Derivation</div>
              <div class="security-badge__sub">480,000 iterations</div>
            </div>
          </div>
          <div class="security-badge">
            <span class="security-badge__icon"><lucide-icon name="folder" [size]="18" [strokeWidth]="1.75"></lucide-icon></span>
            <div>
              <div class="security-badge__title">Local Storage Only</div>
              <div class="security-badge__sub">~/LagosFile/ on your machine</div>
            </div>
          </div>
        </div>
        <button class="btn btn--danger" style="margin-top:var(--space-5)" (click)="lock()">
          <lucide-icon name="lock" [size]="14" [strokeWidth]="2" style="vertical-align:middle;margin-right:6px"></lucide-icon>Lock App Now
        </button>
      </div>

      <!-- Recovery -->
      <div class="card">
        <h2 class="title-md" style="margin-bottom:var(--space-2)">Account Recovery</h2>
        <p class="body-sm text-muted" style="margin-bottom:var(--space-4)">
          Security questions let you reset your PIN if you forget it.
        </p>
        @if (auth.hasRecovery()) {
          <div class="security-badge" style="margin-bottom:var(--space-4)">
            <span class="security-badge__icon"><lucide-icon name="check-circle" [size]="18" [strokeWidth]="1.75"></lucide-icon></span>
            <div>
              <div class="security-badge__title">Recovery questions are set up</div>
              <div class="security-badge__sub">You can reset your PIN if you forget it.</div>
            </div>
          </div>
          <a routerLink="/setup-recovery" class="btn btn--secondary">Update Security Questions</a>
        } @else {
          <div class="security-badge security-badge--warn" style="margin-bottom:var(--space-4)">
            <span class="security-badge__icon"><lucide-icon name="alert-triangle" [size]="18" [strokeWidth]="1.75"></lucide-icon></span>
            <div>
              <div class="security-badge__title">No recovery questions set</div>
              <div class="security-badge__sub">If you forget your PIN, your data cannot be recovered.</div>
            </div>
          </div>
          <a routerLink="/setup-recovery" class="btn btn--primary">Set Up Security Questions</a>
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
          <a href="https://etax.lirs.net" target="_blank" class="btn btn--ghost btn--sm">Open Portal</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .settings-page { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-6); }
    .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
    .theme-switcher { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); }
    .theme-btn {
      display: flex; flex-direction: column; align-items: center; gap: var(--space-2);
      padding: var(--space-4) var(--space-3); border-radius: var(--radius-lg);
      border: 2px solid transparent;
      background: var(--color-surface-container-low);
      color: var(--color-on-surface-variant);
      font-size: var(--text-label-lg); font-weight: var(--font-weight-medium);
      cursor: pointer; transition: all var(--transition-base);
    }
    .theme-btn:hover { background: var(--color-surface-container); color: var(--color-on-surface); }
    .theme-btn--active {
      border-color: var(--color-primary);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
    }
    .backup-row {
      display: flex; align-items: center; justify-content: space-between; gap: var(--space-4);
      padding: var(--space-3) var(--space-4);
      background: var(--color-surface-container-low); border-radius: var(--radius-lg);
    }
    .backup-item__title { font-size: var(--text-body-md); font-weight: var(--font-weight-medium); }
    .backup-item__sub { font-size: var(--text-label-sm); color: var(--color-on-surface-variant); margin-top: 2px; }
    .btn--danger-outline {
      border: 1.5px solid var(--color-error); background: transparent;
      color: var(--color-error); padding: var(--space-2) var(--space-4);
      border-radius: var(--radius-md); font-size: var(--text-label-lg);
      font-weight: var(--font-weight-medium); cursor: pointer; transition: all var(--transition-base);
    }
    .btn--danger-outline:hover { background: var(--color-error-container); }
    .security-badges { display: flex; flex-direction: column; gap: var(--space-3); }
    .security-badge {
      display: flex; align-items: flex-start; gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      background: var(--color-surface-container-low); border-radius: var(--radius-lg);
    }
    .security-badge__icon { flex-shrink: 0; margin-top: 2px; }
    .security-badge__title { font-size: var(--text-body-md); font-weight: var(--font-weight-medium); }
    .security-badge__sub { font-size: var(--text-label-sm); color: var(--color-on-surface-variant); margin-top: 2px; }
    .security-badge--warn { background: var(--color-error-container); }
    .about-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: var(--space-2) 0; border-bottom: 1px solid var(--color-surface-container);
      font-size: var(--text-body-sm);
    }
    .about-row:last-child { border-bottom: none; }
  `],
})
export class SettingsComponent {
  auth = inject(AuthService);
  themeService = inject(ThemeService);
  private profileService = inject(ProfileService);
  private toast = inject(ToastService);
  private router = inject(Router);

  savingProfile = signal(false);
  backingUp = signal(false);
  restoring = signal(false);
  editForm = { fullName: '', address: '', phone: '', email: '', filingAgent: '' };

  constructor() {
    const tp = this.auth.taxpayer();
    if (tp) {
      this.editForm.fullName    = tp.fullName;
      this.editForm.address     = tp.address     ?? '';
      this.editForm.phone       = tp.phone       ?? '';
      this.editForm.email       = tp.email       ?? '';
      this.editForm.filingAgent = tp.filingAgent ?? '';
    }
  }

  async saveProfile(): Promise<void> {
    this.savingProfile.set(true);
    try {
      const tp = this.auth.taxpayer();
      if (tp) {
        await this.profileService.update({
          ...tp,
          fullName:    this.editForm.fullName,
          address:     this.editForm.address     || undefined,
          phone:       this.editForm.phone       || undefined,
          email:       this.editForm.email       || undefined,
          filingAgent: this.editForm.filingAgent || undefined,
        });
        this.toast.success('Profile updated successfully.');
      }
    } catch (err: unknown) {
      this.toast.error('Failed to save profile: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      this.savingProfile.set(false);
    }
  }

  async backupDb(): Promise<void> {
    const home = await homeDir();
    const defaultPath = await join(home, 'LagosFile', `lagosfile_backup_${new Date().toISOString().slice(0, 10)}.lf.enc`);
    const chosen = await saveDialog({
      title: 'Save LagosFile Backup',
      defaultPath,
      filters: [{ name: 'LagosFile Backup', extensions: ['lf.enc', 'enc'] }],
    });
    if (!chosen) return;
    this.backingUp.set(true);
    try {
      await this.auth.backupDb(chosen);
      this.toast.success('Backup saved successfully.', {
        label: 'OK',
        fn: () => {},
      });
    } catch (err: unknown) {
      this.toast.error('Backup failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      this.backingUp.set(false);
    }
  }

  async restoreDb(): Promise<void> {
    const chosen = await openDialog({
      title: 'Select LagosFile Backup',
      multiple: false,
      filters: [{ name: 'LagosFile Backup', extensions: ['lf.enc', 'enc', '*'] }],
    });
    if (!chosen) return;
    const src = typeof chosen === 'string' ? chosen : chosen[0];
    if (!src) return;
    this.restoring.set(true);
    try {
      await this.auth.restoreDb(src);
      this.toast.success('Backup restored. Your data has been replaced.');
    } catch (err: unknown) {
      this.toast.error('Restore failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      this.restoring.set(false);
    }
  }

  lock(): void {
    this.auth.lock();
    this.router.navigate(['/unlock']);
  }
}
