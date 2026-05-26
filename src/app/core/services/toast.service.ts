import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  action?: { label: string; fn: () => void };
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _counter = 0;
  readonly toasts = signal<Toast[]>([]);

  show(type: ToastType, message: string, action?: { label: string; fn: () => void }, duration = 4000): void {
    const id = ++this._counter;
    this.toasts.update(list => [...list, { id, type, message, action }]);
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
  }

  success(message: string, action?: { label: string; fn: () => void }): void {
    this.show('success', message, action);
  }

  error(message: string, action?: { label: string; fn: () => void }): void {
    this.show('error', message, action, 6000);
  }

  info(message: string, action?: { label: string; fn: () => void }): void {
    this.show('info', message, action);
  }

  warning(message: string, action?: { label: string; fn: () => void }): void {
    this.show('warning', message, action, 5000);
  }

  dismiss(id: number): void {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }
}
