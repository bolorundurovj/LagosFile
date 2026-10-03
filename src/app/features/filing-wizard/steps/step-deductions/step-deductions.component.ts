import { Component, input, output, inject, OnInit, signal, computed } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { FormsModule } from '@angular/forms';
import { FilingService } from '../../../../core/services/filing.service';
import { ConfigService } from '../../../../core/services/config.service';
import { ReliefEntry, ReliefType } from '../../../../core/models';
import { NairaPipe } from '../../../../shared/pipes/naira.pipe';
import { FileDropzoneComponent, DropzoneFile } from '../../../../shared/components/file-dropzone/file-dropzone.component';
import { ToastService } from '../../../../core/services/toast.service';
import { queueDocument, flushDocuments } from '../pending-documents';
import { NumericFormatDirective } from '../../../../shared/directives/numeric-format.directive';
import { HelpTooltipComponent } from '../../../../shared/components/help-tooltip/help-tooltip.component';

type StandardRelief = 'pension' | 'nhis' | 'nhf' | 'life_assurance' | 'rent' | 'foreign_tax';
type FieldKey = 'pension' | 'nhis' | 'nhf' | 'lifeAssurance' | 'annualRent' | 'foreignTaxPaid';

const STANDARD_FIELDS: Record<StandardRelief, FieldKey> = {
  pension: 'pension',
  nhis: 'nhis',
  nhf: 'nhf',
  life_assurance: 'lifeAssurance',
  rent: 'annualRent',
  foreign_tax: 'foreignTaxPaid',
};

