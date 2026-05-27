import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe, LowerCasePipe } from '@angular/common';
import { invoke } from '@tauri-apps/api/core';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { homeDir, join } from '@tauri-apps/api/path';
import { FilingService } from '../../core/services/filing.service';
import { LIRSService } from '../../core/services/lirs.service';
import { ToastService } from '../../core/services/toast.service';
import {
  Filing, LIRSFieldGroup,
} from '../../core/models';
import { NairaPipe } from '../../shared/pipes/naira.pipe';
import { LIRSReferencePanelComponent } from '../../shared/components/lirs-reference-panel/lirs-reference-panel.component';
import { LucideAngularModule, ClipboardList, Trash2, Lock, Check, Send } from 'lucide-angular';

type ExportFormat = 'pdf' | 'csv' | 'json';

@Component({
  selector: 'lf-filing-history',
  standalone: true,
  imports: [FormsModule, RouterLink, NairaPipe, DatePipe, LowerCasePipe,
    LucideAngularModule, LIRSReferencePanelComponent],
  template: `
    <div class="history-page">
      <div class="history-page__header">
        <h1 class="headline-md">Filing History</h1>
        <a routerLink="/filing/new" class="btn btn--primary">+ New Filing</a>
      </div>

      <!-- Metric cards -->
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-card__value headline-sm">{{ totalFilings() }}</div>
          <div class="metric-card__label">Total Filings</div>
        </div>
        <div class="metric-card metric-card--submitted">
          <div class="metric-card__value headline-sm">{{ submittedCount() }}</div>
          <div class="metric-card__label">Submitted</div>
        </div>
        <div class="metric-card metric-card--confirmed">
          <div class="metric-card__value headline-sm">{{ confirmedCount() }}</div>
          <div class="metric-card__label">Confirmed</div>
        </div>
        <div class="metric-card metric-card--draft">
          <div class="metric-card__value headline-sm">{{ draftCount() }}</div>
          <div class="metric-card__label">Drafts</div>
        </div>
      </div>

      <!-- Filters -->
      <div class="history-filters card">
        <div class="form-group" style="flex:1;min-width:200px">
          <label class="form-label">Search</label>
          <input type="text" class="form-input" [(ngModel)]="searchQuery"
            placeholder="Reference, year…" (input)="applyFilter()" />
        </div>
        <div class="form-group" style="width:160px">
          <label class="form-label">Status</label>
          <select class="form-input" [(ngModel)]="statusFilter" (change)="applyFilter()">
            <option value="">All</option>
            <option value="Draft">Draft</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Submitted">Submitted</option>
          </select>
        </div>
        <div class="form-group" style="width:120px">
          <label class="form-label">Year</label>
          <input type="number" class="form-input" [(ngModel)]="yearFilter"
            placeholder="All" (change)="applyFilter()" />
        </div>
      </div>

      <!-- Table -->
      <div class="card" style="overflow:hidden;padding:0">
        @if (loading()) {
          <div class="skeleton" style="height:200px;border-radius:0"></div>
        } @else if (filtered().length === 0) {
          <div style="text-align:center;padding:var(--space-12);color:var(--color-on-surface-variant)">
            <div style="margin-bottom:var(--space-3);color:var(--color-on-surface-variant)"><lucide-icon name="clipboard-list" [size]="40" [strokeWidth]="1.25"></lucide-icon></div>
            <div class="title-sm">No filings found</div>
            <div class="body-sm text-muted mt-2">
              @if (allFilings().length === 0) { Start a new filing to see it here. }
              @else { Try adjusting the filters. }
            </div>
          </div>
        } @else {
          <table class="data-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Reference</th>
                <th>Status</th>
                <th>Filed</th>
                <th class="align-right">Tax Payable</th>
                <th class="align-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (f of paginated(); track f.id) {
                <tr>
                  <td><strong>YOA {{ f.yearOfAssessment }}</strong></td>
                  <td class="text-muted" style="font-size:var(--text-label-sm)">{{ f.filingReference ?? '—' }}</td>
                  <td><span class="badge badge--{{ f.status | lowercase }}">{{ f.status }}</span></td>
                  <td class="text-muted" style="font-size:var(--text-label-sm)">
                    {{ f.confirmedAt ? (f.confirmedAt | date) : (f.createdAt | date) }}
                  </td>
                  <td class="align-right financial-value"><strong>{{ f.finalTaxPayable | naira }}</strong></td>
                  <td>
                    <div class="action-group">
                      <a [routerLink]="['/filing', f.id]" class="btn btn--ghost btn--sm">View</a>
                      @if (f.status === 'Confirmed' || f.status === 'Submitted') {
                        <button class="btn btn--secondary btn--sm" (click)="openPreview(f)">Export</button>
                        <button class="btn btn--ghost btn--sm" (click)="duplicate(f.id)">Duplicate</button>
                        <button class="btn btn--ghost btn--sm" (click)="amend(f.id)">Amend</button>
                      }
                      @if (f.status === 'Confirmed') {
                        <button class="btn btn--primary btn--sm" (click)="fileWithLirs(f)">
                          <lucide-icon name="send" [size]="12" [strokeWidth]="2" style="vertical-align:middle;margin-right:2px"></lucide-icon>
                          File with LIRS
                        </button>
                        <button class="btn btn--ghost btn--sm" (click)="markSubmitted(f.id)">Mark Submitted</button>
                      }
                      @if (f.status === 'Draft') {
                        <button class="btn btn--danger btn--sm" (click)="openDelete(f)">Delete</button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>

          <!-- Pagination -->
          @if (totalPages() > 1) {
            <div class="pagination">
              <button class="btn btn--ghost btn--sm" (click)="page.set(page() - 1)" [disabled]="page() === 1">← Prev</button>
              <span class="label-md">Page {{ page() }} of {{ totalPages() }}</span>
              <button class="btn btn--ghost btn--sm" (click)="page.set(page() + 1)" [disabled]="page() === totalPages()">Next →</button>
            </div>
          }
        }
      </div>

      <!-- Compliance note -->
      <div class="alert alert--info">
        <span class="alert__icon">ℹ</span>
        <div class="alert__content">
          <strong>Compliance Note:</strong> Direct Assessment returns for each Year of Assessment are due by
          31 March of the following year. Confirmed and Submitted filings represent your official record.
        </div>
      </div>
    </div>

    <!-- Delete confirmation modal -->
    @if (deletingFiling()) {
      <div class="modal-overlay" (click)="closeDelete()">
        <div class="modal modal--sm" (click)="$event.stopPropagation()">
          <div class="delete-modal__icon"><lucide-icon name="trash-2" [size]="36" [strokeWidth]="1.5" style="color:var(--color-error)"></lucide-icon></div>
          <h3 class="title-md" style="margin-bottom:var(--space-2)">Delete Draft Filing?</h3>
          <p class="body-sm text-muted" style="margin-bottom:var(--space-5)">
            This will permanently delete the <strong>YOA {{ deletingFiling()!.yearOfAssessment }}</strong>
            draft filing and all its income entries, allowances, and reliefs.
            This action cannot be undone.
          </p>
          <div class="flex gap-3">
            <button class="btn btn--ghost flex-1" (click)="closeDelete()" [disabled]="deleting()">Cancel</button>
            <button class="btn btn--danger flex-1" (click)="confirmDelete()" [disabled]="deleting()">
              @if (deleting()) { Deleting… } @else { Yes, Delete }
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Preview modal -->
    @if (previewFiling()) {
      <div class="modal-overlay" (click)="closePreview()">
        <div class="modal modal--preview" (click)="$event.stopPropagation()">
          <div class="preview-header">
            <div>
              <div class="title-md">YOA {{ previewFiling()!.yearOfAssessment }} Filing</div>
              <div class="body-sm text-muted" style="margin-top:2px">
                {{ previewFiling()!.filingReference ?? 'No reference' }}
                &nbsp;·&nbsp;<span class="badge badge--{{ previewFiling()!.status | lowercase }}">{{ previewFiling()!.status }}</span>
              </div>
            </div>
            <button class="btn btn--ghost btn--sm" (click)="closePreview()">✕</button>
          </div>

          <!-- Tax breakdown -->
          <div class="preview-section">
            <div class="preview-section__title">Tax Computation Summary</div>
            <div class="breakdown-table">
              <div class="breakdown-row">
                <span>Total Gross Income</span>
                <span class="financial-value">{{ previewFiling()!.totalIncomeNgn | naira }}</span>
              </div>
              <div class="breakdown-row breakdown-row--deduct">
                <span>Less: Chargeable Deductions</span>
                <span class="financial-value">{{ ((previewFiling()!.totalIncomeNgn ?? 0) - (previewFiling()!.chargeableIncome ?? 0)) | naira }}</span>
              </div>
              <div class="breakdown-row breakdown-row--subtotal">
                <span>Chargeable Income</span>
                <span class="financial-value">{{ previewFiling()!.chargeableIncome | naira }}</span>
              </div>
              <div class="breakdown-row">
                <span>Graduated Tax</span>
                <span class="financial-value">{{ previewFiling()!.taxPayable | naira }}</span>
              </div>
              <div class="breakdown-row breakdown-row--deduct">
                <span>Less: WHT Credits</span>
                <span class="financial-value">{{ previewFiling()!.whtCredit | naira }}</span>
              </div>
              <div class="breakdown-row breakdown-row--subtotal">
                <span>Net Tax Payable</span>
                <span class="financial-value">{{ previewFiling()!.netTaxPayable | naira }}</span>
              </div>
              @if ((previewFiling()!.minimumTax ?? 0) > (previewFiling()!.netTaxPayable ?? 0)) {
                <div class="breakdown-row breakdown-row--deduct">
                  <span>Minimum Tax (1% of Gross)</span>
                  <span class="financial-value">{{ previewFiling()!.minimumTax | naira }}</span>
                </div>
              }
            </div>
            <div class="preview-total">
              <span>Final Tax Payable</span>
              <span class="financial-value">{{ previewFiling()!.finalTaxPayable | naira }}</span>
            </div>
          </div>

          <!-- Entry counts -->
          <div class="preview-section">
            <div class="preview-section__title">Contents</div>
            <div class="preview-counts">
              <div class="preview-count-chip">
                <span class="preview-count-chip__value">{{ previewCounts().income }}</span>
                <span>Income entries</span>
              </div>
              <div class="preview-count-chip">
                <span class="preview-count-chip__value">{{ previewCounts().allowances }}</span>
                <span>Capital allowances</span>
              </div>
              <div class="preview-count-chip">
                <span class="preview-count-chip__value">{{ previewCounts().reliefs }}</span>
                <span>Relief entries</span>
              </div>
              <div class="preview-count-chip">
                <span class="preview-count-chip__value">{{ previewCounts().documents }}</span>
                <span>Attached documents</span>
              </div>
            </div>
          </div>

          <div class="flex gap-3" style="margin-top:var(--space-5)">
            <button class="btn btn--ghost flex-1" (click)="closePreview()">Close</button>
            <button class="btn btn--primary flex-1" (click)="proceedToExport()">
              Download Export →
            </button>
          </div>
        </div>
      </div>
    }


    <!-- Export modal -->
    @if (exportFiling()) {
      <div class="modal-overlay" (click)="closeExport()">
        <div class="modal" (click)="$event.stopPropagation()">
          <h3 class="title-md" style="margin-bottom:var(--space-4)">Export Filing</h3>
          <p class="body-sm text-muted" style="margin-bottom:var(--space-5)">
            YOA {{ exportFiling()!.yearOfAssessment }} · {{ exportFiling()!.filingReference }}
          </p>

          <div class="form-group" style="margin-bottom:var(--space-4)">
            <label class="form-label">Format</label>
            <div class="format-selector">
              @for (fmt of formats; track fmt.value) {
                <button
                  class="format-btn"
                  [class.active]="exportFormat === fmt.value"
                  (click)="exportFormat = fmt.value"
                >{{ fmt.label }}</button>
              }
            </div>
          </div>

          <div class="toggle-label" style="margin-bottom:var(--space-5)">
            <input type="checkbox" [(ngModel)]="includeAttachments" />
            <span>Include attachments <span class="text-muted" style="font-size:var(--text-label-sm)">(images embedded · PDFs appended)</span></span>
          </div>

          <div class="security-badges">
            <span class="badge badge--confirmed"><lucide-icon name="lock" [size]="12" [strokeWidth]="2" style="vertical-align:middle;margin-right:3px"></lucide-icon>End-to-end Encrypted</span>
            <span class="badge badge--confirmed"><lucide-icon name="check" [size]="12" [strokeWidth]="2.5" style="vertical-align:middle;margin-right:3px"></lucide-icon>LIRS Compliant Generation</span>
          </div>

          <div class="flex gap-3" style="margin-top:var(--space-6)">
            <button class="btn btn--ghost flex-1" (click)="closeExport()">Cancel</button>
            <button class="btn btn--primary flex-1" (click)="doExport()" [disabled]="exporting()">
              @if (exporting()) { Exporting… } @else { Download Export }
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Reference Panel -->
    <lf-lirs-reference-panel
      [visible]="showReferencePanel()"
      [fieldGroups]="referenceFields()"
      [statusMessage]="referenceStatus()"
      [showMarkSubmitted]="!!activeLirsFiling()"
      (close)="closeReferencePanel()"
      (markSubmitted)="onReferenceMarkSubmitted()"
    />
  `,
  styles: [`
    .history-page { max-width: var(--content-max-width); margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-6); }
    .history-page__header { display: flex; align-items: center; justify-content: space-between; }

    .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4); }
    .metric-card {
      background: var(--color-surface-container-lowest); border-radius: var(--radius-xl);
      box-shadow: var(--shadow-card); padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-1);
    }
    .metric-card--submitted .metric-card__value { color: var(--color-success); }
    .metric-card--confirmed .metric-card__value { color: var(--color-secondary); }
    .metric-card--draft .metric-card__value { color: var(--color-on-surface-variant); }
    .metric-card__value { font-family: var(--font-display); }
    .metric-card__label { font-size: var(--text-label-md); color: var(--color-on-surface-variant); }

    .history-filters { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: flex-end; }

    .action-group { display: flex; justify-content: flex-end; gap: var(--space-1); flex-wrap: wrap; }

    .pagination {
      display: flex; align-items: center; justify-content: center; gap: var(--space-4);
      padding: var(--space-4); border-top: 1px solid var(--color-surface-container);
    }

    .format-selector { display: flex; gap: var(--space-2); }
    .format-btn {
      padding: var(--space-2) var(--space-4); border-radius: var(--radius-lg);
      background: var(--color-surface-container-low); border: none; cursor: pointer;
      font-size: var(--text-body-sm); font-weight: var(--font-weight-medium);
      transition: all var(--transition-fast);
      &.active { background: var(--color-primary); color: white; }
    }

    .security-badges { display: flex; gap: var(--space-2); flex-wrap: wrap; }

    .modal--sm { max-width: 420px; text-align: center; }
    .modal--preview { max-width: 580px; }
    .preview-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-5); }
    .preview-section { margin-bottom: var(--space-4); }
    .preview-section__title {
      font-size: var(--text-label-md); font-weight: var(--font-weight-semibold);
      color: var(--color-on-surface-variant); text-transform: uppercase; letter-spacing: 0.05em;
      margin-bottom: var(--space-3);
    }
    .breakdown-table { display: flex; flex-direction: column; gap: var(--space-1); }
    .breakdown-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: var(--space-2) var(--space-3); border-radius: var(--radius-md);
      font-size: var(--text-body-sm);
    }
    .breakdown-row--deduct { color: var(--color-error); }
    .breakdown-row--subtotal { background: var(--color-surface-container-low); font-weight: var(--font-weight-medium); }
    .preview-total {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: var(--space-3); padding: var(--space-3) var(--space-4);
      background: var(--color-primary-container); color: var(--color-on-primary-container);
      border-radius: var(--radius-lg); font-weight: var(--font-weight-bold);
      font-size: var(--text-body-md);
    }
    .preview-counts { display: flex; gap: var(--space-3); flex-wrap: wrap; }
    .preview-count-chip {
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      padding: var(--space-3) var(--space-4);
      background: var(--color-surface-container-low); border-radius: var(--radius-lg);
      font-size: var(--text-label-sm); color: var(--color-on-surface-variant);
      flex: 1; min-width: 80px; text-align: center;
    }
    .preview-count-chip__value {
      font-size: var(--text-title-md); font-weight: var(--font-weight-bold);
      color: var(--color-on-surface);
    }
    .delete-modal__icon { font-size: 2rem; margin-bottom: var(--space-3); }
  `],
})
export class FilingHistoryComponent implements OnInit {
  private filingService = inject(FilingService);
  private lirsService = inject(LIRSService);
  private toast = inject(ToastService);

