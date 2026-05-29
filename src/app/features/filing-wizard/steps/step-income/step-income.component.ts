import { Component, input, output, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FilingService } from '../../../../core/services/filing.service';
import { FxService } from '../../../../core/services/fx.service';
import { IncomeEntry, IncomeType } from '../../../../core/models';
import { NairaPipe } from '../../../../shared/pipes/naira.pipe';
import { FileDropzoneComponent } from '../../../../shared/components/file-dropzone/file-dropzone.component';
import { NumericFormatDirective } from '../../../../shared/directives/numeric-format.directive';
import { LucideAngularModule } from 'lucide-angular';
import { HelpTooltipComponent } from '../../../../shared/components/help-tooltip/help-tooltip.component';

const INCOME_TYPES: { value: IncomeType; label: string }[] = [
  { value: 'employment',          label: 'Employment (salary, bonuses, BIK)' },
  { value: 'business',            label: 'Business / Trade Income' },
  { value: 'rental',              label: 'Rental Income' },
  { value: 'dividend',            label: 'Dividend Income' },
  { value: 'interest',            label: 'Interest Income (incl. FX differences)' },
  { value: 'capital_gain_shares', label: 'Capital Gains (Nigerian Company Shares)' },
  { value: 'digital_asset',       label: 'Digital / Virtual Asset Gains' },
  { value: 'royalty',             label: 'Royalties' },
  { value: 'prize',               label: 'Prizes, Winnings, Honoraria, Grants' },
  { value: 'other',               label: 'Other Income' },
];

const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'CHF', 'JPY', 'CNY', 'ZAR', 'GHS'];

