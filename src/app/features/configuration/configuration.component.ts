import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ConfigService } from '../../core/services/config.service';
import { FxService, FxCacheEntry } from '../../core/services/fx.service';
import { ToastService } from '../../core/services/toast.service';
import { TaxConfig, TaxBand } from '../../core/models';
import { NairaPipe } from '../../shared/pipes/naira.pipe';
import { LucideAngularModule } from 'lucide-angular';
import { HelpTooltipComponent } from '../../shared/components/help-tooltip/help-tooltip.component';

const NTA_SECTIONS: Record<string, string> = {
  bands: 'NTA 2025, Fourth Schedule — Tax Bands',
  rentReliefCap: 'NTA 2025, s.33(2) — Rent Relief Cap',
  rentReliefRate: 'NTA 2025, s.33(1) — Rent Relief Rate (20%)',
  cgtProceedsThreshold: 'NTA 2025, s.56 — CGT Exemption (Proceeds)',
  cgtGainThreshold: 'NTA 2025, s.56 — CGT Exemption (Gain)',
  minimumTaxRate: 'NTA 2025, s.43 — Minimum Tax Rate',
};

@Component({
  selector: 'lf-configuration',
  standalone: true,
  imports: [FormsModule, NairaPipe, DatePipe, LucideAngularModule, HelpTooltipComponent],
  template: `
    <div class="config-page">
      <div class="config-page__header">
        <div>
          <h1 class="headline-md">Configuration</h1>
          @if (config()) {
            <p class="body-md text-muted mt-2">
              {{ config()!.versionLabel }} · Last modified: {{ config()!.lastModified | date:'dd MMM yyyy' }}
              by {{ config()!.modifiedBy }}
            </p>
          }
        </div>
        <div class="flex gap-3">
          <button class="btn btn--secondary" (click)="exportConfig()">Export JSON</button>
          <label class="btn btn--secondary">
            Import JSON
            <input type="file" accept=".json" style="display:none" (change)="importConfig($event)" />
          </label>
          <button class="btn btn--primary" (click)="save()" [disabled]="saving()">
            @if (saving()) { Saving… } @else { Save Configuration }
          </button>
        </div>
      </div>

      @if (saveSuccess()) {
        <div class="alert alert--success">
          <span class="alert__icon"><lucide-icon name="check" [size]="16" [strokeWidth]="2.5"></lucide-icon></span>
          <div class="alert__content">Configuration saved as a new version. All new filings will use this config.</div>
        </div>
      }
      @if (importError()) {
        <div class="alert alert--error">
          <span class="alert__icon"><lucide-icon name="alert-triangle" [size]="16" [strokeWidth]="2"></lucide-icon></span>
          <div class="alert__content">{{ importError() }}</div>
        </div>
      }

      @if (!config()) {
        <div class="skeleton" style="height:400px;border-radius:var(--radius-xl)"></div>
      } @else {
        <!-- Tax bands -->
        <div class="card">
          <div class="flex items-center justify-between" style="margin-bottom:var(--space-5)">
            <div>
              <h2 class="title-md">Tax Bands<lf-help text="Progressive rate schedule applied to chargeable income (NTA 2025, Fourth Schedule). Lower slices are taxed at lower rates. Do not modify unless LIRS publishes updated rates." align="left"></lf-help></h2>
              <div class="label-sm" style="margin-top:2px">{{ ntaSection('bands') }}</div>
            </div>
            <button class="btn btn--secondary btn--sm" (click)="addBand()">+ Add Band</button>
          </div>

          <table class="data-table">
            <thead>
              <tr>
                <th>Lower Threshold (₦)</th>
                <th>Upper Threshold (₦)</th>
                <th>Rate (%)</th>
                <th>Tax on Band</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (band of bands(); track $index; let i = $index) {
                <tr>
                  <td>
                    <input type="number" class="form-input" [(ngModel)]="band.lower"
                      [name]="'bl_' + i" min="0" style="width:160px" />
                  </td>
                  <td>
                    <input type="number" class="form-input"
                      [value]="band.upper ?? ''" [name]="'bu_' + i"
                      (change)="onUpperChange(band, $event)" min="0"
                      placeholder="Unlimited" style="width:160px" />
                  </td>
                  <td>
                    <input type="number" class="form-input" [(ngModel)]="band.rate"
                      [name]="'br_' + i" min="0" max="1" step="0.01" style="width:100px" />
                    <span style="margin-left:6px;font-size:var(--text-label-md);color:var(--color-on-surface-variant)">
                      {{ (band.rate * 100).toFixed(0) }}%
                    </span>
                  </td>
                  <td class="align-right financial-value text-muted" style="font-size:var(--text-label-md)">
                    {{ (band.upper != null ? (band.upper - band.lower) : 0) * band.rate | naira }}
                  </td>
                  <td>
                    <button class="btn btn--danger btn--sm" (click)="removeBand(i)">Remove</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Relief caps -->
        <div class="card">
          <h2 class="title-md" style="margin-bottom:var(--space-5)">Relief Caps<lf-help text="Statutory limits on relief amounts deductible under NTA 2025. Modify only if the law changes." align="left"></lf-help></h2>
          <div class="config-grid">
            <div class="config-row">
              <div class="config-row__info">
                <div class="config-row__label">Rent Relief Cap (₦)<lf-help text="Maximum Rent Relief claimable per annum. Set at ₦500,000 by NTA 2025, s.33(2)."></lf-help></div>
                <div class="config-row__section">{{ ntaSection('rentReliefCap') }}</div>
              </div>
              <input type="number" class="form-input config-row__input"
                [(ngModel)]="reliefCaps.rentReliefCap" name="rentCap" min="0" />
            </div>
            <div class="config-row">
              <div class="config-row__info">
                <div class="config-row__label">Rent Relief Rate<lf-help text="Fraction of annual rent deductible as Rent Relief. Fixed at 20% by NTA 2025, s.33(1)."></lf-help></div>
                <div class="config-row__section">{{ ntaSection('rentReliefRate') }}</div>
              </div>
              <div class="flex items-center gap-2">
                <input type="number" class="form-input config-row__input"
                  [(ngModel)]="reliefCaps.rentReliefRate" name="rentRate" min="0" max="1" step="0.01" />
                <span class="label-md">{{ (reliefCaps.rentReliefRate * 100).toFixed(0) }}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- CGT thresholds -->
        <div class="card">
          <h2 class="title-md" style="margin-bottom:var(--space-5)">CGT Exemption Thresholds<lf-help text="Capital gains are exempt from tax when BOTH conditions are met: total proceeds are below the proceeds threshold AND the gain does not exceed the gain threshold (NTA 2025, s.56)." align="left"></lf-help></h2>
          <div class="config-grid">
            <div class="config-row">
              <div class="config-row__info">
                <div class="config-row__label">Proceeds Threshold (₦)<lf-help text="If total disposal proceeds are below this amount (currently ₦150,000,000), the CGT exemption may apply — subject to the gain threshold also being met."></lf-help></div>
                <div class="config-row__section">{{ ntaSection('cgtProceedsThreshold') }}</div>
              </div>
              <input type="number" class="form-input config-row__input"
                [(ngModel)]="cgtThresholds.proceedsThreshold" name="cgtProceeds" min="0" />
            </div>
            <div class="config-row">
              <div class="config-row__info">
                <div class="config-row__label">Gain Threshold (₦)<lf-help text="If the capital gain does not exceed this amount (currently ₦10,000,000), the CGT exemption may apply — subject to the proceeds threshold also being met."></lf-help></div>
                <div class="config-row__section">{{ ntaSection('cgtGainThreshold') }}</div>
              </div>
              <input type="number" class="form-input config-row__input"
                [(ngModel)]="cgtThresholds.gainThreshold" name="cgtGain" min="0" />
            </div>
          </div>
        </div>

        <!-- Capital allowance rates -->
        <div class="card">
          <h2 class="title-md" style="margin-bottom:var(--space-5)">Annual Capital Allowance Rates<lf-help text="Straight-line depreciation rates per asset class under NTA 2025. Applied to the tax written-down value each year. No initial allowance is available." align="left"></lf-help></h2>
          <div class="config-grid">
            @for (kv of allowanceRateEntries(); track kv.key) {
              <div class="config-row">
                <div class="config-row__info">
                  <div class="config-row__label">{{ kv.label }}</div>
                </div>
                <div class="flex items-center gap-2">
                  <input type="number" class="form-input config-row__input"
                    [(ngModel)]="kv.rate" [name]="'ar_' + kv.key"
                    min="0" max="1" step="0.01"
                    (change)="onAllowanceRateChange(kv)" />
                  <span class="label-md">{{ (kv.rate * 100).toFixed(0) }}%</span>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Minimum tax rate -->
        <div class="card">
          <div class="config-row" style="padding:0">
            <div class="config-row__info">
              <div class="config-row__label">Minimum Tax Rate<lf-help text="If graduated tax falls below this percentage of gross income, the minimum tax applies instead (NTA 2025, s.43). Currently 1%. Applicability to individuals is unconfirmed — verify with LIRS."></lf-help></div>
              <div class="config-row__section">{{ ntaSection('minimumTaxRate') }}</div>
            </div>
            <div class="flex items-center gap-2">
              <input type="number" class="form-input config-row__input"
                [(ngModel)]="minimumTaxRate" name="minTax" min="0" max="1" step="0.001" />
              <span class="label-md">{{ (minimumTaxRate * 100).toFixed(1) }}%</span>
            </div>
          </div>
        </div>
        <!-- FX Rate Cache -->
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-2)">
            <h2 class="title-md">FX Rate Cache</h2>
            <button class="btn btn--ghost btn--sm" (click)="loadFxCache()" [disabled]="fxLoading()">Refresh</button>
          </div>
          <p class="body-sm text-muted" style="margin-bottom:var(--space-4)">
            Exchange rates fetched from live sources are cached locally to avoid repeat API calls.
            Entries expire after 24 hours. Clear the cache to force fresh lookups.
          </p>
          @if (fxLoading()) {
            <div class="skeleton" style="height:80px;border-radius:var(--radius-lg)"></div>
          } @else if (fxEntries().length === 0) {
            <div class="body-sm text-muted" style="padding:var(--space-4) 0">No cached rates. Rates are fetched when you enter foreign income in the filing wizard.</div>
          } @else {
            <table class="data-table" style="margin-bottom:var(--space-4)">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Rate</th>
                  <th>Rate Date</th>
                  <th>Source</th>
                  <th>Cached At</th>
                </tr>
              </thead>
              <tbody>
                @for (entry of fxEntries(); track entry.id) {
                  <tr>
                    <td><strong>{{ entry.baseCurrency }}/{{ entry.quoteCurrency }}</strong></td>
                    <td class="financial-value">{{ entry.rate.toFixed(4) }}</td>
                    <td class="text-muted" style="font-size:var(--text-label-sm)">{{ entry.rateDate }}</td>
                    <td><span class="badge badge--draft">{{ entry.source }}</span></td>
                    <td class="text-muted" style="font-size:var(--text-label-sm)">{{ entry.fetchedAt | date:'short' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
          <button class="btn btn--danger-outline" (click)="clearFxCache()" [disabled]="fxClearing() || fxEntries().length === 0">
            @if (fxClearing()) { Clearing… } @else { Clear All Cached Rates ({{ fxEntries().length }}) }
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .config-page { max-width: var(--content-max-width); margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-6); }
    .config-page__header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }

    .config-grid { display: flex; flex-direction: column; gap: var(--space-1); }
    .config-row {
      display: flex; align-items: center; justify-content: space-between; gap: var(--space-6);
      padding: var(--space-3) 0; border-bottom: 1px solid var(--color-surface-container);
    }
    .config-row__info { flex: 1; }
    .config-row__label { font-size: var(--text-body-md); font-weight: var(--font-weight-medium); }
    .config-row__section { font-size: var(--text-label-sm); color: var(--color-on-surface-variant); margin-top: 2px; }
    .config-row__input { width: 200px; flex-shrink: 0; }
    .btn--danger-outline {
      border: 1.5px solid var(--color-error); background: transparent;
      color: var(--color-error); padding: var(--space-2) var(--space-4);
      border-radius: var(--radius-md); font-size: var(--text-label-lg);
      font-weight: var(--font-weight-medium); cursor: pointer; transition: all var(--transition-base);
    }
    .btn--danger-outline:hover { background: var(--color-error-container); }
    .btn--danger-outline:disabled { opacity: 0.4; cursor: not-allowed; }
  `],
})
export class ConfigurationComponent implements OnInit {
  private configService = inject(ConfigService);
  private fxService = inject(FxService);
  private toast = inject(ToastService);

