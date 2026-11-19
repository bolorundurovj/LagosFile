import { Component, input, output, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FilingService } from '../../../../core/services/filing.service';
import { FxService } from '../../../../core/services/fx.service';
import { ConfigService } from '../../../../core/services/config.service';
import { ToastService } from '../../../../core/services/toast.service';
import { BikCategory, IncomeEntry, IncomeType } from '../../../../core/models';
import { NairaPipe } from '../../../../shared/pipes/naira.pipe';
import { FileDropzoneComponent } from '../../../../shared/components/file-dropzone/file-dropzone.component';
import { NumericFormatDirective } from '../../../../shared/directives/numeric-format.directive';
import { LucideAngularModule } from 'lucide-angular';
import { HelpTooltipComponent } from '../../../../shared/components/help-tooltip/help-tooltip.component';
import { DropzoneFile } from '../../../../shared/components/file-dropzone/file-dropzone.component';
import { queueDocument, flushDocuments } from '../pending-documents';

const INCOME_TYPES: { value: IncomeType; label: string }[] = [
  { value: 'employment',          label: 'Employment (salary & bonuses)' },
  { value: 'benefits_in_kind',    label: 'Benefits-in-Kind (employer-provided benefits)' },
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

const BIK_CATEGORIES: { value: BikCategory; label: string; costLabel: string }[] = [
  {
    value: 'employer_owned_asset',
    label: 'Employer-Owned Asset (5% of cost — s.14(1)(a))',
    costLabel: 'Asset Cost to Employer (₦)',
  },
  {
    value: 'rented_asset',
    label: 'Rented / Hired Asset (100% of annual rent — s.14(1)(b))',
    costLabel: 'Annual Rent / Hire Paid by Employer (₦)',
  },
  {
    value: 'accommodation',
    label: 'Employer-Provided Accommodation (capped at 20% of employment income — s.14(6))',
    costLabel: 'Annual Rental Value of Accommodation (₦)',
  },
  {
    value: 'other',
    label: 'Other Benefit-in-Kind (100% of cost — s.14(1)(c))',
    costLabel: 'Employer Cost of Benefit (₦)',
  },
];

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

            <!-- Foreign currency toggle (hidden for Benefits-in-Kind) -->
            @if (entry.incomeType !== 'benefits_in_kind') {
              <div class="entry-row">
                <label class="toggle-label">
                  <input type="checkbox" [(ngModel)]="entry.isForeign" [name]="'foreign_' + i"
                    (change)="onForeignToggle(entry)" />
                  <span>Foreign Currency Income<lf-help text="Income earned in a foreign currency must be converted to Naira at the CBN official rate on the date of receipt (NTA 2025, s.20(4))."></lf-help></span>
                </label>
              </div>
            }

            @if (!entry.isForeign && entry.incomeType !== 'benefits_in_kind' && entry.incomeType !== 'capital_gain_shares') {
              <div class="form-group">
                <label class="form-label">Amount (₦ NGN)</label>
                <input type="number" class="form-input" [(ngModel)]="entry.grossAmountNgn"
                  [name]="'amount_' + i" min="0" placeholder="0.00" />
              </div>
            }

            @if (entry.isForeign && entry.incomeType !== 'benefits_in_kind') {
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
                    [name]="'famount_' + i" min="0" placeholder="0.00"
                    (ngModelChange)="applyRate(entry)" />
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
                    (ngModelChange)="applyRate(entry)"
                    (change)="applyRate(entry)" />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Naira Equivalent (auto-calculated)</label>
                <input type="text" class="form-input"
                  [value]="entry.grossAmountNgn | naira:false" readonly style="opacity:0.7;background:var(--color-surface-container)" />
              </div>

              <div class="form-group">
                <label class="form-label">Foreign Tax Paid (₦ equivalent, optional)<lf-help text="Tax withheld or paid in the country of source on this foreign income. Credited up to the Nigerian tax attributable to this entry."></lf-help></label>
                <input type="number" class="form-input" [(ngModel)]="entry.foreignTaxPaidNgn"
                  [name]="'ftax_' + i" min="0" placeholder="0.00" />
                <span class="form-hint">
                  Credited up to the Nigerian tax attributable to this income entry. Attach foreign tax proof below.
                </span>
              </div>
            }

            <!-- CGT fields for share gains -->
            @if (entry.incomeType === 'capital_gain_shares') {
              <div class="entry-grid">
                <div class="form-group">
                  <label class="form-label">Disposal Proceeds (₦)<lf-help text="The full sale price received. CGT exemption applies if total proceeds are below ₦150,000,000 (NTA 2025, s.34(1)(a))."></lf-help></label>
                  <input type="number" class="form-input" [(ngModel)]="entry.cgtProceeds"
                    [name]="'proceeds_' + i" min="0" />
                </div>
                <div class="form-group">
                  <label class="form-label">Gain Amount (₦)<lf-help text="Proceeds minus allowable cost of acquisition. Taxable share gains are taxed on this gain amount; exempt if proceeds < ₦150m and gain ≤ ₦10m."></lf-help></label>
                  <input type="number" class="form-input" [(ngModel)]="entry.cgtGain"
                    [name]="'gain_' + i" min="0"
                    (ngModelChange)="onCgtGainChange(entry)" />
                </div>
              </div>
              @if (cgtSummary().exempt) {
                <div class="alert alert--success">
                  <span class="alert__icon"><lucide-icon name="check" [size]="16" [strokeWidth]="2.5"></lucide-icon></span>
                  <div class="alert__content">CGT exemption applies: total proceeds this year ({{ cgtSummary().proceeds | naira }}) are below {{ cgtSummary().proceedsLimit | naira }} and total gains ({{ cgtSummary().gain | naira }}) do not exceed {{ cgtSummary().gainLimit | naira }}. Share gains will be excluded from chargeable income.</div>
                </div>
              } @else {
                <div class="alert alert--warning">
                  <span class="alert__icon">!</span>
                  <div class="alert__content">CGT exemption does not apply: the limits are tested on all share disposals within 12 consecutive months, and this year's totals are {{ cgtSummary().proceeds | naira }} proceeds and {{ cgtSummary().gain | naira }} gains. Share gains will be taxed.</div>
                </div>
              }
            }

            <!-- BIK valuation per NTA 2025 s.14 -->
            @if (entry.incomeType === 'benefits_in_kind') {
              <div class="bik-section">
                <div class="alert alert--info" style="margin-bottom:var(--space-3)">
                  <span class="alert__icon">ℹ</span>
                  <div class="alert__content">
                    Under <strong>NTA 2025 s.14</strong>, benefits-in-kind are valued by category:
                    <strong>5%</strong> of cost for employer-owned assets (s.14(1)(a)),
                    <strong>100%</strong> of annual rent for rented/hired assets (s.14(1)(b)),
                    annual rental value capped at <strong>20% of employment income</strong> for accommodation (s.14(6)),
                    and <strong>100%</strong> of cost for other benefits (s.14(1)(c)).
                  </div>
                </div>
                <div class="entry-grid">
                  <div class="form-group">
                    <label class="form-label">BIK Category<lf-help text="Select how the benefit was provided by your employer so the tax engine applies the right NTA 2025 s.14 valuation rule."></lf-help></label>
                    <select class="form-input" [(ngModel)]="entry.bikCategory"
                      [name]="'bikcat_' + i" (ngModelChange)="onBikChange(entry)">
                      @for (cat of bikCategories; track cat.value) {
                        <option [value]="cat.value">{{ cat.label }}</option>
                      }
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">{{ bikCostLabel(entry.bikCategory) }}<lf-help text="Saved with this entry and used by the tax computation engine to value the taxable benefit."></lf-help></label>
                    <input type="number" class="form-input"
                      [(ngModel)]="entry.bikCost"
                      (ngModelChange)="onBikChange(entry)"
                      [name]="'bikcost_' + i"
                      min="0" placeholder="0.00" />
                  </div>
                </div>
                @if ((entry.bikCost ?? 0) > 0) {
                  <div class="bik-computed">
                    <span class="bik-computed__label">{{ bikFormulaHint(entry) }}</span>
                    <span class="bik-computed__value">= <strong>{{ estimatedBikValue(entry) | naira }}</strong></span>
                  </div>
                }
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
    .bik-section { display: flex; flex-direction: column; gap: var(--space-3); }
    .bik-computed {
      display: flex; align-items: center; justify-content: space-between;
      padding: var(--space-3) var(--space-4);
      background: var(--color-surface-container-low);
      border-radius: var(--radius-md);
      font-size: var(--text-label-lg);
    }
    .bik-computed__label { color: var(--color-on-surface-variant); }
    .bik-computed__value { color: var(--color-primary); }
  `],
})
export class StepIncomeComponent implements OnInit {
  filingId = input.required<string>();
  next = output<void>();

  private filingService = inject(FilingService);
  private fxService = inject(FxService);
  private configService = inject(ConfigService);
  private toast = inject(ToastService);
  private removedIds: string[] = [];

  entries = signal<IncomeEntry[]>([]);
  saving = signal(false);

  readonly incomeTypes = INCOME_TYPES;
  readonly currencies = CURRENCIES;
  readonly bikCategories = BIK_CATEGORIES;

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
    this.removedIds.push(id);
    this.entries.update(e => e.filter(x => x.id !== id));
  }

  onTypeChange(entry: IncomeEntry): void {
    // Reset CGT fields if type changes away from capital_gain_shares
    if (entry.incomeType !== 'capital_gain_shares') {
      entry.cgtProceeds = undefined;
      entry.cgtGain = undefined;
    } else {
      entry.grossAmountNgn = entry.cgtGain ?? 0;
    }
    // Reset BIK fields if type changes away from benefits_in_kind; clear foreign fields if switching to BIK
    if (entry.incomeType !== 'benefits_in_kind') {
      entry.bikCategory = undefined;
      entry.bikCost = undefined;
    } else {
      entry.isForeign = false;
      entry.foreignCurrency = undefined;
      entry.foreignAmount = undefined;
      entry.fxRateFetched = undefined;
      entry.fxRateCbnOverride = undefined;
      entry.fxRateUsed = undefined;
      entry.fxRateSource = undefined;
      entry.foreignTaxPaidNgn = undefined;
      entry.bikCategory = entry.bikCategory ?? 'employer_owned_asset';
      entry.grossAmountNgn = this.estimatedBikValue(entry);
    }
  }

  onCgtGainChange(entry: IncomeEntry): void {
    if (entry.incomeType === 'capital_gain_shares') {
      entry.grossAmountNgn = entry.cgtGain ?? 0;
    }
  }

  bikCostLabel(cat?: BikCategory): string {
    return BIK_CATEGORIES.find(c => c.value === cat)?.costLabel ?? "Employer's Cost of Benefit (₦)";
  }

  /** Mirror of ComputationEngine::bik_taxable_value for live UI preview; backend engine is authoritative. */
  estimatedBikValue(entry: IncomeEntry): number {
    if (entry.incomeType !== 'benefits_in_kind') return entry.grossAmountNgn ?? 0;
    if (!entry.bikCategory || entry.bikCost == null) return Math.max(entry.grossAmountNgn ?? 0, 0);
    const cost = Math.max(entry.bikCost, 0);
    switch (entry.bikCategory) {
      case 'employer_owned_asset':
        return cost * 0.05;
      case 'rented_asset':
      case 'other':
        return cost;
      case 'accommodation': {
        const totalEmployment = this.entries()
          .filter(e => e.incomeType === 'employment')
          .reduce((sum, e) => sum + Math.max(e.grossAmountNgn ?? 0, 0), 0);
        return Math.min(cost, totalEmployment * 0.2);
      }
    }
  }

  bikFormulaHint(entry: IncomeEntry): string {
    switch (entry.bikCategory) {
      case 'employer_owned_asset':
        return 'Estimated Taxable BIK (5% of cost)';
      case 'rented_asset':
        return 'Estimated Taxable BIK (100% of annual rent)';
      case 'accommodation':
        return 'Estimated Taxable BIK (capped at 20% of employment income)';
      default:
        return 'Estimated Taxable BIK (100% of cost)';
    }
  }

  onBikChange(entry: IncomeEntry): void {
    entry.grossAmountNgn = this.estimatedBikValue(entry);
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
    } catch {
      // silently leave any previously fetched rate intact
    } finally {
      this.fetchingRate[entry.id] = false;
    }
  }

  applyRate(entry: IncomeEntry): void {
    if (!entry.isForeign) return;
    const override = entry.fxRateCbnOverride;
    const hasOverride = override != null && Number.isFinite(override) && override > 0;
    const rate = hasOverride ? override : entry.fxRateFetched;
    const amount = entry.foreignAmount;
    if (rate != null && Number.isFinite(rate) && amount != null && Number.isFinite(amount)) {
      entry.grossAmountNgn = rate * amount;
      entry.fxRateUsed = rate;
      entry.fxRateSource = hasOverride ? 'cbn_override' : (entry.fxRateSource ?? 'manual');
    } else if (amount === 0 || amount == null) {
      entry.grossAmountNgn = 0;
    }
  }

  /** Mirrors the engine: the exemption is tested on aggregate share disposals for the year. */
  cgtSummary(): { exempt: boolean; proceeds: number; gain: number; proceedsLimit: number; gainLimit: number } {
    const limits = this.configService.activeConfig()?.cgtThresholds;
    const proceedsLimit = limits?.proceedsThreshold ?? 150_000_000;
    const gainLimit = limits?.gainThreshold ?? 10_000_000;
    let proceeds = 0;
    let gain = 0;
    for (const e of this.entries()) {
      if (e.incomeType !== 'capital_gain_shares') continue;
      proceeds += e.cgtProceeds ?? 0;
      gain += e.cgtGain ?? 0;
    }
    return { exempt: proceeds < proceedsLimit && gain <= gainLimit, proceeds, gain, proceedsLimit, gainLimit };
  }

  onFileSelected(file: DropzoneFile, entry: IncomeEntry): void {
    const error = queueDocument(entry, file, 'income_entry');
    if (error) this.toast.error(error);
  }

  readonly totalNgn = () =>
    this.entries().reduce((sum, e) => {
      if (e.incomeType === 'benefits_in_kind') return sum + this.estimatedBikValue(e);
      return sum + (e.grossAmountNgn ?? 0);
    }, 0);

  async saveAndNext(): Promise<void> {
    this.saving.set(true);
    try {
      for (const id of this.removedIds) await this.filingService.deleteIncomeEntry(id);
      this.removedIds = [];
      const exempt = this.cgtSummary().exempt;
      const failed: string[] = [];
      for (const entry of this.entries()) {
        if (entry.incomeType === 'benefits_in_kind') {
          entry.isForeign = false;
          entry.grossAmountNgn = this.estimatedBikValue(entry);
        } else if (entry.isForeign) {
          this.applyRate(entry);
        }
        if (entry.incomeType === 'capital_gain_shares') {
          entry.grossAmountNgn = entry.cgtGain ?? 0;
          entry.isCgtExempt = exempt;
        }
        await this.filingService.upsertIncomeEntry({ ...entry, filingId: this.filingId() });
        failed.push(...await flushDocuments(this.filingService, entry, 'income_entry'));
      }
      if (failed.length) this.toast.error('Could not attach ' + failed.join('; '));
      this.next.emit();
    } catch (err) {
      this.toast.error('Could not save income: ' + String(err));
    } finally {
      this.saving.set(false);
    }
  }
}
