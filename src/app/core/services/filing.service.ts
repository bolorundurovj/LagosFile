import { Injectable, signal } from '@angular/core';
import { TauriService } from './tauri.service';
import {
  Filing, IncomeEntry, CapitalAllowance, ReliefEntry,
  ComputationResult, WizardState
} from '../models';

@Injectable({ providedIn: 'root' })
export class FilingService {
  private readonly _wizard = signal<WizardState | null>(null);
  readonly wizard = this._wizard.asReadonly();

  constructor(private tauri: TauriService) {}

  // ── Filing CRUD ──────────────────────────────────────────

  async listFilings(): Promise<Filing[]> {
    return this.tauri.invoke<Filing[]>('list_filings');
  }

  async getFiling(id: string): Promise<Filing> {
    return this.tauri.invoke<Filing>('get_filing', { id });
  }

  async createDraft(yearOfAssessment: number): Promise<Filing> {
    return this.tauri.invoke<Filing>('create_draft_filing', { yearOfAssessment });
  }

  async confirmFiling(id: string, result: ComputationResult): Promise<Filing> {
    return this.tauri.invoke<Filing>('confirm_filing', { id, result });
  }

  async markSubmitted(id: string): Promise<Filing> {
    return this.tauri.invoke<Filing>('mark_filing_submitted', { id });
  }

  async deleteFiling(id: string): Promise<void> {
    return this.tauri.invoke('delete_filing', { id });
  }

  async duplicateFiling(id: string): Promise<Filing> {
    return this.tauri.invoke<Filing>('duplicate_filing', { id });
  }

  async amendFiling(id: string): Promise<Filing> {
    return this.tauri.invoke<Filing>('amend_filing', { id });
  }

  // ── Income entries ───────────────────────────────────────

  async listIncomeEntries(filingId: string): Promise<IncomeEntry[]> {
    return this.tauri.invoke<IncomeEntry[]>('list_income_entries', { filingId });
  }

  async upsertIncomeEntry(entry: Partial<IncomeEntry> & { filingId: string }): Promise<IncomeEntry> {
    return this.tauri.invoke<IncomeEntry>('upsert_income_entry', { entry });
  }

  async deleteIncomeEntry(id: string): Promise<void> {
    return this.tauri.invoke('delete_income_entry', { id });
  }

  // ── Capital allowances ───────────────────────────────────

  async listAllowances(filingId: string): Promise<CapitalAllowance[]> {
    return this.tauri.invoke<CapitalAllowance[]>('list_allowances', { filingId });
  }

  async upsertAllowance(entry: Partial<CapitalAllowance> & { filingId: string }): Promise<CapitalAllowance> {
    return this.tauri.invoke<CapitalAllowance>('upsert_allowance', { entry });
  }

  async deleteAllowance(id: string): Promise<void> {
    return this.tauri.invoke('delete_allowance', { id });
  }

  // ── Relief entries ───────────────────────────────────────

  async listReliefEntries(filingId: string): Promise<ReliefEntry[]> {
    return this.tauri.invoke<ReliefEntry[]>('list_relief_entries', { filingId });
  }

  async upsertReliefEntry(entry: Partial<ReliefEntry> & { filingId: string }): Promise<ReliefEntry> {
    return this.tauri.invoke<ReliefEntry>('upsert_relief_entry', { entry });
  }

  async deleteReliefEntry(id: string): Promise<void> {
    return this.tauri.invoke('delete_relief_entry', { id });
  }

  // ── Documents ────────────────────────────────────────────

  async attachDocument(
    parentEntryId: string,
    parentEntryType: string,
    filePath: string,
    fileName: string,
    fileType: string,
    fileSizeBytes: number,
  ): Promise<void> {
    return this.tauri.invoke('attach_document', {
      parentEntryId, parentEntryType, filePath, fileName, fileType, fileSizeBytes,
    });
  }

  async listDocuments(parentEntryId: string): Promise<unknown[]> {
    return this.tauri.invoke<unknown[]>('list_documents', { parentEntryId });
  }

  async deleteDocument(id: string): Promise<void> {
    return this.tauri.invoke('delete_document', { id });
  }

  // ── Computation ──────────────────────────────────────────

  async compute(filingId: string): Promise<ComputationResult> {
    return this.tauri.invoke<ComputationResult>('compute_filing', { filingId });
  }

  // ── Export ───────────────────────────────────────────────

  async exportPdf(filingId: string, savePath: string, includeAttachments: boolean, letterheadStyle: 'single' | 'alt-fills' = 'single'): Promise<string> {
    return this.tauri.invoke<string>('export_filing_pdf', { filingId, savePath, includeAttachments, letterheadStyle });
  }

  async exportCsv(filingId: string, savePath: string): Promise<string> {
    return this.tauri.invoke<string>('export_filing_csv', { filingId, savePath });
  }

  async exportJson(filingId: string, savePath: string): Promise<string> {
    return this.tauri.invoke<string>('export_filing_json', { filingId, savePath });
  }

  // ── Wizard state helpers ─────────────────────────────────

  initWizard(yearOfAssessment: number, filingId: string): void {
    this._wizard.set({
      yearOfAssessment, filingId,
      currentStep: 1,
      incomeEntries: [], capitalAllowances: [], reliefEntries: [],
      isDirty: false,
    });
  }

  updateWizardStep(step: 1 | 2 | 3 | 4): void {
    this._wizard.update(w => w ? { ...w, currentStep: step } : null);
  }

  clearWizard(): void {
    this._wizard.set(null);
  }

  // ── Deadline helpers ──────────────────────────────────────

  /** Returns the number of days until the 31 March deadline for the given YOA. */
  daysUntilDeadline(yearOfAssessment: number): number {
    const deadline = new Date(yearOfAssessment + 1, 2, 31); // 31 March of following year
    const now = new Date();
    return Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  /** Returns true if today falls within 90 days of the filing deadline. */
  isWithinDeadlineWindow(yearOfAssessment: number): boolean {
    return this.daysUntilDeadline(yearOfAssessment) <= 90;
  }
}