@Component({
  selector: 'lf-step-deductions',
  standalone: true,
  imports: [FormsModule, NairaPipe, FileDropzoneComponent, NumericFormatDirective, HelpTooltipComponent, LucideAngularModule],
  template: `
    <div class="step-page">
      <div class="step-page__header">
        <h2 class="headline-sm">Deductions & Reliefs<lf-help text="Allowable deductions reduce your chargeable income. These are governed by NTA 2025. Unsupported deductions are disallowed." align="left"></lf-help></h2>
        <div class="alert alert--info">
          <span class="alert__icon">ℹ</span>
          <div class="alert__content">
            The Consolidated Relief Allowance (CRA) has been abolished under the NTA 2025 and replaced with Rent Relief.
          </div>
        </div>
      </div>

      <!-- Structured reliefs -->
      <div class="card">
        <h3 class="title-md" style="margin-bottom:var(--space-5)">Standard Reliefs<lf-help text="These reliefs are deducted from gross income before tax is computed. Each must be supported by documentary evidence." align="left"></lf-help></h3>
        <div class="relief-grid">

          <!-- Pension -->
          <div class="relief-row">
            <div class="relief-row__info">
              <div class="relief-row__label">Pension Contributions (PFA)<lf-help text="Contributions to an approved Pension Fund Administrator under the Pension Reform Act 2004. Minimum 8% of monthly emolument for employees. Deductible in full with no cap under NTA 2025."></lf-help></div>
              <div class="relief-row__sub">Approved pension scheme contributions</div>
            </div>
            <input type="number" class="form-input relief-row__input"
              [(ngModel)]="fields.pension" name="pension" min="0" placeholder="₦ 0.00" />
          </div>
          <div class="relief-docs">
            <lf-file-dropzone [compact]="true" label="Attach PFA statement" (fileSelected)="onFileSelected($event, standard.pension)" />
            @for (doc of standard.pension.documents; track doc.id) {
              <span class="doc-chip"><lucide-icon name="paperclip" [size]="13" [strokeWidth]="2"></lucide-icon> {{ doc.fileName }}</span>
            }
          </div>

          <!-- NHIS -->
          <div class="relief-row">
            <div class="relief-row__info">
              <div class="relief-row__label">NHIS Contributions<lf-help text="Contributions paid under the National Health Insurance Authority Act. Deductible in full when supported by receipts."></lf-help></div>
              <div class="relief-row__sub">National Health Insurance Scheme</div>
            </div>
            <input type="number" class="form-input relief-row__input"
              [(ngModel)]="fields.nhis" name="nhis" min="0" placeholder="₦ 0.00" />
          </div>
          <div class="relief-docs">
            <lf-file-dropzone [compact]="true" label="Attach NHIS receipt" (fileSelected)="onFileSelected($event, standard.nhis)" />
            @for (doc of standard.nhis.documents; track doc.id) {
              <span class="doc-chip"><lucide-icon name="paperclip" [size]="13" [strokeWidth]="2"></lucide-icon> {{ doc.fileName }}</span>
            }
          </div>

          <!-- NHF -->
          <div class="relief-row">
            <div class="relief-row__info">
              <div class="relief-row__label">NHF Contributions<lf-help text="Contributions to the National Housing Fund managed by the Federal Mortgage Bank of Nigeria (FMBN). Deductible in full."></lf-help></div>
              <div class="relief-row__sub">National Housing Fund (FMBN)</div>
            </div>
            <input type="number" class="form-input relief-row__input"
              [(ngModel)]="fields.nhf" name="nhf" min="0" placeholder="₦ 0.00" />
          </div>
          <div class="relief-docs">
            <lf-file-dropzone [compact]="true" label="Attach NHF statement" (fileSelected)="onFileSelected($event, standard.nhf)" />
            @for (doc of standard.nhf.documents; track doc.id) {
              <span class="doc-chip"><lucide-icon name="paperclip" [size]="13" [strokeWidth]="2"></lucide-icon> {{ doc.fileName }}</span>
            }
          </div>

          <!-- Life assurance -->
          <div class="relief-row">
            <div class="relief-row__info">
              <div class="relief-row__label">Life Assurance Premiums<lf-help text="Premiums paid on life assurance policies for yourself or your spouse, with an approved insurer. Enter total annual premium paid."></lf-help></div>
              <div class="relief-row__sub">Approved life assurance policies</div>
            </div>
            <input type="number" class="form-input relief-row__input"
              [(ngModel)]="fields.lifeAssurance" name="lifeAssurance" min="0" placeholder="₦ 0.00" />
          </div>
          <div class="relief-docs">
            <lf-file-dropzone [compact]="true" label="Attach policy or premium receipt" (fileSelected)="onFileSelected($event, standard.life_assurance)" />
            @for (doc of standard.life_assurance.documents; track doc.id) {
              <span class="doc-chip"><lucide-icon name="paperclip" [size]="13" [strokeWidth]="2"></lucide-icon> {{ doc.fileName }}</span>
            }
          </div>

          <!-- Rent relief -->
          <div class="relief-row">
            <div class="relief-row__info">
              <div class="relief-row__label">Annual Rent Paid<lf-help text="Enter total rent paid on your residential property in Lagos for the year. Relief is 20% of this amount, capped at ₦500,000 (NTA 2025, s.33). Owner-occupiers cannot claim."></lf-help></div>
              <div class="relief-row__sub">
                Rent Relief = {{ rentReliefRate() * 100 }}% of annual rent, capped at {{ rentReliefCap() | naira }}.
                Homeowners cannot claim this relief.
              </div>
            </div>
            <input type="number" class="form-input relief-row__input"
              [(ngModel)]="fields.annualRent" name="annualRent" min="0" placeholder="₦ 0.00" />
          </div>
          <div class="relief-docs">
            <lf-file-dropzone [compact]="true" label="Attach tenancy agreement or rent receipt" (fileSelected)="onFileSelected($event, standard.rent)" />
            @for (doc of standard.rent.documents; track doc.id) {
              <span class="doc-chip"><lucide-icon name="paperclip" [size]="13" [strokeWidth]="2"></lucide-icon> {{ doc.fileName }}</span>
            }
          </div>

          @if (fields.annualRent > 0) {
            <div class="relief-callout">
              <span>Rent Relief Applied:</span>
              <strong>{{ rentRelief() | naira }}</strong>
              <span class="text-muted">({{ rentReliefRate() * 100 }}% of rent, capped at {{ rentReliefCap() | naira }})</span>
            </div>
          } @else {
            <div class="alert alert--info" style="grid-column:1/-1">
              <span class="alert__icon">ℹ</span>
              <div class="alert__content">Rent Relief is not applicable — no rent expense entered.</div>
            </div>
          }
        </div>
      </div>

      <!-- WHT Credits -->
      <div class="card">
        <div class="flex items-center justify-between" style="margin-bottom:var(--space-4)">
          <h3 class="title-md">Withholding Tax (WHT) Credits</h3>
          <button class="btn btn--secondary btn--sm" (click)="addWht()">+ Add WHT Credit</button>
        </div>

        @if (whtEntries().length === 0) {
          <p class="body-sm text-muted">No WHT credits added.</p>
        }

        @for (w of whtEntries(); track w.id; let i = $index) {
          <div class="wht-row">
            <div class="entry-grid-3">
              <div class="form-group">
                <label class="form-label">Certificate Ref.</label>
                <input type="text" class="form-input" [(ngModel)]="w.whtRef"
                  [name]="'wref_' + i" placeholder="WHT/2024/001" />
              </div>
              <div class="form-group">
                <label class="form-label">Income Type</label>
                <input type="text" class="form-input" [(ngModel)]="w.whtIncomeType"
                  [name]="'wtype_' + i" placeholder="e.g. Consulting" />
              </div>
              <div class="form-group">
                <label class="form-label">Date of Deduction</label>
                <input type="date" class="form-input" [(ngModel)]="w.whtDate" [name]="'wdate_' + i" />
              </div>
            </div>
            <div class="flex items-center gap-4" style="margin-top:var(--space-2)">
              <div class="form-group flex-1">
                <label class="form-label">Amount (₦)</label>
                <input type="number" class="form-input" [(ngModel)]="w.claimedAmount"
                  [name]="'wamt_' + i" min="0" (change)="w.approvedAmount = w.claimedAmount" />
              </div>
              <button class="btn btn--danger btn--sm" style="margin-top:22px" (click)="removeWht(w.id)">Remove</button>
            </div>
            <div class="relief-docs">
              <lf-file-dropzone [compact]="true" label="Attach WHT certificate" (fileSelected)="onFileSelected($event, w)" />
              @for (doc of w.documents; track doc.id) {
                <span class="doc-chip"><lucide-icon name="paperclip" [size]="13" [strokeWidth]="2"></lucide-icon> {{ doc.fileName }}</span>
              }
            </div>
          </div>
        }

        @if (totalWht() > 0) {
          <div class="relief-callout" style="margin-top:var(--space-3)">
            <span>Total WHT Credits:</span>
            <strong>{{ totalWht() | naira }}</strong>
          </div>
        }
      </div>

      <!-- Foreign tax paid (reference only) -->
      <div class="card">
        <h3 class="title-md" style="margin-bottom:var(--space-2)">Foreign Tax Paid <span class="badge badge--draft" style="font-size:10px;vertical-align:middle">Reference only</span></h3>
        <p class="body-sm text-muted" style="margin-bottom:var(--space-4)">
          Tax deducted or paid in the country of source on foreign income. Recorded for reference only in v1 —
          formal double-taxation treaty relief requires a tax advisor.
        </p>
        <div class="relief-row">
          <div class="relief-row__info">
            <div class="relief-row__label">Foreign Tax Paid (₦ equivalent)<lf-help text="Convert the foreign tax paid to Naira at the same rate used for the income entry. Attach the foreign tax certificate or withholding notice as a supporting document."></lf-help></div>
            <div class="relief-row__sub">Attach supporting documentation below</div>
          </div>
          <div class="relief-row__input">
            <input type="number" class="form-input" [(ngModel)]="fields.foreignTaxPaid"
              name="foreignTaxPaid" min="0" placeholder="₦ 0.00" />
          </div>
        </div>
        @if (fields.foreignTaxPaid > 0) {
          <div class="relief-docs">
            <lf-file-dropzone [compact]="true" label="Attach foreign tax certificate" (fileSelected)="onFileSelected($event, standard.foreign_tax)" />
            @for (doc of standard.foreign_tax.documents; track doc.id) {
              <span class="doc-chip"><lucide-icon name="paperclip" [size]="13" [strokeWidth]="2"></lucide-icon> {{ doc.fileName }}</span>
            }
          </div>
        }
      </div>

      <!-- Other approved deductions -->
      <div class="card">
        <div class="flex items-center justify-between" style="margin-bottom:var(--space-4)">
          <h3 class="title-md">Other Approved Deductions</h3>
          <button class="btn btn--secondary btn--sm" (click)="addOther()">+ Add</button>
        </div>
        @for (o of otherEntries(); track o.id; let i = $index) {
          <div class="flex items-center gap-4 mb-4">
            <div class="form-group flex-1">
              <label class="form-label">Description</label>
              <input type="text" class="form-input" [(ngModel)]="o.description"
                [name]="'odesc_' + i" placeholder="Nature of deduction" />
            </div>
            <div class="form-group" style="width:180px">
              <label class="form-label">Amount (₦)</label>
              <input type="number" class="form-input" [(ngModel)]="o.claimedAmount"
                [name]="'oamt_' + i" min="0" (change)="o.approvedAmount = o.claimedAmount" />
            </div>
            <button class="btn btn--danger btn--sm" style="margin-top:22px" (click)="removeOther(o.id)">Remove</button>
          </div>
          <div class="relief-docs" style="margin-bottom:var(--space-4)">
            <lf-file-dropzone [compact]="true" label="Attach supporting document" (fileSelected)="onFileSelected($event, o)" />
            @for (doc of o.documents; track doc.id) {
              <span class="doc-chip"><lucide-icon name="paperclip" [size]="13" [strokeWidth]="2"></lucide-icon> {{ doc.fileName }}</span>
            }
          </div>
        }
      </div>

      <!-- Summary -->
      <div class="computation-total">
        <div class="total-label">Estimated Total Deductions & Reliefs<lf-help text="Excludes WHT credits, which are set off against the tax computed rather than deducted from income." align="left"></lf-help></div>
        <div class="total-value">{{ totalDeductions() | naira }}</div>
      </div>

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
    .step-page__header { display: flex; flex-direction: column; gap: var(--space-3); }
    .relief-grid { display: flex; flex-direction: column; gap: var(--space-4); }
    .relief-row {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: var(--space-4); padding: var(--space-3) 0;
      border-bottom: 1px solid var(--color-surface-container);
    }
    .relief-row__info { flex: 1; }
    .relief-row__label { font-size: var(--text-body-md); font-weight: var(--font-weight-medium); }
    .relief-row__sub { font-size: var(--text-label-sm); color: var(--color-on-surface-variant); margin-top: 2px; }
    .relief-row__input { width: 200px; flex-shrink: 0; }
    .relief-docs { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
    .doc-chip {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: var(--text-label-sm); color: var(--color-on-surface-variant);
      padding: var(--space-1) var(--space-2);
    }
    .relief-callout {
      display: flex; align-items: center; gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      background: var(--color-secondary-container);
      border-radius: var(--radius-lg);
      font-size: var(--text-body-sm);
      color: var(--color-on-secondary-container);
    }
    .wht-row {
      display: flex; flex-direction: column; gap: var(--space-3);
      padding: var(--space-4); background: var(--color-surface-container-low);
      border-radius: var(--radius-lg); margin-bottom: var(--space-3);
    }
    .entry-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-3); }
    .step-nav { display: flex; justify-content: space-between; padding-top: var(--space-4); border-top: 1px solid var(--color-surface-container); }
  `],
})
export class StepDeductionsComponent implements OnInit {
  filingId = input.required<string>();
  next = output<void>();
  back = output<void>();

