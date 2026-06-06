import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { UpdateService } from '../../core/services/update.service';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { TopbarComponent } from '../../shared/components/topbar/topbar.component';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'lf-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent, LucideAngularModule],
  template: `
    @if (update.updateAvailable()) {
      <div class="update-banner">
        <lucide-icon name="info" [size]="16" [strokeWidth]="2"></lucide-icon>
        <span>LagosFile v{{ update.updateAvailable() }} is available.</span>
        <a [href]="update.updateUrl()" target="_blank" class="update-banner__link">View release</a>
        <button class="update-banner__dismiss" (click)="update.dismiss(update.updateAvailable()!)" title="Dismiss">&times;</button>
      </div>
    }
    <div class="shell">
      <lf-sidebar [taxpayer]="auth.taxpayer()" />
      <div class="shell__main">
        <lf-topbar [taxpayer]="auth.taxpayer()" />
        <main class="shell__content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [`
    .shell {
      display: flex;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
      background: var(--color-background);
    }

    .shell__main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .shell__content {
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
  `],
})
export class ShellComponent implements OnInit {
  auth = inject(AuthService);
  private config = inject(ConfigService);
  update = inject(UpdateService);

  async ngOnInit(): Promise<void> {
    try {
      await this.config.loadActive();
    } catch (_) { /* new install; seed data will be created on unlock */ }
    this.update.checkForUpdates();
  }
}
