import { Component, input, signal, HostListener, ElementRef, inject } from '@angular/core';

@Component({
  selector: 'lf-help',
  standalone: true,
  template: `
    <span class="help-wrap">
      <button
        class="help-btn"
        type="button"
        [attr.aria-label]="'Help: ' + text()"
        (click)="toggle($event)"
        (mouseenter)="show()"
        (mouseleave)="scheduleHide()"
        (focus)="show()"
        (blur)="scheduleHide()"
      >?</button>
      @if (visible()) {
        <span
          class="help-popover"
          [class.help-popover--below]="direction() === 'below'"
          [class.help-popover--left]="align() === 'left'"
          (mouseenter)="cancelHide()"
          (mouseleave)="scheduleHide()"
        >{{ text() }}</span>
      }
    </span>
  `,
  styles: [`
    .help-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
      vertical-align: middle;
      margin-left: 5px;
    }

    .help-btn {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 1.5px solid var(--color-outline);
      background: transparent;
      color: var(--color-on-surface-variant);
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      flex-shrink: 0;
      transition: all var(--transition-fast);
    }

    .help-btn:hover,
    .help-btn:focus-visible {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: var(--color-on-primary);
      outline: none;
    }

    /* ── Popover — default: ABOVE ── */
    .help-popover {
      position: absolute;
      bottom: calc(100% + 8px);
      top: auto;
      left: 50%;
      transform: translateX(-50%);
      min-width: 220px;
      max-width: 300px;
      background: var(--color-on-surface);
      color: var(--color-surface);
      border-radius: var(--radius-md);
      padding: 8px 12px;
      font-size: var(--text-label-md);
      font-weight: 400;
      line-height: 1.5;
      white-space: normal;
      z-index: 200;
      box-shadow: var(--shadow-dropdown);
      pointer-events: auto;
    }

    /* Arrow pointing DOWN (below the popover, toward trigger) */
    .help-popover::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 5px solid transparent;
      border-top-color: var(--color-on-surface);
    }

    /* ── Flipped: BELOW ── */
    .help-popover--below {
      bottom: auto;
      top: calc(100% + 8px);
    }

    /* Arrow pointing UP (above the popover, toward trigger) */
    .help-popover--below::after {
      top: auto;
      bottom: 100%;
      border-top-color: transparent;
      border-bottom-color: var(--color-on-surface);
    }

    /* ── Left-aligned variant ── */
    .help-popover--left {
      left: auto;
      right: 0;
      transform: none;
    }

    .help-popover--left::after {
      left: auto;
      right: 8px;
      transform: none;
    }
  `],
})
export class HelpTooltipComponent {
  text  = input.required<string>();
  align = input<'center' | 'left'>('center');

  visible   = signal(false);
  direction = signal<'above' | 'below'>('above');

  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private el = inject(ElementRef);

  show(): void {
    this.cancelHide();
    this._measureDirection();
    this.visible.set(true);
  }

  scheduleHide(): void {
    this.hideTimer = setTimeout(() => this.visible.set(false), 120);
  }

  cancelHide(): void {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
  }

  toggle(e: Event): void {
    e.stopPropagation();
    if (!this.visible()) {
      this._measureDirection();
      this.visible.set(true);
    } else {
      this.visible.set(false);
    }
  }

  @HostListener('document:click')
  onDocClick(): void { this.visible.set(false); }

  private _measureDirection(): void {
    const btn = (this.el.nativeElement as HTMLElement).querySelector('.help-btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    // If less than 140px above the button, flip below
    this.direction.set(rect.top < 140 ? 'below' : 'above');
  }
}
