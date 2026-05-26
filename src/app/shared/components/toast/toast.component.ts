import { Component, inject } from '@angular/core';
import { ToastService, Toast } from '../../../core/services/toast.service';

@Component({
  selector: 'lf-toast-outlet',
  standalone: true,
  template: `
    <div class="toast-outlet">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast toast--{{ toast.type }}" role="alert">
          <span class="toast__icon">
            @switch (toast.type) {
              @case ('success') { ✓ }
              @case ('error')   { ✕ }
              @case ('warning') { ⚠ }
              @case ('info')    { ℹ }
            }
          </span>
          <span class="toast__message">{{ toast.message }}</span>
          @if (toast.action) {
            <button class="toast__action" (click)="toast.action!.fn(); dismiss(toast.id)">
              {{ toast.action.label }}
            </button>
          }
          <button class="toast__close" (click)="dismiss(toast.id)" aria-label="Dismiss">✕</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-outlet {
      position: fixed; top: var(--space-5); right: var(--space-5);
      display: flex; flex-direction: column; gap: var(--space-2);
      z-index: 9999; pointer-events: none;
      width: 360px; max-width: calc(100vw - 2 * var(--space-5));
    }
    .toast {
      display: flex; align-items: center; gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-modal);
      font-size: var(--text-body-md);
      animation: toast-in 200ms ease;
      pointer-events: all;
      border-left: 3px solid transparent;
    }
    @keyframes toast-in {
      from { opacity: 0; transform: translateX(20px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .toast--success {
      background: var(--color-success-container);
      color: var(--color-on-surface);
      border-left-color: var(--color-success);
    }
    .toast--error {
      background: var(--color-error-container);
      color: var(--color-on-error-container);
      border-left-color: var(--color-error);
    }
    .toast--warning {
      background: var(--color-warning-container);
      color: var(--color-on-surface);
      border-left-color: var(--color-warning);
    }
    .toast--info {
      background: var(--color-info-container);
      color: var(--color-on-surface);
      border-left-color: var(--color-info);
    }
    .toast__icon {
      flex-shrink: 0; font-size: 1rem; font-weight: var(--font-weight-bold);
      width: 20px; text-align: center;
    }
    .toast__message { flex: 1; line-height: 1.4; }
    .toast__action {
      flex-shrink: 0; background: none; border: none;
      font-size: var(--text-label-md); font-weight: var(--font-weight-semibold);
      color: var(--color-primary); cursor: pointer; padding: 0;
      text-decoration: underline;
    }
    .toast__close {
      flex-shrink: 0; background: none; border: none;
      font-size: 0.75rem; cursor: pointer; opacity: 0.5;
      padding: 0 0 0 var(--space-2); line-height: 1;
      color: inherit;
    }
    .toast__close:hover { opacity: 1; }
  `],
})
export class ToastComponent {
  toastService = inject(ToastService);
  dismiss(id: number): void { this.toastService.dismiss(id); }
}
