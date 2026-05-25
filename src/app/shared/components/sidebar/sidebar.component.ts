import { Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Taxpayer } from '../../../core/models';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',        icon: '◈',  route: '/dashboard' },
  { label: 'New Filing',       icon: '+',  route: '/filing/new' },
  { label: 'Filing History',   icon: '☰',  route: '/history' },
  { label: 'Configuration',    icon: '⚙',  route: '/configuration' },
  { label: 'Settings',         icon: '⊙',  route: '/settings' },
];

@Component({
  selector: 'lf-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="sidebar">
      <!-- Logo -->
      <div class="sidebar__logo">
        <span class="logo-mark">LF</span>
        <span class="logo-text">LagosFile</span>
      </div>

      <!-- Nav links -->
      <ul class="sidebar__nav">
        @for (item of navItems; track item.route) {
          <li>
            <a
              [routerLink]="item.route"
              routerLinkActive="active"
              class="sidebar__link"
            >
              <span class="sidebar__link-icon">{{ item.icon }}</span>
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
          <a href="https://etax.lirs.gov.ng" target="_blank" class="support-card__link">
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
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-6) var(--space-5);
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .logo-mark {
      width: 36px;
      height: 36px;
      background: var(--gradient-cta);
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display);
      font-weight: var(--font-weight-bold);
      font-size: 0.875rem;
      color: white;
      letter-spacing: 0.05em;
      flex-shrink: 0;
    }

    .logo-text {
      font-family: var(--font-display);
      font-size: var(--text-title-sm);
      font-weight: var(--font-weight-bold);
      color: var(--color-sidebar-text);
      letter-spacing: -0.01em;
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
      font-size: 1rem;
      width: 20px;
      text-align: center;
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
}
