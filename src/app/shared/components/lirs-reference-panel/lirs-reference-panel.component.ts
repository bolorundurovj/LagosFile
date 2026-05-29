import { Component, input, output, signal } from '@angular/core';
import { LIRSFieldGroup } from '../../../core/models';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'lf-lirs-reference-panel',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    @if (visible()) {
      <div class="lirs-overlay" (click)="closePanel.emit()">
        <aside class="lirs-panel" (click)="$event.stopPropagation()">
          <div class="lirs-panel__header">
            <div>
              <h3 class="title-md">Reference Panel</h3>
              <p class="body-sm text-muted">
                Copy these values into the LIRS Form A fields on the e-Tax portal.
              </p>
            </div>
            <button class="btn btn--ghost btn--sm icon-btn" (click)="closePanel.emit()">
              <lucide-icon name="x" [size]="18" [strokeWidth]="2"></lucide-icon>
            </button>
          </div>

          @if (statusMessage()) {
            <div class="lirs-panel__status">
              {{ statusMessage() }}
            </div>
          }

          <div class="lirs-panel__body">
            @for (group of fieldGroups(); track group.section) {
              <section class="lirs-group">
                <h4 class="lirs-group__title">{{ group.section }}</h4>
                <div class="lirs-group__fields">
                  @for (field of group.fields; track field.label) {
                    <div class="lirs-field">
                      <div class="lirs-field__info">
                        <div class="lirs-field__label">{{ field.label }}</div>
                        @if (field.description) {
                          <div class="lirs-field__desc">{{ field.description }}</div>
                        }
                      </div>
                      <div class="lirs-field__actions">
                        <span class="lirs-field__value">{{ field.value }}</span>
                        @if (field.copyText) {
                          <button
                            class="btn btn--ghost btn--sm lirs-copy-btn"
                            [class.copied]="lastCopied() === field.label"
                            (click)="copyText(field.copyText, field.label)"
                          >
                            <lucide-icon
                              [name]="lastCopied() === field.label ? 'clipboard-list' : 'copy'"
                              [size]="14"
                              [strokeWidth]="2"
                            ></lucide-icon>
                          </button>
                        }
                      </div>
                    </div>
                  }
                </div>
              </section>
            }
          </div>

          <div class="lirs-panel__footer">
            <button class="btn btn--secondary flex-1" (click)="closePanel.emit()">Close Panel</button>
            @if (showMarkSubmitted()) {
              <button class="btn btn--primary flex-1" (click)="markSubmitted.emit()">
                Mark as Submitted
              </button>
            }
          </div>
        </aside>
      </div>
    }
  `,
  styles: [`
    .lirs-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(0, 0, 0, 0.4);
      display: flex;
      justify-content: flex-end;
    }

    .lirs-panel {
      width: 440px;
      max-width: 90vw;
      height: 100%;
      background: var(--color-surface);
      box-shadow: var(--shadow-elevated);
      display: flex;
      flex-direction: column;
      animation: slideInRight 0.25s ease-out;
    }

    @keyframes slideInRight {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    .lirs-panel__header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: var(--space-5) var(--space-5) var(--space-3);
      border-bottom: 1px solid var(--color-surface-container);
    }

    .lirs-panel__status {
      margin: var(--space-3) var(--space-5);
      padding: var(--space-3) var(--space-4);
      background: var(--color-success-container, #d7f3d7);
      color: var(--color-on-success-container, #1b5e20);
      border-radius: var(--radius-lg);
      font-size: var(--text-body-sm);
      font-weight: var(--font-weight-medium);
    }

    .lirs-panel__body {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-3) var(--space-5);
    }

    .lirs-group {
      margin-bottom: var(--space-5);
    }

    .lirs-group__title {
      font-size: var(--text-label-md);
      font-weight: var(--font-weight-semibold);
      color: var(--color-on-surface-variant);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding-bottom: var(--space-2);
      border-bottom: 1px solid var(--color-surface-container);
      margin-bottom: var(--space-2);
    }

    .lirs-group__fields {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .lirs-field {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-2) 0;
      min-height: 36px;
    }

    .lirs-field__info {
      flex: 1;
      min-width: 0;
      margin-right: var(--space-2);
    }

    .lirs-field__label {
      font-size: var(--text-body-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-on-surface);
    }

    .lirs-field__desc {
      font-size: var(--text-label-sm);
      color: var(--color-on-surface-variant);
      margin-top: 1px;
    }

    .lirs-field__actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-shrink: 0;
    }

    .lirs-field__value {
      font-size: var(--text-body-sm);
      color: var(--color-on-surface-variant);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .lirs-copy-btn {
      opacity: 0.5;
      transition: opacity var(--transition-fast);
      padding: var(--space-1);
      min-width: auto;
      height: auto;
    }

    .lirs-copy-btn:hover { opacity: 1; }
    .lirs-copy-btn.copied {
      opacity: 1;
      color: var(--color-success);
    }

    .lirs-panel__footer {
      display: flex;
      gap: var(--space-3);
      padding: var(--space-4) var(--space-5);
      border-top: 1px solid var(--color-surface-container);
    }

    .icon-btn {
      padding: var(--space-1);
      min-width: auto;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `],
})
export class LIRSReferencePanelComponent {
  visible = input<boolean>(false);
  fieldGroups = input<LIRSFieldGroup[]>([]);
  statusMessage = input<string>('');
  showMarkSubmitted = input<boolean>(false);

  closePanel = output<void>();
  markSubmitted = output<void>();

  lastCopied = signal('');

  copyText(text: string, label: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.lastCopied.set(label);
      setTimeout(() => this.lastCopied.set(''), 1500);
    }).catch(() => { /* clipboard unavailable */ });
  }
}
