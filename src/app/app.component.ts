import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastComponent } from './shared/components/toast/toast.component';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

interface DocMigrationProgress {
  completed: number;
  total: number;
  fileName: string;
}

@Component({
  selector: 'lf-root',
  standalone: true,
  imports: [RouterOutlet, ToastComponent],
  template: `
    @if (migrationStatus()) {
      <div class="migration-banner" role="status" aria-live="polite">
        Encrypting attached documents ({{ migrationStatus()!.completed }} / {{ migrationStatus()!.total }}):
        {{ migrationStatus()!.fileName }}
      </div>
    }
    <router-outlet />
    <lf-toast-outlet />
  `,
  styles: [`
    :host {
      display: block;
      height: 100vh;
      width: 100vw;
    }
    .migration-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 9999;
      padding: 8px 16px;
      background: var(--color-primary, #0F3460);
      color: #fff;
      font-size: 13px;
      text-align: center;
    }
  `],
})
export class AppComponent implements OnInit, OnDestroy {
  migrationStatus = signal<DocMigrationProgress | null>(null);
  private unlisten: UnlistenFn | null = null;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        this.unlisten = await listen<DocMigrationProgress>('doc-migration-progress', (event) => {
          const p = event.payload;
          this.migrationStatus.set(p);
          if (this.clearTimer) clearTimeout(this.clearTimer);
          if (p.completed >= p.total) {
            this.clearTimer = setTimeout(() => this.migrationStatus.set(null), 1500);
          }
        });
      } catch {
        // Non-Tauri environment
      }
    }
  }

  ngOnDestroy(): void {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.unlisten?.();
  }
}