@Component({
  selector: 'lf-step-income',
  standalone: true,
  imports: [FormsModule, NairaPipe, FileDropzoneComponent, NumericFormatDirective,
    LucideAngularModule, HelpTooltipComponent],
  template: `
    <div class="step-page">
      <div class="step-page__header">
        <h2 class="headline-sm">Income Sources</h2>
        <p class="body-md text-muted">Enter all income received during the year of assessment.</p>
      </div>

      <!-- Entries list -->
      <div class="entries-list">
        @for (entry of entries(); track entry.id; let i = $index) {
          <div class="entry-card">
            <div class="entry-card__header">
              <span class="entry-card__type">{{ labelFor(entry.incomeType) }}</span>
              <button class="btn btn--danger btn--sm" (click)="removeEntry(entry.id)">Remove</button>
            </div>

            <div class="entry-grid">
              <div class="form-group">
                <label class="form-label">Income Type<lf-help text="Select the category that best describes this income source. Each type may be subject to different NTA 2025 rules."></lf-help></label>
                <select class="form-input" [(ngModel)]="entry.incomeType"
                  [name]="'type_' + i" (change)="onTypeChange(entry)">
                  @for (t of incomeTypes; track t.value) {
                    <option [value]="t.value">{{ t.label }}</option>
                  }
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Description</label>
                <input type="text" class="form-input" [(ngModel)]="entry.description"
                  [name]="'desc_' + i" placeholder="e.g. Employer name, client, source" />
              </div>
            </div>

            <!-- Foreign currency toggle -->
            <div class="entry-row">
              <label class="toggle-label">
                <input type="checkbox" [(ngModel)]="entry.isForeign" [name]="'foreign_' + i"
                  (change)="onForeignToggle(entry)" />
                <span>Foreign Currency Income<lf-help text="Income earned in a foreign currency must be converted to Naira at the CBN official rate on the date of receipt (NTA 2025, s.20(4))."></lf-help></span>
              </label>
            </div>

            @if (!entry.isForeign) {
              <div class="form-group">
                <label class="form-label">Amount (₦ NGN)</label>
                <input type="number" class="form-input" [(ngModel)]="entry.grossAmountNgn"
                  [name]="'amount_' + i" min="0" placeholder="0.00" />
              </div>
            }

            @if (entry.isForeign) {
              <!-- Foreign income fields -->
              <div class="alert alert--info" style="margin:var(--space-3) 0">
                <span class="alert__icon">ℹ</span>
                <div class="alert__content">
                  <strong>Section 20(4) NTA 2025</strong> requires conversion at the CBN official rate.
                  The rate fetched below is a market-rate proxy. Enter the CBN official rate in the
                  override field for full compliance.
                  <a href="https://cbn.gov.ng" target="_blank" style="color:inherit;text-decoration:underline">
                    Check the CBN website ↗
                  </a>
                </div>
              </div>

              <div class="entry-grid">
                <div class="form-group">
                  <label class="form-label">Currency</label>
                  <select class="form-input" [(ngModel)]="entry.foreignCurrency" [name]="'cur_' + i"
                    (change)="fetchRate(entry)">
                    @for (c of currencies; track c) { <option [value]="c">{{ c }}</option> }
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Foreign Amount</label>
                  <input type="number" class="form-input" [(ngModel)]="entry.foreignAmount"
                    [name]="'famount_' + i" min="0" placeholder="0.00" />
                </div>
                <div class="form-group">
                  <label class="form-label">Date of Receipt</label>
                  <input type="date" class="form-input" [(ngModel)]="entry.incomeDate"
                    [name]="'date_' + i" (change)="fetchRate(entry)" />
                </div>
              </div>

              <div class="entry-grid">
                <div class="form-group">
                  <label class="form-label">Fetched Rate ({{ entry.foreignCurrency }}/NGN)
                    @if (fetchingRate[entry.id]) {
                      <span class="badge badge--draft" style="margin-left:4px">fetching…</span>
                    } @else if (entry.fxRateSource) {
                      <span class="badge badge--draft" style="margin-left:4px">
                        {{ entry.fxRateSource }}{{ liveRateEntries.has(entry.id) ? ' · live' : '' }}
                      </span>
                    }
                  </label>
                  <input type="text" class="form-input"
                    [value]="entry.fxRateFetched != null ? entry.fxRateFetched.toFixed(4) : ''"
                    [name]="'frate_' + i" readonly style="opacity:0.7" />
                </div>
                <div class="form-group">
                  <label class="form-label">CBN Override Rate <span class="text-muted">(optional)</span></label>
                  <input type="number" class="form-input" [(ngModel)]="entry.fxRateCbnOverride"
                    [name]="'cbnrate_' + i" placeholder="Enter CBN rate"
                    [numericFormatDecimals]="4"
                    (change)="applyRate(entry)" />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Naira Equivalent (auto-calculated)</label>
                <input type="text" class="form-input"
                  [value]="entry.grossAmountNgn | naira:false" readonly style="opacity:0.7;background:var(--color-surface-container)" />
              </div>

              <div class="form-group">
                <label class="form-label">Foreign Tax Paid (₦ equivalent, optional)<lf-help text="Tax withheld or paid in the country of source. Recorded for reference; formal double-taxation treaty relief requires a tax advisor."></lf-help></label>
                <input type="number" class="form-input" [(ngModel)]="entry.foreignTaxPaidNgn"
                  [name]="'ftax_' + i" min="0" placeholder="0.00" />
                <span class="form-hint">
                  Foreign tax paid is recorded for reference only in v1. Formal treaty relief requires a tax advisor.
                </span>
              </div>
            }

            <!-- CGT fields for share gains -->
            @if (entry.incomeType === 'capital_gain_shares') {
              <div class="entry-grid">
                <div class="form-group">
                  <label class="form-label">Disposal Proceeds (₦)<lf-help text="The full sale price received. CGT exemption applies if total proceeds are below ₦150,000,000 (NTA 2025, s.56)."></lf-help></label>
                  <input type="number" class="form-input" [(ngModel)]="entry.cgtProceeds"
                    [name]="'proceeds_' + i" min="0" />
                </div>
                <div class="form-group">
                  <label class="form-label">Gain Amount (₦)<lf-help text="Proceeds minus allowable cost of acquisition. CGT exemption also requires the gain to be ≤ ₦10,000,000."></lf-help></label>
                  <input type="number" class="form-input" [(ngModel)]="entry.cgtGain"
                    [name]="'gain_' + i" min="0" />
                </div>
              </div>
              @if (isCgtExempt(entry)) {
                <div class="alert alert--success">
                  <span class="alert__icon"><lucide-icon name="check" [size]="16" [strokeWidth]="2.5"></lucide-icon></span>
                  <div class="alert__content">CGT Exemption applies — proceeds &lt; ₦150M and gain ≤ ₦10M. This entry will be excluded from chargeable income.</div>
                </div>
              }
            }

            <!-- BIK for employment -->
            @if (entry.incomeType === 'employment') {
              <div class="form-hint" style="padding:var(--space-3);background:var(--color-surface-container-low);border-radius:var(--radius-md)">
                <lucide-icon name="info" [size]="14" [strokeWidth]="2" style="vertical-align:middle;margin-right:4px"></lucide-icon> Benefits-in-kind are taxable at <strong>5% of the cost</strong> of the benefit (NTA 2025).
                Include the assessed BIK value in the amount above.
              </div>
            }

            <!-- Document attach -->
            <div style="margin-top:var(--space-3)">
              <label class="form-label" style="margin-bottom:var(--space-2)">Supporting Documents</label>
              <lf-file-dropzone (fileSelected)="onFileSelected($event, entry)" />
              @if (entry.documents.length) {
                <ul class="doc-list">
                  @for (doc of entry.documents; track doc.id) {
                    <li class="doc-list__item">
                      <span style="display:flex;align-items:center;gap:4px"><lucide-icon name="paperclip" [size]="13" [strokeWidth]="2"></lucide-icon> {{ doc.fileName }}</span>
                    </li>
                  }
                </ul>
              }
            </div>
          </div>
        }
      </div>

      <!-- Add entry -->
      <button class="btn btn--secondary" (click)="addEntry()" style="align-self:flex-start">
        + Add Income Source
      </button>

      <!-- Total -->
      @if (totalNgn() > 0) {
        <div class="step-total">
          <span class="step-total__label">Total Gross Income (NGN)</span>
          <span class="step-total__value headline-sm">{{ totalNgn() | naira }}</span>
        </div>
      }

      <!-- Navigation -->
      <div class="step-nav">
        <div></div>
        <button class="btn btn--primary btn--lg" (click)="saveAndNext()" [disabled]="saving()">
          @if (saving()) { Saving… } @else { Save & Continue → }
        </button>
      </div>
    </div>
  `,
  styles: [`
    .step-page {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
    }

    .step-page__header { display: flex; flex-direction: column; gap: var(--space-2); }

    .entries-list { display: flex; flex-direction: column; gap: var(--space-4); }

    .entry-card {
      background: var(--color-surface-container-lowest);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-card);
      padding: var(--space-6);
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .entry-card__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .entry-card__type {
      font-size: var(--text-label-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-primary);
    }

    .entry-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-4);
    }

    .entry-row { display: flex; align-items: center; gap: var(--space-3); }

    .toggle-label {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-body-md);
      cursor: pointer;
    }

    .doc-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      margin-top: var(--space-2);
    }

    .doc-list__item {
      font-size: var(--text-label-md);
      color: var(--color-on-surface-variant);
      padding: var(--space-1) var(--space-2);
    }

    .step-total {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4) var(--space-6);
      background: var(--color-surface-container-low);
      border-radius: var(--radius-lg);
    }
    .step-total__label { font-size: var(--text-label-lg); color: var(--color-on-surface-variant); }
    .step-total__value { color: var(--color-primary); }

    .step-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: var(--space-4);
      border-top: 1px solid var(--color-surface-container);
    }
  `],
})
export class StepIncomeComponent implements OnInit {
  filingId = input.required<string>();
  next = output<void>();