  config = signal<TaxConfig | null>(null);
  bands = signal<TaxBand[]>([]);
  reliefCaps = { rentReliefCap: 500_000, rentReliefRate: 0.20 };
  cgtThresholds = { proceedsThreshold: 150_000_000, gainThreshold: 10_000_000 };
  minimumTaxRate = 0.01;
  allowanceRateEntries = signal<{ key: string; label: string; rate: number }[]>([]);
  saving = signal(false);
  saveSuccess = signal(false);
  importError = signal('');
  fxEntries = signal<FxCacheEntry[]>([]);
  fxLoading = signal(false);
  fxClearing = signal(false);

  private readonly ASSET_LABELS: Record<string, string> = {
    computer_laptop: 'Computer / Laptop',
    router_networking: 'Router / Networking',
    monitor: 'Monitor',
    keyboard_peripherals: 'Keyboard / Peripherals',
    camera_recording: 'Camera / Recording',
    software_licence: 'Software Licence',
    other: 'Other',
  };

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const cfg = await this.configService.loadActive();
      this.populate(cfg);
    } catch { /* ignore */ }
  }

  private populate(cfg: TaxConfig): void {
    this.config.set(cfg);
    this.bands.set(cfg.bands.map(b => ({ ...b })));
    this.reliefCaps = { ...cfg.reliefCaps };
    this.cgtThresholds = { ...cfg.cgtThresholds };
    this.minimumTaxRate = cfg.minimumTaxRate;
    this.allowanceRateEntries.set(
      Object.entries(cfg.allowanceRates).map(([key, rate]) => ({
        key, rate, label: this.ASSET_LABELS[key] ?? key,
      }))
    );
  }

  ntaSection(key: string): string { return NTA_SECTIONS[key] ?? ''; }

  addBand(): void {
    this.bands.update(b => [...b, { lower: 0, upper: null, rate: 0 }]);
  }
  removeBand(i: number): void {
    this.bands.update(b => b.filter((_, idx) => idx !== i));
  }
  onUpperChange(band: TaxBand, e: Event): void {
    const val = (e.target as HTMLInputElement).value;
    band.upper = val ? Number(val) : null;
  }
  onAllowanceRateChange(kv: { key: string; rate: number }): void {
    this.allowanceRateEntries.update(entries =>
      entries.map(e => e.key === kv.key ? { ...e, rate: kv.rate } : e)
    );
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.saveSuccess.set(false);
    try {
      const rates = Object.fromEntries(this.allowanceRateEntries().map(e => [e.key, e.rate]));
      const cfg = await this.configService.save({
        versionLabel: `Tax Config — NTA 2025, effective 1 Jan 2026`,
        governedBy: 'NTA 2025',
        bands: this.bands(),
        reliefCaps: this.reliefCaps,
        cgtThresholds: this.cgtThresholds,
        allowanceRates: rates,
        minimumTaxRate: this.minimumTaxRate,
      });
      this.populate(cfg);
      this.saveSuccess.set(true);
      setTimeout(() => this.saveSuccess.set(false), 4000);
    } finally {
      this.saving.set(false);
    }
  }

  async exportConfig(): Promise<void> {
    const cfg = this.config();
    if (!cfg) return;
    await this.configService.exportJson(cfg.id);
  }

  async importConfig(e: Event): Promise<void> {
    this.importError.set('');
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const imported = JSON.parse(text);
      await this.configService.importJson(imported);
      await this.load();
    } catch (err: unknown) {
      this.importError.set(err instanceof Error ? err.message : String(err));
    }
  }

  async loadFxCache(): Promise<void> {
    this.fxLoading.set(true);
    try { this.fxEntries.set(await this.fxService.getCachedRates()); }
    catch { /* silently ignore */ }
    finally { this.fxLoading.set(false); }
  }

  async clearFxCache(): Promise<void> {
    this.fxClearing.set(true);
    try {
      await this.fxService.clearCache();
      this.fxEntries.set([]);
      this.toast.success('FX rate cache cleared.');
    } catch (err: unknown) {
      this.toast.error('Failed to clear cache: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      this.fxClearing.set(false);
    }
  }
}