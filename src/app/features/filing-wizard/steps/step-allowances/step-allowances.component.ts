import { Component, input, output, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FilingService } from '../../../../core/services/filing.service';
import { ConfigService } from '../../../../core/services/config.service';
import { CapitalAllowance, AssetType } from '../../../../core/models';
import { NairaPipe } from '../../../../shared/pipes/naira.pipe';
import { FileDropzoneComponent } from '../../../../shared/components/file-dropzone/file-dropzone.component';
import { NumericFormatDirective } from '../../../../shared/directives/numeric-format.directive';
import { LucideAngularModule, Paperclip } from 'lucide-angular';

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'computer_laptop',     label: 'Computer / Laptop' },
  { value: 'router_networking',   label: 'Router / Networking Equipment' },
  { value: 'monitor',             label: 'Monitor' },
  { value: 'keyboard_peripherals',label: 'Keyboard / Peripherals' },
  { value: 'camera_recording',    label: 'Camera / Recording Equipment' },
  { value: 'software_licence',    label: 'Software Licence' },
  { value: 'other',               label: 'Other' },
];

@Component({
  selector: 'lf-step-allowances',
  standalone: true,
  imports: [FormsModule, NairaPipe, FileDropzoneComponent, NumericFormatDirective,
    LucideAngularModule],
  template: `
    <div class="step-page">
      <div class="step-page__header">
        <h2 class="headline-sm">Capital Allowances</h2>
        <p class="body-md text-muted">
          Claim straight-line annual allowances on professional equipment used in your business.
          Only annual allowances are supported under NTA 2025 — no initial allowance.
        </p>
      </div>

      <div class="entries-list">
        @for (entry of entries(); track entry.id; let i = $index) {
          <div class="entry-card">
            <div class="entry-card__header">
              <span class="entry-card__type">{{ labelFor(entry.assetType) }}</span>
              <button class="btn btn--danger btn--sm" (click)="removeEntry(entry.id)">Remove</button>
            </div>

            <div class="entry-grid">
              <div class="form-group">
                <label class="form-label">Asset Type</label>
                <select class="form-input" [(ngModel)]="entry.assetType"
                  [name]="'atype_' + i" (change)="recalculate(entry)">
                  @for (t of assetTypes; track t.value) {
                    <option [value]="t.value">{{ t.label }}</option>
                  }
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Asset Description</label>
                <input type="text" class="form-input" [(ngModel)]="entry.assetDescription"
                  [name]="'adesc_' + i" placeholder="e.g. MacBook Pro 16-inch" />
              </div>
            </div>

            <div class="entry-grid">
              <div class="form-group">
                <label class="form-label">Cost (₦)</label>
                <input type="number" class="form-input" [(ngModel)]="entry.assetCost"
                  [name]="'acost_' + i" min="0" (change)="recalculate(entry)" />
              </div>
              <div class="form-group">
                <label class="form-label">Date of Acquisition</label>
                <input type="date" class="form-input" [(ngModel)]="entry.acquisitionDate"
                  [name]="'adate_' + i" />
              </div>
            </div>

            <div class="entry-grid">
              <div class="form-group">
                <label class="form-label">
                  Annual Allowance Rate
                  @if (rateFor(entry.assetType)) {
                    <span class="badge badge--draft" style="margin-left:4px">
                      {{ (rateFor(entry.assetType) * 100).toFixed(0) }}%
                    </span>
                  }
                </label>
                <input type="text" class="form-input"
                  [value]="(rateFor(entry.assetType) * 100).toFixed(0) + '%'"
                  [name]="'arate_' + i" readonly style="opacity:0.7" />
              </div>
              <div class="form-group">
                <label class="form-label">Annual Allowance Amount (₦)</label>
                <input type="text" class="form-input" [value]="entry.annualAllowanceAmount | naira:false"
                  [name]="'aamt_' + i" readonly style="opacity:0.7;background:var(--color-surface-container)" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Tax Written-Down Value (₦)</label>
              <input type="number" class="form-input" [(ngModel)]="entry.taxWrittenDownValue"
                [name]="'twdv_' + i" min="0"
                placeholder="Auto-populated from prior year if available" />
              <span class="form-hint">
                For new assets, enter the cost. For carried-forward assets, enter the closing WDV from the prior year's filing.
              </span>
            </div>

            <div style="margin-top:var(--space-2)">
              <label class="form-label" style="margin-bottom:var(--space-2)">Supporting Documents</label>
              <lf-file-dropzone label="Attach invoice or proof of purchase" (fileSelected)="onFileSelected($event, entry)" />
              @for (doc of entry.documents; track doc.id) {
                <div class="doc-chip" style="display:flex;align-items:center;gap:4px"><lucide-icon name="paperclip" [size]="13" [strokeWidth]="2"></lucide-icon> {{ doc.fileName }}</div>
              }
            </div>
          </div>
        }
      </div>

      <button class="btn btn--secondary" (click)="addEntry()" style="align-self:flex-start">
        + Add Asset
      </button>

      @if (totalAllowance() > 0) {
        <div class="computation-total">
          <div class="total-label">Total Capital Allowances Claimable</div>
          <div class="total-value">{{ totalAllowance() | naira }}</div>
        </div>
      }

      <div class="step-nav">
        <button class="btn btn--ghost btn--lg" (click)="back.emit()">← Back</button>
        <button class="btn btn--primary btn--lg" (click)="saveAndNext()" [disabled]="saving()">
          @if (saving()) { Saving… } @else { Save & Continue → }
        </button>
      </div>
    </div>
  `,
  styles: [`
    .step-page { display: flex; flex-direction: column; gap: var(--space-6); }
    .step-page__header { display: flex; flex-direction: column; gap: var(--space-2); }
    .entries-list { display: flex; flex-direction: column; gap: var(--space-4); }
    .entry-card {
      background: var(--color-surface-container-lowest);
      border-radius: var(--radius-xl); box-shadow: var(--shadow-card);
      padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-4);
    }
    .entry-card__header { display: flex; align-items: center; justify-content: space-between; }
    .entry-card__type { font-size: var(--text-label-lg); font-weight: var(--font-weight-semibold); color: var(--color-primary); }
    .entry-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
    .doc-chip { font-size: var(--text-label-sm); color: var(--color-on-surface-variant); padding: var(--space-1) var(--space-2); }
    .step-nav { display: flex; justify-content: space-between; align-items: center; padding-top: var(--space-4); border-top: 1px solid var(--color-surface-container); }
  `],
})
export class StepAllowancesComponent implements OnInit {
  filingId = input.required<string>();
  next = output<void>();
  back = output<void>();