  private filingService = inject(FilingService);
  private configService = inject(ConfigService);
  private toast = inject(ToastService);

  fields: Record<FieldKey, number> = { pension: 0, nhis: 0, nhf: 0, lifeAssurance: 0, annualRent: 0, foreignTaxPaid: 0 };
  standard = {} as Record<StandardRelief, ReliefEntry>;
  whtEntries = signal<(ReliefEntry & { description?: string })[]>([]);
  otherEntries = signal<(ReliefEntry & { description?: string })[]>([]);
  saving = signal(false);
  private removedIds: string[] = [];

  async ngOnInit(): Promise<void> {
    for (const type of Object.keys(STANDARD_FIELDS) as StandardRelief[]) {
      this.standard[type] = this.newRelief(type);
    }
    const existing = await this.filingService.listReliefEntries(this.filingId());
    for (const r of existing) {
      if (r.reliefType in STANDARD_FIELDS) {
        const type = r.reliefType as StandardRelief;
        const current = this.standard[type];
        // earlier versions saved a new row on every pass; keep the latest, drop the rest
        if (current.id !== r.id && existing.some(x => x.id === current.id)) this.removedIds.push(current.id);
        this.standard[type] = r;
        this.fields[STANDARD_FIELDS[type]] = r.claimedAmount;
      } else if (r.reliefType === 'wht') {
        this.whtEntries.update(e => [...e, r]);
      } else if (r.reliefType === 'other_approved') {
        this.otherEntries.update(e => [...e, r]);
      }
    }
  }

