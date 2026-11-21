import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { UpdateService } from '../../core/services/update.service';
import { DeadlineReminderService } from '../../core/services/deadline-reminder.service';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { TopbarComponent } from '../../shared/components/topbar/topbar.component';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'lf-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent, LucideAngularModule],
  template: `
    <div class="shell">
      <lf-sidebar [taxpayer]="auth.taxpayer()" />
      <div class="shell__main">
        <div class="shell__notices">
          @if (update.updateAvailable()) {
            <div class="update-banner">
              <lucide-icon name="info" [size]="16" [strokeWidth]="2"></lucide-icon>
              <span>LagosFile v{{ update.updateAvailable() }} is available.</span>
              <a [href]="update.updateUrl()" target="_blank" class="update-banner__link">View release</a>
              <button class="update-banner__dismiss" (click)="update.dismiss(update.updateAvailable()!)" title="Dismiss">&times;</button>
            </div>
          }
          @if (migrationNotices().length > 0) {
            <div class="migration-banner" role="status">
              <lucide-icon name="alert-triangle" [size]="16" [strokeWidth]="2"></lucide-icon>
              <div class="migration-banner__body">
                @for (notice of migrationNotices(); track $index) {
                  <div>{{ notice }}</div>
                }
              </div>
              <button type="button" class="migration-banner__dismiss" (click)="dismissMigrationNotices()" title="Dismiss notices">Dismiss</button>
            </div>
          }
        </div>
        <lf-topbar [taxpayer]="auth.taxpayer()" />
        <main class="shell__content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .shell {
      display: flex;
      height: 100%;
      overflow: hidden;
      background: var(--color-background);
    }

    .shell__notices {
      max-height: 35%;
      overflow-y: auto;
    }

    .shell__main {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .shell__content {
      min-height: 0;
      flex: 1;
      overflow-y: auto;
      padding: var(--space-8);
    }

    .update-banner {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-4);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
      font-size: var(--text-body-sm);
    }
    .update-banner__link { color: var(--color-primary); font-weight: var(--font-weight-medium); text-decoration: underline; }
    .update-banner__dismiss { background: none; border: none; color: var(--color-on-primary-container); font-size: 1.2rem; cursor: pointer; margin-left: auto; padding: 0 var(--space-1); line-height: 1; opacity: 0.7; }
    .update-banner__dismiss:hover { opacity: 1; }

    .migration-banner {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      background: var(--color-warning-container, #fef3c7);
      color: var(--color-on-warning-container, #78350f);
      font-size: var(--text-body-sm);
      border-bottom: 1px solid rgba(120, 53, 15, 0.2);
    }
    .migration-banner__body { flex: 1; display: flex; flex-direction: column; gap: var(--space-1); }
    .migration-banner__dismiss {
      background: none;
      border: 1px solid currentColor;
      border-radius: var(--radius-md);
      color: inherit;
      font-size: var(--text-label-sm);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
      padding: 2px 10px;
      flex-shrink: 0;
    }
  `],
})
export class ShellComponent implements OnInit {
  auth = inject(AuthService);
  private config = inject(ConfigService);
  update = inject(UpdateService);
  private reminders = inject(DeadlineReminderService);
  migrationNotices = this.config.migrationNotices;

  async ngOnInit(): Promise<void> {
    try {
      await this.config.loadActive();
    } catch { /* new install; seed data will be created on unlock */ }
    try {
      await this.config.getMigrationNotices();
    } catch { /* ignore when notices unavailable */ }
    this.update.checkForUpdates();
    void this.reminders.check();
  }

  async dismissMigrationNotices(): Promise<void> {
    try {
      await this.config.dismissMigrationNotices();
    } catch { /* keep UI dismissed */ }
  }
}
