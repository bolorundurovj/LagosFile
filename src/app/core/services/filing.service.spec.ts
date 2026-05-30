import { TestBed } from '@angular/core/testing';
import { FilingService } from './filing.service';
import { TauriService } from './tauri.service';
import { Filing } from '../models';

describe('FilingService', () => {
  let service: FilingService;
  let tauriSpy: jasmine.SpyObj<TauriService>;

  const mockFiling: Filing = {
    id: 'filing-123',
    taxpayerId: 'taxpayer-123',
    yearOfAssessment: 2025,
    status: 'Draft',
    createdAt: new Date().toISOString(),
    taxConfigVersion: '2025-v1'
  };

  beforeEach(() => {
    const spy = jasmine.createSpyObj('TauriService', ['invoke']);

    TestBed.configureTestingModule({
      providers: [
        FilingService,
        { provide: TauriService, useValue: spy }
      ]
    });

    service = TestBed.inject(FilingService);
    tauriSpy = TestBed.inject(TauriService) as jasmine.SpyObj<TauriService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Filing Operations', () => {
    it('should list filings', async () => {
      tauriSpy.invoke.and.resolveTo([mockFiling]);
      const result = await service.listFilings();
      expect(tauriSpy.invoke).toHaveBeenCalledWith('list_filings');
      expect(result).toEqual([mockFiling]);
    });

    it('should create draft filing', async () => {
      tauriSpy.invoke.and.resolveTo(mockFiling);
      const result = await service.createDraft(2025);
      expect(tauriSpy.invoke).toHaveBeenCalledWith('create_draft_filing', { yearOfAssessment: 2025 });
      expect(result).toEqual(mockFiling);
    });

    it('should confirm filing', async () => {
      const mockResult = { finalTaxPayable: 1000 } as any;
      tauriSpy.invoke.and.resolveTo(mockFiling);
      await service.confirmFiling('id', mockResult);
      expect(tauriSpy.invoke).toHaveBeenCalledWith('confirm_filing', { id: 'id', result: mockResult });
    });

    it('should mark filing as submitted', async () => {
      tauriSpy.invoke.and.resolveTo(mockFiling);
      await service.markSubmitted('id');
      expect(tauriSpy.invoke).toHaveBeenCalledWith('mark_filing_submitted', { id: 'id' });
    });

    it('should delete filing', async () => {
      tauriSpy.invoke.and.resolveTo();
      await service.deleteFiling('id');
      expect(tauriSpy.invoke).toHaveBeenCalledWith('delete_filing', { id: 'id' });
    });

    it('should duplicate filing', async () => {
      tauriSpy.invoke.and.resolveTo(mockFiling);
      await service.duplicateFiling('id');
      expect(tauriSpy.invoke).toHaveBeenCalledWith('duplicate_filing', { id: 'id' });
    });

    it('should amend filing', async () => {
      tauriSpy.invoke.and.resolveTo(mockFiling);
      await service.amendFiling('id');
      expect(tauriSpy.invoke).toHaveBeenCalledWith('amend_filing', { id: 'id' });
    });
  });

  describe('Entry Operations', () => {
    it('should list income entries', async () => {
      tauriSpy.invoke.and.resolveTo([]);
      await service.listIncomeEntries('filing-id');
      expect(tauriSpy.invoke).toHaveBeenCalledWith('list_income_entries', { filingId: 'filing-id' });
    });

    it('should upsert income entry', async () => {
      const entry = { filingId: 'id', incomeType: 'test' } as any;
      tauriSpy.invoke.and.resolveTo(entry);
      await service.upsertIncomeEntry(entry);
      expect(tauriSpy.invoke).toHaveBeenCalledWith('upsert_income_entry', { entry });
    });

    it('should delete income entry', async () => {
      tauriSpy.invoke.and.resolveTo();
      await service.deleteIncomeEntry('id');
      expect(tauriSpy.invoke).toHaveBeenCalledWith('delete_income_entry', { id: 'id' });
    });

    it('should list allowances', async () => {
      tauriSpy.invoke.and.resolveTo([]);
      await service.listAllowances('id');
      expect(tauriSpy.invoke).toHaveBeenCalledWith('list_allowances', { filingId: 'id' });
    });

    it('should upsert allowance', async () => {
      const entry = { filingId: 'id' } as any;
      tauriSpy.invoke.and.resolveTo(entry);
      await service.upsertAllowance(entry);
      expect(tauriSpy.invoke).toHaveBeenCalledWith('upsert_allowance', { entry });
    });

    it('should delete allowance', async () => {
      tauriSpy.invoke.and.resolveTo();
      await service.deleteAllowance('id');
      expect(tauriSpy.invoke).toHaveBeenCalledWith('delete_allowance', { id: 'id' });
    });

    it('should list relief entries', async () => {
      tauriSpy.invoke.and.resolveTo([]);
      await service.listReliefEntries('id');
      expect(tauriSpy.invoke).toHaveBeenCalledWith('list_relief_entries', { filingId: 'id' });
    });

    it('should upsert relief entry', async () => {
      const entry = { filingId: 'id' } as any;
      tauriSpy.invoke.and.resolveTo(entry);
      await service.upsertReliefEntry(entry);
      expect(tauriSpy.invoke).toHaveBeenCalledWith('upsert_relief_entry', { entry });
    });

    it('should delete relief entry', async () => {
      tauriSpy.invoke.and.resolveTo();
      await service.deleteReliefEntry('id');
      expect(tauriSpy.invoke).toHaveBeenCalledWith('delete_relief_entry', { id: 'id' });
    });
  });

  describe('Document & Export Operations', () => {
    it('should attach document', async () => {
      tauriSpy.invoke.and.resolveTo();
      await service.attachDocument('id', 'type', 'path', 'name', 'mime', 100);
      expect(tauriSpy.invoke).toHaveBeenCalledWith('attach_document', jasmine.any(Object));
    });

    it('should list documents', async () => {
      tauriSpy.invoke.and.resolveTo([]);
      await service.listDocuments('id');
      expect(tauriSpy.invoke).toHaveBeenCalledWith('list_documents', { parentEntryId: 'id' });
    });

    it('should delete document', async () => {
      tauriSpy.invoke.and.resolveTo();
      await service.deleteDocument('id');
      expect(tauriSpy.invoke).toHaveBeenCalledWith('delete_document', { id: 'id' });
    });

    it('should compute filing', async () => {
      tauriSpy.invoke.and.resolveTo({} as any);
      await service.compute('id');
      expect(tauriSpy.invoke).toHaveBeenCalledWith('compute_filing', { filingId: 'id' });
    });

    it('should export PDF', async () => {
      tauriSpy.invoke.and.resolveTo('path');
      await service.exportPdf('id', 'save', true);
      expect(tauriSpy.invoke).toHaveBeenCalledWith('export_filing_pdf', jasmine.any(Object));
    });

    it('should export CSV', async () => {
      tauriSpy.invoke.and.resolveTo('path');
      await service.exportCsv('id', 'save');
      expect(tauriSpy.invoke).toHaveBeenCalledWith('export_filing_csv', jasmine.any(Object));
    });

    it('should export JSON', async () => {
      tauriSpy.invoke.and.resolveTo('path');
      await service.exportJson('id', 'save');
      expect(tauriSpy.invoke).toHaveBeenCalledWith('export_filing_json', jasmine.any(Object));
    });
  });

  describe('Wizard State', () => {
    it('should initialize wizard', () => {
      service.initWizard(2025, 'filing-123');
      const state = service.wizard();
      expect(state).not.toBeNull();
      expect(state?.yearOfAssessment).toBe(2025);
      expect(state?.currentStep).toBe(1);
    });

    it('should update wizard step', () => {
      service.initWizard(2025, 'filing-123');
      service.updateWizardStep(2);
      expect(service.wizard()?.currentStep).toBe(2);
    });

    it('should clear wizard', () => {
      service.initWizard(2025, 'filing-123');
      service.clearWizard();
      expect(service.wizard()).toBeNull();
    });
  });

  describe('Deadline Helpers', () => {
    it('should calculate days until deadline (March 31)', () => {
      // Mock "today" to be Feb 1, 2026 (for YOA 2025)
      jasmine.clock().install();
      jasmine.clock().mockDate(new Date(2026, 1, 1)); 

      const days = service.daysUntilDeadline(2025);
      // Feb has 28 days in 2026. From Feb 1 to March 31: 28 days in Feb + 30 days in March (since deadline is midnight) = 58.
      expect(days).toBe(58);

      jasmine.clock().uninstall();
    });

    it('should detect if within deadline window (90 days)', () => {
      jasmine.clock().install();
      jasmine.clock().mockDate(new Date(2026, 0, 15)); // Jan 15, 2026

      const isWithin = service.isWithinDeadlineWindow(2025);
      // Jan 15 to March 31 is < 90 days. (16 in Jan + 28 in Feb + 31 in March = 75)
      expect(isWithin).toBeTrue();

      jasmine.clock().uninstall();
    });
  });
});