  private newRelief(type: ReliefType): ReliefEntry & { description?: string } {
    return {
      id: crypto.randomUUID(), filingId: this.filingId(), reliefType: type,
      claimedAmount: 0, approvedAmount: 0, documents: [],
    };
  }

  private caps = computed(() => this.configService.activeConfig()?.reliefCaps);

  rentReliefRate = computed(() => this.caps()?.rentReliefRate ?? 0.20);
  rentReliefCap = computed(() => this.caps()?.rentReliefCap ?? 500_000);

  rentRelief(): number {
    return Math.min(this.fields.annualRent * this.rentReliefRate(), this.rentReliefCap());
  }

  capped(amount: number, cap: number | null | undefined): number {
    return cap != null && cap >= 0 ? Math.min(amount, cap) : amount;
  }

  totalWht = computed(() => this.whtEntries().reduce((s, e) => s + (e.claimedAmount ?? 0), 0));

  /** Mirrors the engine; WHT is a credit against tax, not a deduction from income. */
  totalDeductions(): number {
    const caps = this.caps();
    const others = this.otherEntries().reduce((s, e) => s + (e.claimedAmount ?? 0), 0);
    return this.capped(this.fields.pension, caps?.pensionCap)
      + this.capped(this.fields.nhis, caps?.nhisCap)
      + this.capped(this.fields.nhf, caps?.nhfCap)
      + this.fields.lifeAssurance + this.rentRelief() + others;
  }

