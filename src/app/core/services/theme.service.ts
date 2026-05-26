import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'light' | 'dark' | 'system';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'lf-theme';

  /** Current user preference */
  theme = signal<Theme>('system');

  /** True when the resolved appearance is dark */
  isDark = signal(false);

  constructor() {
    const saved = localStorage.getItem(this.STORAGE_KEY) as Theme | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      this.theme.set(saved);
    }

    // Re-apply whenever the signal changes
    effect(() => this._apply(this.theme()));

    // Track system preference changes
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => {
        if (this.theme() === 'system') this._apply('system');
      });
  }

  setTheme(theme: Theme): void {
    this.theme.set(theme);
    localStorage.setItem(this.STORAGE_KEY, theme);
  }

  private _apply(theme: Theme): void {
    const dark =
      theme === 'dark' ||
      (theme === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);

    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    this.isDark.set(dark);
  }
}
