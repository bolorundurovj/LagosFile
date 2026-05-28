import { Component, computed, inject, input } from '@angular/core';
import { Taxpayer } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

type Theme = 'light' | 'dark' | 'system';

@Component({
  selector: 'lf-topbar',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <header class="topbar">
      <div class="topbar__left">
        <lucide-icon name="calendar" [size]="16" [strokeWidth]="1.75" style="vertical-align:middle;margin-right:6px;opacity:0.6"></lucide-icon>
        <span class="topbar__yoa">YOA {{ currentYear }}</span>
      </div>
      <div class="topbar__right">
        <button class="topbar__theme-btn" (click)="cycleTheme()" [attr.aria-label]="'Theme: ' + themeService.theme()">
          @switch (themeService.theme()) {
            @case ('light') { <lucide-icon name="sun" [size]="18" [strokeWidth]="1.75"></lucide-icon> }
            @case ('dark')  { <lucide-icon name="moon" [size]="18" [strokeWidth]="1.75"></lucide-icon> }
            @case ('system') { <lucide-icon name="monitor" [size]="18" [strokeWidth]="1.75"></lucide-icon> }
          }
        </button>
        @if (taxpayer()) {
          <div class="topbar__user">
            <div class="topbar__user-info">
              <span class="topbar__user-name">{{ taxpayer()!.fullName }}</span>
              <span class="topbar__user-tin">TIN: {{ taxpayer()!.tin }}</span>
            </div>
            <button class="topbar__avatar" (click)="showMenu = !showMenu" aria-label="User menu">
              {{ initials() }}
            </button>
            @if (showMenu) {
              <div class="topbar__dropdown">
                <button class="topbar__dropdown-item" (click)="lock()">Lock App</button>
              </div>
            }
          </div>
        }
      </div>
    </header>
  `,
  styles: [`
    :host { position: relative; z-index: 10; }

    .topbar {
      height: var(--topbar-height);
      background: var(--color-surface-container-lowest);
      box-shadow: var(--shadow-card);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 var(--space-8);
      flex-shrink: 0;
    }

    .topbar__yoa {
      font-size: var(--text-label-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-on-surface-variant);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .topbar__right { display: flex; align-items: center; gap: var(--space-3); }

    .topbar__theme-btn {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: var(--radius-full);
      border: none; background: transparent; color: var(--color-on-surface-variant);
      cursor: pointer; transition: all var(--transition-fast);
      &:hover { background: var(--color-surface-container-low); color: var(--color-on-surface); }
    }

    .topbar__user { display: flex; align-items: center; gap: var(--space-3); position: relative; }

    .topbar__user-info {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }

    .topbar__user-name {
      font-size: var(--text-body-md);
      font-weight: var(--font-weight-semibold);
      color: var(--color-on-surface);
    }

    .topbar__user-tin {
      font-size: var(--text-label-sm);
      color: var(--color-on-surface-variant);
    }

    .topbar__avatar {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-full);
      background: var(--gradient-cta);
      color: white;
      font-size: var(--text-label-md);
      font-weight: var(--font-weight-bold);
      font-family: var(--font-display);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border: none;
      transition: opacity var(--transition-fast);
      &:hover { opacity: 0.88; }
    }

    .topbar__dropdown {
      position: absolute;
      top: calc(100% + var(--space-2));
      right: 0;
      background: var(--glass-bg);
      backdrop-filter: blur(var(--glass-blur));
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-dropdown);
      padding: var(--space-2);
      min-width: 140px;
      z-index: 20;
    }

    .topbar__dropdown-item {
      display: block;
      width: 100%;
      text-align: left;
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      font-size: var(--text-body-sm);
      color: var(--color-on-surface);
      background: none;
      border: none;
      cursor: pointer;
      transition: background var(--transition-fast);
      &:hover { background: var(--color-surface-container-low); }
    }
  `],
})
export class TopbarComponent {
  taxpayer = input<Taxpayer | null>(null);
  showMenu = false;

  readonly currentYear = new Date().getFullYear();

  private auth = inject(AuthService);
  private router = inject(Router);
  readonly themeService = inject(ThemeService);

  private readonly themeCycle: Theme[] = ['light', 'dark', 'system'];
  private themeIndex = 0;

  readonly initials = computed(() => {
    const t = this.taxpayer();
    if (!t) return '';
    return t.fullName.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
  });

  cycleTheme(): void {
    const current = this.themeService.theme() as Theme;
    const idx = this.themeCycle.indexOf(current);
    const next = this.themeCycle[(idx + 1) % this.themeCycle.length];
    this.themeService.setTheme(next);
  }

  async lock(): Promise<void> {
    this.showMenu = false;
    await this.auth.lock();
    this.router.navigate(['/unlock']);
  }
}
