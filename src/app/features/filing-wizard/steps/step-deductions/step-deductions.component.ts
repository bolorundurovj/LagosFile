import { Component, input, output, inject, OnInit, signal, computed } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { FormsModule } from '@angular/forms';
import { FilingService } from '../../../../core/services/filing.service';
import { ConfigService } from '../../../../core/services/config.service';
import { ReliefEntry, ReliefType } from '../../../../core/models';
import { NairaPipe } from '../../../../shared/pipes/naira.pipe';
import { FileDropzoneComponent } from '../../../../shared/components/file-dropzone/file-dropzone.component';
import { NumericFormatDirective } from '../../../../shared/directives/numeric-format.directive';
import { HelpTooltipComponent } from '../../../../shared/components/help-tooltip/help-tooltip.component';

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

          <!-- NHIS -->
          <div class="relief-row">
            <div class="relief-row__info">
              <div class="relief-row__label">NHIS Contributions<lf-help text="Contributions paid under the National Health Insurance Authority Act. Deductible in full when supported by receipts."></lf-help></div>
              <div class="relief-row__sub">National Health Insurance Scheme</div>
            </div>
            <input type="number" class="form-input relief-row__input"
              [(ngModel)]="fields.nhis" name="nhis" min="0" placeholder="₦ 0.00" />
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

          <!-- Life assurance -->
          <div class="relief-row">
            <div class="relief-row__info">
              <div class="relief-row__label">Life Assurance Premiums<lf-help text="Premiums paid on life assurance policies for yourself or your spouse, with an approved insurer. Enter total annual premium paid."></lf-help></div>
              <div class="relief-row__sub">Approved life assurance policies</div>
            </div>
            <input type="number" class="form-input relief-row__input"
              [(ngModel)]="fields.lifeAssurance" name="lifeAssurance" min="0" placeholder="₦ 0.00" />
          </div>

          <!-- Rent relief -->
          <div class="relief-row">
            <div class="relief-row__info">
              <div class="relief-row__label">Annual Rent Paid<lf-help text="Enter total rent paid on your residential property in Lagos for the year. Relief is 20% of this amount, capped at ₦500,000 (NTA 2025, s.33). Owner-occupiers cannot claim."></lf-help></div>
              <div class="relief-row__sub">
                Rent Relief = 20% of annual rent, capped at ₦500,000.
                Homeowners cannot claim this relief.
              </div>
            </div>
            <input type="number" class="form-input relief-row__input"
              [(ngModel)]="fields.annualRent" name="annualRent" min="0" placeholder="₦ 0.00" />
          </div>

          @if (fields.annualRent > 0) {
            <div class="relief-callout">
              <span>Rent Relief Applied:</span>
              <strong>{{ rentRelief() | naira }}</strong>
              <span class="text-muted">(20% of rent, capped at ₦500,000)</span>
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
            <lf-file-dropzone label="Attach WHT certificate" (fileSelected)="onFileSelected($event, w)" />
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
          <lf-file-dropzone label="Attach foreign tax certificate" (fileSelected)="onForeignTaxFileSelected($event)" style="margin-top:var(--space-3);display:block" />
          @for (doc of foreignTaxDocs(); track doc.id) {
            <div class="doc-chip" style="display:flex;align-items:center;gap:4px;font-size:var(--text-label-sm);color:var(--color-on-surface-variant);padding:var(--space-1) var(--space-2)">
              <lucide-icon name="paperclip" [size]="13" [strokeWidth]="2"></lucide-icon> {{ doc.fileName }}
            </div>
          }
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
        }
      </div>

      <!-- Summary -->
      <div class="computation-total">
        <div class="total-label">Estimated Total Deductions & Reliefs</div>
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

  fields = { pension: 0, nhis: 0, nhf: 0, lifeAssurance: 0, annualRent: 0, foreignTaxPaid: 0 };
  whtEntries = signal<(ReliefEntry & { description?: string })[]>([]);
  otherEntries = signal<(ReliefEntry & { description?: string })[]>([]);
  foreignTaxDocs = signal<ReliefEntry['documents']>([]);
  saving = signal(false);

  async ngOnInit(): Promise<void> {
    const existing = await this.filingService.listReliefEntries(this.filingId());
    for (const r of existing) {
      switch (r.reliefType) {
        case 'pension':       this.fields.pension       = r.claimedAmount; break;
        case 'nhis':          this.fields.nhis          = r.claimedAmount; break;
        case 'nhf':           this.fields.nhf           = r.claimedAmount; break;
        case 'life_assurance':this.fields.lifeAssurance = r.claimedAmount; break;
        case 'rent':          this.fields.annualRent      = r.claimedAmount; break;
        case 'wht':           this.whtEntries.update(e => [...e, r]); break;
        case 'other_approved':this.otherEntries.update(e => [...e, r]); break;
        case 'foreign_tax':
          this.fields.foreignTaxPaid = r.claimedAmount;
          if (r.documents?.length) this.foreignTaxDocs.set(r.documents);
          break;
      }
    }
  }

  rentRelief = computed(() => {
    const cap = this.configService.activeConfig()?.reliefCaps?.rentReliefCap ?? 500_000;
    return Math.min(this.fields.annualRent * 0.20, cap);
  });

  totalWht = computed(() => this.whtEntries().reduce((s, e) => s + (e.claimedAmount ?? 0), 0));

  totalDeductions = computed(() => {
    const others = this.otherEntries().reduce((s, e) => s + (e.claimedAmount ?? 0), 0);
    return this.fields.pension + this.fields.nhis + this.fields.nhf
      + this.fields.lifeAssurance + this.rentRelief() + this.totalWht() + others;
  });

  onForeignTaxFileSelected(file: { path: string; name: string; size: number; type: string }): void {
    this.foreignTaxDocs.update(docs => [...docs, {
      id: crypto.randomUUID(), parentEntryId: 'foreign_tax_' + this.filingId(),
      parentEntryType: 'relief_entry', filePath: file.path, fileName: file.name,
      fileType: file.type, fileSizeBytes: file.size, uploadedAt: new Date().toISOString(),
    }]);
  }

  addWht(): void {
    this.whtEntries.update(e => [...e, {
      id: crypto.randomUUID(), filingId: this.filingId(), reliefType: 'wht',
      claimedAmount: 0, approvedAmount: 0, documents: [],
    }]);
  }
  removeWht(id: string): void { this.whtEntries.update(e => e.filter(x => x.id !== id)); }

  addOther(): void {
    this.otherEntries.update(e => [...e, {
      id: crypto.randomUUID(), filingId: this.filingId(), reliefType: 'other_approved',
      claimedAmount: 0, approvedAmount: 0, description: '', documents: [],
    }]);
  }
  removeOther(id: string): void { this.otherEntries.update(e => e.filter(x => x.id !== id)); }

  onFileSelected(file: { path: string; name: string; size: number; type: string }, entry: ReliefEntry): void {
    entry.documents = [...(entry.documents ?? []), {
      id: crypto.randomUUID(), parentEntryId: entry.id, parentEntryType: 'relief_entry',
      filePath: file.path, fileName: file.name, fileType: file.type,
      fileSizeBytes: file.size, uploadedAt: new Date().toISOString(),
    }];
  }

  async saveAndNext(): Promise<void> {
    this.saving.set(true);
    try {
      const fid = this.filingId();
      const makeRelief = (type: ReliefType, amount: number): Partial<ReliefEntry> & { filingId: string } =>
        ({ filingId: fid, reliefType: type, claimedAmount: amount, approvedAmount: amount, documents: [] });

      await this.filingService.upsertReliefEntry(makeRelief('pension', this.fields.pension) as ReliefEntry & { filingId: string });
      await this.filingService.upsertReliefEntry(makeRelief('nhis', this.fields.nhis) as ReliefEntry & { filingId: string });
      await this.filingService.upsertReliefEntry(makeRelief('nhf', this.fields.nhf) as ReliefEntry & { filingId: string });
      await this.filingService.upsertReliefEntry(makeRelief('life_assurance', this.fields.lifeAssurance) as ReliefEntry & { filingId: string });
      await this.filingService.upsertReliefEntry(makeRelief('rent', this.fields.annualRent) as ReliefEntry & { filingId: string });
      // foreign tax paid (reference only)
      await this.filingService.upsertReliefEntry(makeRelief('foreign_tax', this.fields.foreignTaxPaid) as ReliefEntry & { filingId: string });
      for (const w of this.whtEntries()) await this.filingService.upsertReliefEntry({ ...w, filingId: fid });
      for (const o of this.otherEntries()) await this.filingService.upsertReliefEntry({ ...o, filingId: fid });

      this.next.emit();
    } finally {
      this.saving.set(false);
    }
  }
}
