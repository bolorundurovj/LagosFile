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

  // ── Computation ──────────────────────────────────────────

  async compute(filingId: string): Promise<ComputationResult> {
    return this.tauri.invoke<ComputationResult>('compute_filing', { filingId });
  }

  // ── Export ───────────────────────────────────────────────

  async exportPdf(filingId: string, includeAttachments: boolean): Promise<string> {
    return this.tauri.invoke<string>('export_filing_pdf', { filingId, includeAttachments });
  }

  async exportCsv(filingId: string): Promise<string> {
    return this.tauri.invoke<string>('export_filing_csv', { filingId });
  }

  async exportJson(filingId: string): Promise<string> {
    return this.tauri.invoke<string>('export_filing_json', { filingId });
  }

  // ── Wizard state helpers ─────────────────────────────────

  initWizard(yearOfAssessment: number, filingId?: string): void {
    this._wizard.set({
      filingId,
      yearOfAssessment,
      currentStep: 1,
      incomeEntries: [],
      capitalAllowances: [],
      reliefEntries: [],
      isDirty: false,
    });
  }

  updateWizardStep(step: 1 | 2 | 3 | 4): void {
    const w = this._wizard();
    if (w) this._wizard.set({ ...w, currentStep: step });
  }

  clearWizard(): void {
    this._wizard.set(null);
  }

  // ── Deadline helpers ─────────────────────────────────────

  daysUntilDeadline(year: number): number {
    const deadline = new Date(year, 2, 31); // March 31
    const today = new Date();
    const ms = deadline.getTime() - today.getTime();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  }

  isWithinDeadlineWindow(year: number): boolean {
    const days = this.daysUntilDeadline(year);
    return days >= 0 && days <= 45;
  }
}
