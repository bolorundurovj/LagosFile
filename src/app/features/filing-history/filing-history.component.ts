import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe, LowerCasePipe } from '@angular/common';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { homeDir, join } from '@tauri-apps/api/path';
import { FilingService } from '../../core/services/filing.service';
import { Filing } from '../../core/models';
import { NairaPipe } from '../../shared/pipes/naira.pipe';

type ExportFormat = 'pdf' | 'csv' | 'json';

@Component({
  selector: 'lf-filing-history',
  standalone: true,
  imports: [FormsModule, RouterLink, NairaPipe, DatePipe, LowerCasePipe],
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
            <div style="font-size:2.5rem;margin-bottom:var(--space-3)">📋</div>
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
                        <button class="btn btn--secondary btn--sm" (click)="openExport(f)">Export</button>
                        <button class="btn btn--ghost btn--sm" (click)="duplicate(f.id)">Duplicate</button>
                        <button class="btn btn--ghost btn--sm" (click)="amend(f.id)">Amend</button>
                      }
                      @if (f.status === 'Confirmed') {
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
          <div class="delete-modal__icon">🗑️</div>
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
            <span>Include attachment references</span>
          </div>

          <div class="security-badges">
            <span class="badge badge--confirmed">🔒 End-to-end Encrypted</span>
            <span class="badge badge--confirmed">✓ LIRS Compliant Generation</span>
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
    .delete-modal__icon { font-size: 2rem; margin-bottom: var(--space-3); }
  `],
})
export class FilingHistoryComponent implements OnInit {
  private filingService = inject(FilingService);

  allFilings = signal<Filing[]>([]);
  filtered = signal<Filing[]>([]);
  loading = signal(true);
  exportFiling = signal<Filing | null>(null);
  exporting = signal(false);
  deletingFiling = signal<Filing | null>(null);
  deleting = signal(false);

  searchQuery = '';
  statusFilter = '';
  yearFilter: number | null = null;
  exportFormat: ExportFormat = 'pdf';
  includeAttachments = false;

  page = signal(1);
  readonly pageSize = 10;

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
    await this.filingService.duplicateFiling(id);
    const all = await this.filingService.listFilings();
    this.allFilings.set(all);
    this.applyFilter();
  }

  async amend(id: string): Promise<void> {
    const f = await this.filingService.amendFiling(id);
    const all = await this.filingService.listFilings();
    this.allFilings.set(all);
    this.applyFilter();
  }

  async markSubmitted(id: string): Promise<void> {
    await this.filingService.markSubmitted(id);
    const all = await this.filingService.listFilings();
    this.allFilings.set(all);
    this.applyFilter();
  }

  async doExport(): Promise<void> {
    const f = this.exportFiling();
    if (!f) return;
    this.exporting.set(true);
    try {
      const ref = f.filingReference ?? `YOA${f.yearOfAssessment}`;
      const ext  = this.exportFormat === 'pdf' ? 'pdf' : this.exportFormat === 'csv' ? 'csv' : 'json';
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

      await shellOpen(savedPath);
      this.closeExport();
    } catch (err) {
      alert(`Export failed: ${err}`);
    } finally {
      this.exporting.set(false);
    }
  }
}