  private filingService = inject(FilingService);
  private fxService = inject(FxService);

  entries = signal<IncomeEntry[]>([]);
  saving = signal(false);

  readonly incomeTypes = INCOME_TYPES;
  readonly currencies = CURRENCIES;

  async ngOnInit(): Promise<void> {
    const existing = await this.filingService.listIncomeEntries(this.filingId());
    this.entries.set(existing);
  }

  labelFor(type: IncomeType): string {
    return INCOME_TYPES.find(t => t.value === type)?.label ?? type;
  }

  addEntry(): void {
    const newEntry: IncomeEntry = {
      id: crypto.randomUUID(),
      filingId: this.filingId(),
      incomeType: 'employment',
      grossAmountNgn: 0,
      isForeign: false,
      isCgtExempt: false,
      documents: [],
    };
    this.entries.update(e => [...e, newEntry]);
  }

  removeEntry(id: string): void {
    this.entries.update(e => e.filter(x => x.id !== id));
  }

  onTypeChange(entry: IncomeEntry): void {
    // Reset CGT fields if type changes away from capital_gain_shares
    if (entry.incomeType !== 'capital_gain_shares') {
      entry.cgtProceeds = undefined;
      entry.cgtGain = undefined;
    }
  }

  onForeignToggle(entry: IncomeEntry): void {
    if (!entry.isForeign) {
      entry.foreignCurrency = undefined;
      entry.foreignAmount = undefined;
      entry.fxRateFetched = undefined;
      entry.fxRateCbnOverride = undefined;
    } else {
      entry.foreignCurrency = 'USD';
      // Auto-fetch for today if date not yet filled; re-fetch if date already set
      this.fetchRate(entry);
    }
  }