  addWht(): void { this.whtEntries.update(e => [...e, this.newRelief('wht')]); }
  removeWht(id: string): void {
    this.removedIds.push(id);
    this.whtEntries.update(e => e.filter(x => x.id !== id));
  }

  addOther(): void { this.otherEntries.update(e => [...e, { ...this.newRelief('other_approved'), description: '' }]); }
  removeOther(id: string): void {
    this.removedIds.push(id);
    this.otherEntries.update(e => e.filter(x => x.id !== id));
  }

  onFileSelected(file: DropzoneFile, entry: ReliefEntry): void {
    const error = queueDocument(entry, file, 'relief_entry');
    if (error) this.toast.error(error);
  }

  async saveAndNext(): Promise<void> {
    this.saving.set(true);
    try {
      const fid = this.filingId();
      for (const id of this.removedIds) await this.filingService.deleteReliefEntry(id);
      this.removedIds = [];

      const entries: ReliefEntry[] = [...this.whtEntries(), ...this.otherEntries()];
      for (const [type, key] of Object.entries(STANDARD_FIELDS) as [StandardRelief, FieldKey][]) {
        const entry = this.standard[type];
        entry.claimedAmount = entry.approvedAmount = this.fields[key] || 0;
        entries.push(entry);
      }

      const failed: string[] = [];
      for (const entry of entries) {
        if (entry.reliefType === 'wht' || entry.reliefType === 'other_approved') {
          entry.approvedAmount = entry.claimedAmount;
        }
        await this.filingService.upsertReliefEntry({ ...entry, filingId: fid });
        failed.push(...await flushDocuments(this.filingService, entry, 'relief_entry'));
      }
      if (failed.length) this.toast.error('Could not attach ' + failed.join('; '));
      this.next.emit();
    } catch (err) {
      this.toast.error('Could not save deductions: ' + String(err));
    } finally {
      this.saving.set(false);
    }
  }
}
