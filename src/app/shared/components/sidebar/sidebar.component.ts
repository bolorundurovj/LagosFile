import { Component, inject, input, output } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { LucideAngularModule, LayoutDashboard, FilePlus2, History, Settings2, SlidersHorizontal } from 'lucide-angular';
import { Taxpayer } from '../../../core/models';
import { LogoMarkComponent } from '../logo-mark/logo-mark.component';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  /** Extra URL prefix that should also highlight this item. */
  alsoActiveFor?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',      icon: 'layout-dashboard',    route: '/dashboard' },
  { label: 'New Filing',     icon: 'file-plus-2',         route: '/filing/new' },
  { label: 'Filing History', icon: 'history',             route: '/history',
    alsoActiveFor: '/filing/' },
  { label: 'Configuration',  icon: 'settings-2',          route: '/configuration' },
  { label: 'Settings',       icon: 'sliders-horizontal',  route: '/settings' },
];

@Component({
  selector: 'lf-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule, LogoMarkComponent],
  template: `
    <nav class="sidebar">
      <!-- Logo -->
      <div class="sidebar__logo">
        <lf-logo-mark [size]="52" [dark]="true" />
        <span class="logo-text">LagosFile</span>
      </div>

      <!-- Nav links -->
      <ul class="sidebar__nav">
        @for (item of navItems; track item.route) {
          <li>
            <a
              [routerLink]="item.route"
              routerLinkActive="active"
              [class.active]="isExtraActive(item)"
              class="sidebar__link"
            >
              <span class="sidebar__link-icon">
                <lucide-icon [name]="item.icon" [size]="18" [strokeWidth]="1.75"></lucide-icon>
              </span>
              <span class="sidebar__link-label">{{ item.label }}</span>
            </a>
          </li>
        }
      </ul>

      <!-- Support card at bottom -->
      <div class="sidebar__support">
        <div class="support-card">
          <div class="support-card__title">Need help?</div>
          <div class="support-card__text">LIRS helpline: 01-792-9580</div>
          <a href="https://etax.lirs.net" target="_blank" class="support-card__link">
            LIRS e-Tax Portal ↗
          </a>
        </div>
      </div>
    </nav>
  `,
  styles: [`
    .sidebar {
      width: var(--sidebar-width);
      height: 100vh;
      background: var(--color-sidebar-bg);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      overflow: hidden;
    }

    .sidebar__logo {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-5) var(--space-5) var(--space-4);
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .logo-text {
      font-family: 'Geist', var(--font-display), sans-serif;
      font-size: var(--text-title-sm);
      font-weight: 600;
      color: var(--color-sidebar-text);
      letter-spacing: -0.025em;
      white-space: nowrap;
    }

    .sidebar__nav {
      flex: 1;
      list-style: none;
      padding: var(--space-4) var(--space-3);
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      overflow-y: auto;
    }

    .sidebar__link {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-lg);
      color: var(--color-sidebar-text-muted);
      text-decoration: none;
      font-size: var(--text-body-md);
      font-weight: var(--font-weight-medium);
      transition: all var(--transition-fast);

      &:hover {
        background: var(--color-sidebar-hover-bg);
        color: var(--color-sidebar-text);
      }

      &.active {
        background: var(--color-sidebar-active-bg);
        color: var(--color-sidebar-text);
      }
    }

    .sidebar__link-icon {
      width: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .sidebar__support {
      padding: var(--space-4) var(--space-4) var(--space-6);
    }

    .support-card {
      background: rgba(255,255,255,0.06);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
    }

    .support-card__title {
      font-size: var(--text-label-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-sidebar-text);
      margin-bottom: var(--space-1);
    }

    .support-card__text {
      font-size: var(--text-label-sm);
      color: var(--color-sidebar-text-muted);
      margin-bottom: var(--space-2);
    }

    .support-card__link {
      font-size: var(--text-label-sm);
      color: var(--color-on-primary-container);
      text-decoration: none;
      &:hover { text-decoration: underline; }
    }
  `],
})
export class SidebarComponent {
  taxpayer = input<Taxpayer | null>(null);
  readonly navItems = NAV_ITEMS;

  private router = inject(Router);

  /** Reactive current URL — updates on every navigation. */
  readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map((e: NavigationEnd) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  isExtraActive(item: NavItem): boolean {
    const url = this.currentUrl() ?? '';
    if (!item.alsoActiveFor) return false;
    return url.startsWith(item.alsoActiveFor) && !url.startsWith(item.route);
  }
}