  /** Key: entry id → true while a fetch is in-flight */
  fetchingRate: Record<string, boolean> = {};
  /** Entry ids whose displayed rate is live (no date of receipt supplied) */
  liveRateEntries = new Set<string>();

  async fetchRate(entry: IncomeEntry): Promise<void> {
    if (!entry.foreignCurrency) return;
    // Use the date of receipt if provided; fall back to today for a live indicative rate
    const isHistorical = !!entry.incomeDate;
    const dateStr = entry.incomeDate || new Date().toISOString().slice(0, 10);
    this.fetchingRate[entry.id] = true;
    try {
      const result = await this.fxService.resolveRate(entry.foreignCurrency, 'NGN', dateStr);
      if (result.rate) {
        entry.fxRateFetched = result.rate;
        entry.fxRateSource = result.source;
        if (isHistorical) this.liveRateEntries.delete(entry.id);
        else this.liveRateEntries.add(entry.id);
        this.applyRate(entry);
      }
    } catch (_) {
      // silently leave any previously fetched rate intact
    } finally {
      this.fetchingRate[entry.id] = false;
    }
  }

  applyRate(entry: IncomeEntry): void {
    const rate = entry.fxRateCbnOverride ?? entry.fxRateFetched;
    if (rate && entry.foreignAmount) {
      entry.grossAmountNgn = rate * entry.foreignAmount;
      entry.fxRateUsed = rate;
      entry.fxRateSource = entry.fxRateCbnOverride ? 'cbn_override' : (entry.fxRateSource ?? 'manual');
    }
  }

  isCgtExempt(entry: IncomeEntry): boolean {
    const proceeds = entry.cgtProceeds ?? 0;
    const gain = entry.cgtGain ?? 0;
    return proceeds < 150_000_000 && gain <= 10_000_000;
  }

  onFileSelected(file: { path: string; name: string; size: number; type: string }, entry: IncomeEntry): void {
    if (!file.path) {
      alert('Drag-and-drop is not yet supported. Please use the "Attach" button to pick a file.');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      alert('File exceeds the 100MB limit. Please attach a smaller file.');
      return;
    }
    // Mark with _pending so saveAndNext knows to call attach_document
    (entry as any)._pendingDocs = [
      ...((entry as any)._pendingDocs ?? []),
      { path: file.path, name: file.name, type: file.type, size: file.size },
    ];
    // Show it in the UI immediately (will get a real id after save)
    entry.documents = [...(entry.documents ?? []), {
      id: crypto.randomUUID(),
      parentEntryId: entry.id,
      parentEntryType: 'income_entry',
      filePath: file.path,
      fileName: file.name,
      fileType: file.type,
      fileSizeBytes: file.size,
      uploadedAt: new Date().toISOString(),
    }];
  }

  readonly totalNgn = () =>
    this.entries().reduce((sum, e) => sum + (e.grossAmountNgn ?? 0), 0);

  async saveAndNext(): Promise<void> {
    this.saving.set(true);
    try {
      for (const entry of this.entries()) {
        await this.filingService.upsertIncomeEntry({ ...entry, filingId: this.filingId() });
        const pending: { path: string; name: string; type: string; size: number }[] =
          (entry as any)._pendingDocs ?? [];
        for (const doc of pending) {
          try {
            await this.filingService.attachDocument(
              entry.id, 'income_entry', doc.path, doc.name, doc.type, doc.size,
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
