import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../../core/services/config.service';
import { NairaPipe } from '../../shared/pipes/naira.pipe';

interface Guide { title: string; body: string[]; }

@Component({
  selector: 'lf-help',
  standalone: true,
  imports: [FormsModule, RouterLink, NairaPipe],
  template: `
    <div class="help">
      <div>
        <h1 class="headline-md">Help & Guides</h1>
        <p class="body-md text-muted mt-2">How Direct Assessment works under the NTA 2025 and how LagosFile applies it. Available offline.</p>
      </div>

      @if (config(); as c) {
        <div class="card help__rates">
          <h2 class="title-md">Current tax bands ({{ c.versionLabel }})</h2>
          @for (b of c.bands; track b.lower) {
            <div class="help__band">
              <span>{{ b.lower | naira }} – {{ b.upper === null ? 'and above' : (b.upper | naira) }}</span>
              <strong>{{ (b.rate * 100).toFixed(0) }}%</strong>
            </div>
          }
          <p class="body-sm text-muted">Edit these on the <a routerLink="/configuration">Configuration</a> page if LIRS publishes new rates.</p>
        </div>
      }

      <input class="form-input" type="search" placeholder="Search guides…" [ngModel]="query()" (ngModelChange)="query.set($event)" name="q" />

      @for (g of filtered(); track g.title) {
        <details class="card help__guide">
          <summary class="title-sm">{{ g.title }}</summary>
          @for (p of g.body; track $index) { <p class="body-md">{{ p }}</p> }
        </details>
      } @empty {
        <p class="body-md text-muted">No guides match "{{ query() }}".</p>
      }
    </div>
  `,
  styles: [`
    .help { display: flex; flex-direction: column; gap: var(--space-4); max-width: 860px; }
    .help__rates { display: flex; flex-direction: column; gap: var(--space-2); }
    .help__band { display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; font-size: var(--text-body-sm); }
    .help__guide summary { cursor: pointer; }
    .help__guide p { margin-top: var(--space-3); line-height: 1.6; }
  `],
})
export class HelpComponent {
  private configService = inject(ConfigService);

  config = this.configService.activeConfig;
  query = signal('');

  readonly guides = computed<Guide[]>(() => {
    const c = this.config();
    const rentRate = ((c?.reliefCaps.rentReliefRate ?? 0.2) * 100).toFixed(0);
    const rentCap = (c?.reliefCaps.rentReliefCap ?? 500_000).toLocaleString('en-NG');
    const proceeds = (c?.cgtThresholds.proceedsThreshold ?? 150_000_000).toLocaleString('en-NG');
    const gain = (c?.cgtThresholds.gainThreshold ?? 10_000_000).toLocaleString('en-NG');
    const minRate = ((c?.minimumTaxRate ?? 0.01) * 100).toFixed(0);
    return [
      { title: 'Who files Direct Assessment?', body: [
        'Direct Assessment is the self-assessed return for individuals whose income is not fully taxed through PAYE: the self-employed, freelancers, landlords, investors and employees with income on the side.',
        'You file for a year of assessment (YOA) covering income earned from 1 January to 31 December. The return is due by 31 March of the following year.',
      ] },
      { title: 'How your tax is computed', body: [
        'Gross income (including foreign income converted to Naira) less capital allowances, less deductions and reliefs, gives chargeable income.',
        'Chargeable income is taxed in bands, each rate applying only to the slice of income inside that band. WHT credits are then set off against the tax.',
        `A minimum tax of ${minRate}% of gross income applies if it is higher than the graduated tax after credits. Whether this rule applies to individuals under the NTA 2025 is unconfirmed; check with LIRS or a tax advisor.`,
      ] },
      { title: 'Rent Relief', body: [
        `Rent Relief replaces the abolished Consolidated Relief Allowance. It is ${rentRate}% of annual rent paid, capped at ₦${rentCap}.`,
        'Homeowners cannot claim it. Keep your tenancy agreement and rent receipts: LIRS may ask for them, and you can attach them in the Deductions step.',
      ] },
      { title: 'Capital gains on shares', body: [
        `Gains on Nigerian company shares are exempt when total disposal proceeds are below ₦${proceeds} and total gains do not exceed ₦${gain} within 12 consecutive months.`,
        'The limits apply to all your disposals together, not to each sale. LagosFile adds up every share disposal in the year before testing them.',
      ] },
      { title: 'Digital and virtual asset losses', body: [
        'Losses on digital assets can only offset gains on digital assets. They cannot reduce employment, business or other income.',
      ] },
      { title: 'Capital allowances', body: [
        'Professional equipment is written off on a straight-line basis: each year you claim cost × the annual rate for the asset type, until the written-down value reaches zero. There is no initial allowance under the NTA 2025.',
        'Use "Load from Prior Year" in the Capital Allowances step to carry assets forward from last year\'s confirmed filing.',
      ] },
      { title: 'Withholding tax (WHT) credits', body: [
        'Tax withheld from your payments by clients or banks is a credit against your final tax, not a deduction from income. Enter each WHT certificate separately and attach it.',
        'Credits belong to the year the tax was deducted, so they are not copied when you duplicate a filing into a new year.',
      ] },
      { title: 'Foreign income and exchange rates', body: [
        'Foreign income must be converted at the CBN official rate (s.20(4) NTA 2025). LagosFile fetches a market rate as a guide; enter the CBN rate in the override field for full compliance.',
        'Foreign tax paid is recorded for reference only. Claiming treaty relief requires a tax advisor.',
      ] },
      { title: 'Filing on the LIRS e-Tax portal', body: [
        'Confirm your filing, then use "File with LIRS". The companion browser extension fills Form A on etax.lirs.gov.ng. If it cannot, a reference panel shows every value labelled to match the form.',
        'After submitting on the portal, mark the filing as Submitted, then record your payment date and receipt reference in Filing History.',
      ] },
      { title: 'Amendments and duplicates', body: [
        'Confirmed filings never change. To correct one, use Amend: this creates a linked draft for the same year.',
        'Duplicate starts next year\'s draft with your income, carried-forward assets and recurring reliefs already filled in.',
      ] },
      { title: 'Keeping your data safe', body: [
        'Your data is encrypted with a key derived from your PIN and never leaves this computer. The app locks itself after a period of inactivity, which you can change in Settings.',
        'Make regular encrypted backups from Settings. Without your PIN or recovery answers, a backup cannot be opened.',
      ] },
    ];
  });

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.guides();
    return this.guides().filter(g => (g.title + ' ' + g.body.join(' ')).toLowerCase().includes(q));
  });
}