  private filingService = inject(FilingService);
  private configService = inject(ConfigService);

  entries = signal<CapitalAllowance[]>([]);
  saving = signal(false);

  readonly assetTypes = ASSET_TYPES;

  async ngOnInit(): Promise<void> {
    const existing = await this.filingService.listAllowances(this.filingId());
    this.entries.set(existing);
  }

  labelFor(type: AssetType): string {
    return ASSET_TYPES.find(t => t.value === type)?.label ?? type;
  }

  rateFor(type: AssetType): number {
    const config = this.configService.activeConfig();
    return config?.allowanceRates?.[type] ?? 0.25;
  }

  addEntry(): void {
    const newEntry: CapitalAllowance = {
      id: crypto.randomUUID(),
      filingId: this.filingId(),
      assetType: 'computer_laptop',
      assetDescription: '',
      assetCost: 0,
      acquisitionDate: '',
      taxWrittenDownValue: 0,
      annualAllowanceRate: this.rateFor('computer_laptop'),
      annualAllowanceAmount: 0,
      documents: [],
    };
    this.entries.update(e => [...e, newEntry]);
  }

  removeEntry(id: string): void {
    this.entries.update(e => e.filter(x => x.id !== id));
  }

  recalculate(entry: CapitalAllowance): void {
    const rate = this.rateFor(entry.assetType);
    entry.annualAllowanceRate = rate;
    entry.annualAllowanceAmount = entry.assetCost * rate;
  }

  onFileSelected(file: { path: string; name: string; size: number; type: string }, entry: CapitalAllowance): void {
    entry.documents = [...(entry.documents ?? []), {
      id: crypto.randomUUID(),
      parentEntryId: entry.id,
      parentEntryType: 'capital_allowance',
      filePath: file.path,
      fileName: file.name,
      fileType: file.type,
      fileSizeBytes: file.size,
      uploadedAt: new Date().toISOString(),
    }];
  }

  readonly totalAllowance = () =>
    this.entries().reduce((s, e) => s + (e.annualAllowanceAmount ?? 0), 0);

  async saveAndNext(): Promise<void> {
    this.saving.set(true);
    try {
      for (const entry of this.entries()) {
        await this.filingService.upsertAllowance({ ...entry, filingId: this.filingId() });
        const pending: Array<{ path: string; name: string; type: string; size: number }> =
          (entry as any)._pendingDocs ?? [];
        for (const doc of pending) {
          try {
            await this.filingService.attachDocument(
              entry.id, 'capital_allowance', doc.path, doc.name, doc.type, doc.size,
            );
          } catch (err) {
            console.error('Failed to attach document:', doc.name, err);
            alert(`Could not attach "${doc.name}": ${err}`);
          }
        }
        (entry as any)._pendingDocs = [];
      }
      this.next.emit();
    } finally {
      this.saving.set(false);
    }
  }
}
