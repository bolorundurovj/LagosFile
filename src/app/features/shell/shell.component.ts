import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { TopbarComponent } from '../../shared/components/topbar/topbar.component';
import { ToastComponent } from '../../shared/components/toast/toast.component';

@Component({
  selector: 'lf-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent, ToastComponent],
  template: `
    <div class="shell">
      <lf-sidebar [taxpayer]="auth.taxpayer()" />
      <div class="shell__main">
        <lf-topbar [taxpayer]="auth.taxpayer()" />
        <main class="shell__content">
          <router-outlet />
        </main>
      </div>
    </div>
    <lf-toast-outlet />
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
  `],
})
export class ShellComponent implements OnInit {
  auth = inject(AuthService);
  private config = inject(ConfigService);

  async ngOnInit(): Promise<void> {
    try {
      await this.config.loadActive();
    } catch (_) { /* new install; seed data will be created on unlock */ }
  }
}