  allFilings = signal<Filing[]>([]);
  filtered = signal<Filing[]>([]);
  loading = signal(true);
  exportFiling = signal<Filing | null>(null);
  exporting = signal(false);
  deletingFiling = signal<Filing | null>(null);
  deleting = signal(false);
  previewFiling = signal<Filing | null>(null);
  previewCounts = signal({ income: 0, allowances: 0, reliefs: 0, documents: 0 });

  searchQuery = '';
  statusFilter = '';
  yearFilter: number | null = null;
  exportFormat: ExportFormat = 'pdf';
  includeAttachments = false;

  page = signal(1);
  readonly pageSize = 10;

  showReferencePanel = signal(false);
  referenceFields = signal<LIRSFieldGroup[]>([]);
  referenceStatus = signal('');
  activeLirsFiling = signal<Filing | null>(null);
  lirsActionLoading = signal(false);

  readonly formats = [
    { value: 'pdf' as ExportFormat, label: 'PDF' },
    { value: 'csv' as ExportFormat, label: 'CSV' },
    { value: 'json' as ExportFormat, label: 'JSON' },
  ];

  totalFilings  = computed(() => this.allFilings().length);
  submittedCount = computed(() => this.allFilings().filter(f => f.status === 'Submitted').length);
  confirmedCount = computed(() => this.allFilings().filter(f => f.status === 'Confirmed').length);
  draftCount     = computed(() => this.allFilings().filter(f => f.status === 'Draft').length);
  totalPages     = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  paginated      = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });

  async ngOnInit(): Promise<void> {
    try {
      const all = await this.filingService.listFilings();
      this.allFilings.set(all);
      this.filtered.set(all);
    } finally {
      this.loading.set(false);
    }
  }

  applyFilter(): void {
    this.page.set(1);
    let result = this.allFilings();
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(f =>
        (f.filingReference ?? '').toLowerCase().includes(q) ||
        String(f.yearOfAssessment).includes(q)
      );
    }
    if (this.statusFilter) {
      result = result.filter(f => f.status === this.statusFilter);
    }
    if (this.yearFilter) {
      result = result.filter(f => f.yearOfAssessment === +this.yearFilter!);
    }
    this.filtered.set(result);
  }

  openExport(f: Filing): void { this.exportFiling.set(f); }
  closeExport(): void { this.exportFiling.set(null); }

  async openPreview(f: Filing): Promise<void> {
    this.previewFiling.set(f);
    try {
      const [income, allowances, reliefs] = await Promise.all([
        this.filingService.listIncomeEntries(f.id),
        this.filingService.listAllowances(f.id),
        this.filingService.listReliefEntries(f.id),
      ]);
      const documents = [
        ...income.flatMap(e => e.documents),
        ...allowances.flatMap(e => e.documents),
        ...reliefs.flatMap(e => e.documents),
      ].length;
      this.previewCounts.set({ income: income.length, allowances: allowances.length, reliefs: reliefs.length, documents });
    } catch { /* counts stay at 0 */ }
  }
  closePreview(): void { this.previewFiling.set(null); }
  proceedToExport(): void {
    const f = this.previewFiling();
    if (f) { this.closePreview(); this.openExport(f); }
  }

  openDelete(f: Filing): void { this.deletingFiling.set(f); }
  closeDelete(): void { this.deletingFiling.set(null); }

  async confirmDelete(): Promise<void> {
    const f = this.deletingFiling();
    if (!f) return;
    this.deleting.set(true);
    try {
      await this.filingService.deleteFiling(f.id);
      const all = await this.filingService.listFilings();
      this.allFilings.set(all);
      this.applyFilter();
      this.closeDelete();
    } finally {
      this.deleting.set(false);
    }
  }

  async duplicate(id: string): Promise<void> {
    try {
      await this.filingService.duplicateFiling(id);
      const all = await this.filingService.listFilings();
      this.allFilings.set(all);
      this.applyFilter();
      this.toast.success('Filing duplicated as a new Draft.');
    } catch (err: unknown) {
      this.toast.error('Duplicate failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async amend(id: string): Promise<void> {
    try {
      await this.filingService.amendFiling(id);
      const all = await this.filingService.listFilings();
      this.allFilings.set(all);
      this.applyFilter();
      this.toast.success('Amendment draft created. Open it to continue editing.');
    } catch (err: unknown) {
      this.toast.error('Amend failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async markSubmitted(id: string): Promise<void> {
    try {
      await this.filingService.markSubmitted(id);
      const all = await this.filingService.listFilings();
      this.allFilings.set(all);
      this.applyFilter();
      this.toast.success('Filing marked as Submitted.');
    } catch (err: unknown) {
      this.toast.error('Failed to mark as submitted: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async fileWithLirs(f: Filing): Promise<void> {
    this.lirsActionLoading.set(true);
    this.activeLirsFiling.set(f);
    try {
      const res = await this.lirsService.fileWithLirs(f.id);
      if (res.fallbackActive) {
        this.toast.warning(res.message);
        this.openReferencePanelForFiling(f);
      } else {
        this.toast.success(res.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.toast.error('Failed to open LIRS portal: ' + msg);
      this.openReferencePanelForFiling(f);
      this.referenceStatus.set('Could not open LIRS portal. Use the values below to fill Form A manually.');
    } finally {
      this.lirsActionLoading.set(false);
    }
  }

  private async openReferencePanelForFiling(f: Filing): Promise<void> {
    this.activeLirsFiling.set(f);
    try {
      const result = await this.filingService.compute(f.id);
      const [incomeEntries, allowances, reliefs] = await Promise.all([
        this.filingService.listIncomeEntries(f.id),
        this.filingService.listAllowances(f.id),
        this.filingService.listReliefEntries(f.id),
      ]);
      const groups = this.lirsService.buildReferenceFields(
        f, incomeEntries, allowances, reliefs, result,
      );
      this.referenceFields.set(groups);
      this.showReferencePanel.set(true);
    } catch {
      this.referenceFields.set([]);
      this.showReferencePanel.set(true);
    }
  }

  closeReferencePanel(): void {
    this.showReferencePanel.set(false);
    this.activeLirsFiling.set(null);
  }

  async onReferenceMarkSubmitted(): Promise<void> {
    const f = this.activeLirsFiling();
    if (!f) return;
    try {
      await this.filingService.markSubmitted(f.id);
      const all = await this.filingService.listFilings();
      this.allFilings.set(all);
      this.applyFilter();
      this.showReferencePanel.set(false);
      this.activeLirsFiling.set(null);
      this.toast.success('Filing marked as Submitted.');
    } catch (err: unknown) {
      this.toast.error('Failed to mark as submitted: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async doExport(): Promise<void> {
    const f = this.exportFiling();
    if (!f) return;
    this.exporting.set(true);
    try {
      const ref = f.filingReference ?? `YOA${f.yearOfAssessment}`;
      const ext = this.exportFormat === 'pdf' ? 'pdf' : this.exportFormat === 'csv' ? 'csv' : 'json';
      const home = await homeDir();
      const defaultPath = await join(home, 'LagosFile', 'exports', `LagosFile_${ref}.${ext}`);

      const chosen = await saveDialog({
        defaultPath,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      });
      if (!chosen) return;

      let savedPath: string;
      if (this.exportFormat === 'pdf') {
        savedPath = await this.filingService.exportPdf(f.id, chosen, this.includeAttachments);
      } else if (this.exportFormat === 'csv') {
        savedPath = await this.filingService.exportCsv(f.id, chosen);
      } else {
        savedPath = await this.filingService.exportJson(f.id, chosen);
      }

      await invoke('open_file', { path: savedPath });
      this.closeExport();
      this.toast.success('Export saved successfully.');
    } catch (err) {
      this.toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.exporting.set(false);
    }
  }
}
