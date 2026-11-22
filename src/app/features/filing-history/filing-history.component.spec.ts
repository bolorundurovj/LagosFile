import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FilingHistoryComponent } from './filing-history.component';
import { FilingService } from '../../core/services/filing.service';
import { LIRSService } from '../../core/services/lirs.service';
import { ToastService } from '../../core/services/toast.service';
import { Filing } from '../../core/models';
import { LUCIDE_ICONS, LucideIconProvider, icons, BarChart2, MoreVertical } from 'lucide-angular';

describe('FilingHistoryComponent', () => {
  let filingServiceSpy: jasmine.SpyObj<FilingService>;
  let lirsServiceSpy: jasmine.SpyObj<LIRSService>;
  let toastSpy: jasmine.SpyObj<ToastService>;

  const sampleFiling: Filing = {
    id: 'f-1',
    taxpayerId: 'tp-1',
    yearOfAssessment: 2025,
    status: 'Confirmed',
    filingReference: 'LIRS/REF/2025/00001',
    createdAt: '2026-01-01T00:00:00Z',
    confirmedAt: '2026-01-02T00:00:00Z',
    totalIncomeNgn: 5_000_000,
    finalTaxPayable: 690_000,
    taxConfigVersion: 'NTA 2025',
  };

  beforeEach(async () => {
    filingServiceSpy = jasmine.createSpyObj('FilingService', [
      'listFilings',
      'listIncomeEntries',
      'listAllowances',
      'listReliefEntries',
      'deleteFiling',
      'duplicateFiling',
      'amendFiling',
      'markSubmitted',
      'recordPayment',
    ]);
    lirsServiceSpy = jasmine.createSpyObj('LIRSService', [
      'fileWithLirs',
      'openLirsPortalAll',
      'buildReferenceFields',
    ]);
    toastSpy = jasmine.createSpyObj('ToastService', ['error', 'success', 'info', 'warning']);

    filingServiceSpy.listFilings.and.resolveTo([sampleFiling]);
    filingServiceSpy.listIncomeEntries.and.resolveTo([]);
    filingServiceSpy.listAllowances.and.resolveTo([]);
    filingServiceSpy.listReliefEntries.and.resolveTo([]);

    await TestBed.configureTestingModule({
      imports: [FilingHistoryComponent],
      providers: [
        provideRouter([]),
        { provide: FilingService, useValue: filingServiceSpy },
        { provide: LIRSService, useValue: lirsServiceSpy },
        { provide: ToastService, useValue: toastSpy },
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({ ...icons, BarChart2, MoreVertical }),
        },
      ],
    }).compileComponents();
  });

  it('openPreview reports only non-zero or documented reliefs', async () => {
    filingServiceSpy.listReliefEntries.and.resolveTo([
      { id: 'r1', filingId: 'f-1', reliefType: 'pension', claimedAmount: 400_000, approvedAmount: 400_000, documents: [] },
      { id: 'r2', filingId: 'f-1', reliefType: 'nhis', claimedAmount: 0, approvedAmount: 0, documents: [] },
      { id: 'r3', filingId: 'f-1', reliefType: 'nhf', claimedAmount: 0, approvedAmount: 0, documents: [] },
      { id: 'r4', filingId: 'f-1', reliefType: 'life_assurance', claimedAmount: 0, approvedAmount: 0, documents: [] },
      { id: 'r5', filingId: 'f-1', reliefType: 'rent', claimedAmount: 0, approvedAmount: 0, documents: [] },
      { id: 'r6', filingId: 'f-1', reliefType: 'paye', claimedAmount: 0, approvedAmount: 0, documents: [] },
    ]);

    const fixture = TestBed.createComponent(FilingHistoryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    await fixture.componentInstance.openPreview(sampleFiling);
    expect(fixture.componentInstance.previewCounts().reliefs).toBe(1);
  });

  it('pagination shows rows 11-20 on page 2 and resets to page 1 only when a filter changes', async () => {
    const twentyFive: Filing[] = Array.from({ length: 25 }, (_, i) => ({
      ...sampleFiling,
      id: `f-${i + 1}`,
      yearOfAssessment: 2025 - i,
      filingReference: `LIRS/REF/${2025 - i}/00001`,
    }));
    filingServiceSpy.listFilings.and.resolveTo(twentyFive);

    const fixture = TestBed.createComponent(FilingHistoryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.currentPage).toBe(1);
    expect(comp.totalPages).toBe(3);
    expect(comp.displayedFilings().map(f => f.id)).toEqual(twentyFive.slice(0, 10).map(f => f.id));

    comp.nextPage();
    expect(comp.currentPage).toBe(2);
    expect(comp.displayedFilings().map(f => f.id)).toEqual(twentyFive.slice(10, 20).map(f => f.id));

    // Changing search filter resets to page 1
    comp.onSearchChange('2025');
    expect(comp.currentPage).toBe(1);
    expect(comp.displayedFilings().length).toBe(1);
  });

  it('filters by search query, status, and year and exposes appropriate actions per status', async () => {
    const draft: Filing = { ...sampleFiling, id: 'f-draft', yearOfAssessment: 2024, status: 'Draft', filingReference: undefined };
    const submitted: Filing = { ...sampleFiling, id: 'f-sub', yearOfAssessment: 2023, status: 'Submitted', filingReference: 'LIRS/REF/2023/00009' };
    filingServiceSpy.listFilings.and.resolveTo([sampleFiling, draft, submitted]);

    const fixture = TestBed.createComponent(FilingHistoryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.displayedFilings().length).toBe(3);

    comp.onSearchChange('00009');
    expect(comp.displayedFilings().map(f => f.id)).toEqual(['f-sub']);

    comp.onSearchChange('');
    comp.onStatusChange('Draft');
    expect(comp.displayedFilings().map(f => f.id)).toEqual(['f-draft']);

    comp.onStatusChange('');
    comp.onYearChange('2025');
    expect(comp.displayedFilings().map(f => f.id)).toEqual(['f-1']);

    expect(comp.getPrimaryActions(draft).map(a => a.id)).toContain('delete');
    expect(comp.getPrimaryActions(sampleFiling).map(a => a.id)).toContain('fileWithLirs');
    expect(comp.getMenuActions(sampleFiling).map(a => a.id)).toContain('amend');
  });

  it('shows a warning toast instead of success when LIRS bridge returns partial-failure warnings', async () => {
    filingServiceSpy.listFilings.and.resolveTo([sampleFiling]);
    lirsServiceSpy.fileWithLirs.and.resolveTo({
      success: true,
      fallbackActive: false,
      message: 'Portal opened with 1 filing.',
      filingId: 'f-1',
      warnings: ['Filing 2023 could not be exported: missing taxpayer'],
    });

    const fixture = TestBed.createComponent(FilingHistoryComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    await fixture.componentInstance.fileWithLirs(sampleFiling);
    expect(toastSpy.warning).toHaveBeenCalledWith(
      jasmine.stringContaining('Filing 2023 could not be exported'),
    );
    expect(toastSpy.success).not.toHaveBeenCalled();
  });
});

describe('FilingHistoryComponent (actions, payments and export)', () => {
  let fs: jasmine.SpyObj<FilingService>;
  let lirs: jasmine.SpyObj<LIRSService>;
  let toast: jasmine.SpyObj<ToastService>;
  let invokeSpy: jasmine.Spy;
  let navigate: jasmine.Spy;

  const confirmed: Filing = {
    id: 'f-1',
    taxpayerId: 'tp-1',
    yearOfAssessment: 2025,
    status: 'Confirmed',
    filingReference: 'LIRS/REF/2025/00001',
    createdAt: '2026-01-01T00:00:00Z',
    confirmedAt: '2026-01-02T00:00:00Z',
    totalIncomeNgn: 5_000_000,
    finalTaxPayable: 690_000,
    taxConfigVersion: 'NTA 2025',
  };
  const draft: Filing = { ...confirmed, id: 'f-2', status: 'Draft', filingReference: undefined, yearOfAssessment: 2024 };
  const submitted: Filing = { ...confirmed, id: 'f-3', status: 'Submitted', yearOfAssessment: 2023 };

  beforeEach(async () => {
    invokeSpy = jasmine.createSpy('invoke');
    (window as any).__TAURI_INTERNALS__ = { invoke: invokeSpy };
    fs = jasmine.createSpyObj('FilingService', [
      'listFilings', 'listIncomeEntries', 'listAllowances', 'listReliefEntries', 'deleteFiling',
      'duplicateFiling', 'amendFiling', 'markSubmitted', 'recordPayment', 'compute',
      'exportPdf', 'exportCsv', 'exportJson',
    ]);
    lirs = jasmine.createSpyObj('LIRSService', ['fileWithLirs', 'buildReferenceFields']);
    toast = jasmine.createSpyObj('ToastService', ['error', 'success', 'info', 'warning']);
    fs.listFilings.and.resolveTo([confirmed, draft, submitted]);
    fs.listIncomeEntries.and.resolveTo([]);
    fs.listAllowances.and.resolveTo([]);
    fs.listReliefEntries.and.resolveTo([]);

    await TestBed.configureTestingModule({
      imports: [FilingHistoryComponent],
      providers: [
        provideRouter([]),
        { provide: FilingService, useValue: fs },
        { provide: LIRSService, useValue: lirs },
        { provide: ToastService, useValue: toast },
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ ...icons, BarChart2, MoreVertical }) },
      ],
    }).compileComponents();
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  async function create() {
    const fixture = TestBed.createComponent(FilingHistoryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, comp: fixture.componentInstance };
  }

  it('computes status counts and stops loading', async () => {
    const { comp } = await create();
    expect(comp.loading()).toBeFalse();
    expect(comp.totalFilings).toBe(3);
    expect(comp.confirmedCount).toBe(1);
    expect(comp.draftCount).toBe(1);
    expect(comp.submittedCount).toBe(1);
  });

  it('stops loading even when listing fails', async () => {
    fs.listFilings.and.rejectWith(new Error('db'));
    const fixture = TestBed.createComponent(FilingHistoryComponent);
    fixture.detectChanges();
    await expectAsync((fixture.componentInstance as any).initialize()).toBeRejected();
    expect(fixture.componentInstance.loading()).toBeFalse();
  });

  it('navigates to a filing and toggles the row menu', async () => {
    const { comp } = await create();
    comp.viewFiling('f-1');
    expect(navigate).toHaveBeenCalledWith(['/filing', 'f-1']);

    const event = jasmine.createSpyObj<Event>('Event', ['stopPropagation']);
    comp.toggleMenu('f-1', event);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(comp.openMenuId()).toBe('f-1');
    comp.toggleMenu('f-1', event);
    expect(comp.openMenuId()).toBeNull();
    comp.toggleMenu('f-2', event);
    comp.closeMenu();
    expect(comp.openMenuId()).toBeNull();
  });

  it('partitions actions by status', async () => {
    const { comp } = await create();
    expect(comp.getPrimaryActions(submitted).map(a => a.id)).toEqual(['export', 'recordPayment']);
    expect(comp.getMenuActions(submitted).map(a => a.id)).toEqual(['amend', 'duplicate']);
    expect(comp.getMenuActions(draft)).toEqual([]);
    expect(comp.getPrimaryActions({ ...draft, status: 'Unknown' as any })).toEqual([]);
  });

  it('routes row actions to their handlers and closes the menu', async () => {
    const { comp } = await create();
    const c = comp as any;
    const spies = {
      openPreview: spyOn(c, 'openPreview').and.resolveTo(),
      duplicate: spyOn(c, 'duplicate').and.resolveTo(),
      amend: spyOn(c, 'amend').and.resolveTo(),
      fileWithLirs: spyOn(c, 'fileWithLirs').and.resolveTo(),
      markSubmitted: spyOn(c, 'markSubmitted').and.resolveTo(),
      openPayment: spyOn(c, 'openPayment'),
      openDelete: spyOn(c, 'openDelete'),
    };
    comp.openMenuId.set('f-1');
    comp.runAction('export', confirmed);
    expect(comp.openMenuId()).toBeNull();
    comp.runAction('duplicate', confirmed);
    comp.runAction('amend', confirmed);
    comp.runAction('fileWithLirs', confirmed);
    comp.runAction('markSubmitted', confirmed);
    comp.runAction('recordPayment', confirmed);
    comp.runAction('delete', draft);
    expect(spies.openPreview).toHaveBeenCalledWith(confirmed);
    expect(spies.duplicate).toHaveBeenCalledWith('f-1');
    expect(spies.amend).toHaveBeenCalledWith('f-1');
    expect(spies.fileWithLirs).toHaveBeenCalledWith(confirmed);
    expect(spies.markSubmitted).toHaveBeenCalledWith('f-1');
    expect(spies.openPayment).toHaveBeenCalledWith(confirmed);
    expect(spies.openDelete).toHaveBeenCalledWith(draft);
  });

  it('moves back a page and clamps when results shrink', async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ ...confirmed, id: `m-${i}`, yearOfAssessment: 2000 + i }));
    fs.listFilings.and.resolveTo(many);
    const { comp } = await create();
    comp.prevPage();
    expect(comp.currentPage).toBe(1);
    comp.nextPage();
    comp.nextPage();
    expect(comp.currentPage).toBe(2);
    comp.prevPage();
    expect(comp.currentPage).toBe(1);
    comp.onYearChange('');
    expect(comp.yearFilter).toBeNull();
    expect(comp.displayedFilings().length).toBe(10);
  });

  it('counts preview documents, keeps zero counts on failure and proceeds to export', async () => {
    const doc = { id: 'd' } as any;
    fs.listIncomeEntries.and.resolveTo([{ documents: [doc, doc] }, { documents: [] }] as any);
    fs.listAllowances.and.resolveTo([{ documents: [doc] }] as any);
    fs.listReliefEntries.and.resolveTo([{ claimedAmount: 0, approvedAmount: 0, documents: [doc] }] as any);
    const { comp } = await create();
    await comp.openPreview(confirmed);
    expect(comp.previewFiling()).toBe(confirmed);
    expect(comp.previewCounts()).toEqual({ income: 2, allowances: 1, reliefs: 1, documents: 4 });

    comp.proceedToExport();
    expect(comp.previewFiling()).toBeNull();
    expect(comp.exportFiling()).toBe(confirmed);
    comp.proceedToExport();
    expect(comp.exportFiling()).toBe(confirmed);
    comp.closeExport();
    expect(comp.exportFiling()).toBeNull();

    comp.previewCounts.set({ income: 0, allowances: 0, reliefs: 0, documents: 0 });
    fs.listAllowances.and.rejectWith(new Error('x'));
    await comp.openPreview(draft);
    expect(comp.previewCounts().income).toBe(0);
  });

  it('deletes the selected filing and refreshes', async () => {
    const { comp } = await create();
    await comp.confirmDelete();
    expect(fs.deleteFiling).not.toHaveBeenCalled();

    fs.deleteFiling.and.resolveTo();
    fs.listFilings.and.resolveTo([confirmed]);
    comp.openDelete(draft);
    await comp.confirmDelete();
    expect(fs.deleteFiling).toHaveBeenCalledWith('f-2');
    expect(comp.totalFilings).toBe(1);
    expect(comp.deletingFiling()).toBeNull();
    expect(comp.deleting()).toBeFalse();
  });

  it('keeps the delete dialog open when deletion fails', async () => {
    fs.deleteFiling.and.rejectWith(new Error('locked'));
    const { comp } = await create();
    comp.openDelete(draft);
    await expectAsync(comp.confirmDelete()).toBeRejected();
    expect(comp.deletingFiling()).toBe(draft);
    expect(comp.deleting()).toBeFalse();
  });

  const ops: [string, 'duplicateFiling' | 'amendFiling' | 'markSubmitted', string, string][] = [
    ['duplicate', 'duplicateFiling', 'Filing duplicated as a new Draft.', 'Duplicate failed: '],
    ['amend', 'amendFiling', 'Amendment draft created. Open it to continue editing.', 'Amend failed: '],
    ['markSubmitted', 'markSubmitted', 'Filing marked as Submitted.', 'Failed to mark as submitted: '],
  ];
  for (const [method, serviceMethod, okMsg, errPrefix] of ops) {
    it(`${method} refreshes on success and reports failures`, async () => {
      const { comp } = await create();
      (fs[serviceMethod] as jasmine.Spy).and.resolveTo({});
      fs.listFilings.calls.reset();
      await (comp as any)[method]('f-1');
      expect(fs[serviceMethod]).toHaveBeenCalledWith('f-1');
      expect(fs.listFilings).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith(okMsg);

      (fs[serviceMethod] as jasmine.Spy).and.rejectWith(new Error('boom'));
      await (comp as any)[method]('f-1');
      expect(toast.error).toHaveBeenCalledWith(errPrefix + 'boom');
      (fs[serviceMethod] as jasmine.Spy).and.returnValue(Promise.reject('raw'));
      await (comp as any)[method]('f-1');
      expect(toast.error).toHaveBeenCalledWith(errPrefix + 'raw');
    });
  }

  it('shows success when the LIRS bridge opens cleanly', async () => {
    lirs.fileWithLirs.and.resolveTo({ success: true, fallbackActive: false, message: 'Opened.', filingId: 'f-1' } as any);
    const { comp } = await create();
    await comp.fileWithLirs(confirmed);
    expect(lirs.fileWithLirs).toHaveBeenCalledWith('f-1');
    expect(toast.success).toHaveBeenCalledWith('Opened.');
    expect(comp.lirsActionLoading()).toBeFalse();
  });

  it('uses the message alone when it already lists the warnings', async () => {
    lirs.fileWithLirs.and.resolveTo({
      success: true, fallbackActive: false, message: 'Opened. missing TIN', warnings: ['missing TIN'],
    } as any);
    const { comp } = await create();
    await comp.fileWithLirs(confirmed);
    expect(toast.warning).toHaveBeenCalledWith('Opened. missing TIN');
  });

  it('opens the reference panel when the bridge falls back', async () => {
    const groups = [{ title: 'Income', fields: [] }] as any;
    fs.compute.and.resolveTo({} as any);
    lirs.buildReferenceFields.and.returnValue(groups);
    lirs.fileWithLirs.and.resolveTo({ success: false, fallbackActive: true, message: 'No extension.' } as any);
    const { comp } = await create();
    await comp.fileWithLirs(confirmed);
    await new Promise(r => setTimeout(r));
    expect(toast.warning).toHaveBeenCalledWith('No extension.');
    expect(fs.compute).toHaveBeenCalledWith('f-1');
    expect(lirs.buildReferenceFields).toHaveBeenCalledWith(confirmed, [], [], [], {} as any);
    expect(comp.referenceFields()).toBe(groups);
    expect(comp.showReferencePanel()).toBeTrue();
    expect(comp.activeLirsFiling()).toBe(confirmed);
  });

  it('falls back to an empty reference panel when the bridge and compute fail', async () => {
    lirs.fileWithLirs.and.rejectWith(new Error('bridge down'));
    fs.compute.and.rejectWith(new Error('no config'));
    const { comp } = await create();
    await comp.fileWithLirs(confirmed);
    await new Promise(r => setTimeout(r));
    expect(toast.error).toHaveBeenCalledWith('Failed to open LIRS portal: bridge down');
    expect(comp.referenceStatus()).toContain('fill Form A manually');
    expect(comp.referenceFields()).toEqual([]);
    expect(comp.showReferencePanel()).toBeTrue();
    expect(comp.lirsActionLoading()).toBeFalse();

    lirs.fileWithLirs.and.returnValue(Promise.reject('raw'));
    await comp.fileWithLirs(confirmed);
    expect(toast.error).toHaveBeenCalledWith('Failed to open LIRS portal: raw');
  });

  it('marks the active reference filing as submitted and closes the panel', async () => {
    const { comp } = await create();
    await comp.onReferenceMarkSubmitted();
    expect(fs.markSubmitted).not.toHaveBeenCalled();

    comp.activeLirsFiling.set(confirmed);
    comp.showReferencePanel.set(true);
    fs.markSubmitted.and.rejectWith(new Error('nope'));
    await comp.onReferenceMarkSubmitted();
    expect(toast.error).toHaveBeenCalledWith('Failed to mark as submitted: nope');
    expect(comp.showReferencePanel()).toBeTrue();

    fs.markSubmitted.and.resolveTo({} as any);
    await comp.onReferenceMarkSubmitted();
    expect(fs.markSubmitted).toHaveBeenCalledWith('f-1');
    expect(comp.showReferencePanel()).toBeFalse();
    expect(comp.activeLirsFiling()).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Filing marked as Submitted.');

    comp.activeLirsFiling.set(confirmed);
    comp.showReferencePanel.set(true);
    comp.closeReferencePanel();
    expect(comp.showReferencePanel()).toBeFalse();
    expect(comp.activeLirsFiling()).toBeNull();
  });

  it('prefills the payment form from the filing or sensible defaults', async () => {
    const { comp } = await create();
    comp.openPayment({ ...confirmed, paymentDate: '2026-03-01', paymentReference: 'RCPT-1', amountPaid: 500_000 });
    expect(comp.paymentForm).toEqual({ date: '2026-03-01', reference: 'RCPT-1', amount: 500_000 });

    comp.openPayment(confirmed);
    expect(comp.paymentForm).toEqual({ date: new Date().toISOString().slice(0, 10), reference: '', amount: 690_000 });

    comp.openPayment({ ...confirmed, finalTaxPayable: undefined });
    expect(comp.paymentForm.amount).toBeNull();
    expect(comp.paymentFiling()?.id).toBe('f-1');
  });

  it('saves and clears payments', async () => {
    fs.recordPayment.and.resolveTo({} as any);
    const { comp } = await create();
    await comp.savePayment();
    expect(fs.recordPayment).not.toHaveBeenCalled();

    comp.openPayment(confirmed);
    comp.paymentForm = { date: '2026-03-01', reference: '', amount: NaN };
    await comp.savePayment();
    expect(fs.recordPayment).toHaveBeenCalledWith('f-1', { paymentDate: '2026-03-01', paymentReference: null, amountPaid: null });
    expect(comp.paymentFiling()).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Payment recorded.');

    comp.openPayment(confirmed);
    comp.paymentForm = { date: '', reference: 'R', amount: 10 };
    await comp.savePayment();
    expect(fs.recordPayment).toHaveBeenCalledWith('f-1', { paymentDate: null, paymentReference: 'R', amountPaid: 10 });

    comp.openPayment(confirmed);
    await comp.clearPayment();
    expect(fs.recordPayment).toHaveBeenCalledWith('f-1', { paymentDate: null, paymentReference: null, amountPaid: null });
    expect(toast.success).toHaveBeenCalledWith('Payment cleared.');
  });

  it('keeps the payment dialog open on failure', async () => {
    fs.recordPayment.and.rejectWith('db error');
    const { comp } = await create();
    comp.openPayment(confirmed);
    await comp.savePayment();
    expect(toast.error).toHaveBeenCalledWith('Could not save payment: db error');
    expect(comp.paymentFiling()).toBe(confirmed);
    expect(comp.savingPayment()).toBeFalse();
  });

  function routeInvoke(saveResult: string | null = 'D:/out/file'): void {
    invokeSpy.and.callFake(async (cmd: string, args: any) => {
      if (cmd === 'plugin:path|resolve_directory') return 'C:/Users/ada';
      if (cmd === 'plugin:path|join') return args.paths.join('/');
      if (cmd === 'plugin:dialog|save') return saveResult;
      return undefined;
    });
  }

  it('prints the export filing via a generated PDF', async () => {
    routeInvoke();
    fs.exportPdf.and.resolveTo('C:/saved.pdf');
    const { comp } = await create();
    await comp.doPrint();
    expect(fs.exportPdf).not.toHaveBeenCalled();

    comp.openExport(confirmed);
    comp.includeAttachments = true;
    comp.letterheadStyle = 'alt-fills';
    await comp.doPrint();
    expect(fs.exportPdf).toHaveBeenCalledWith('f-1', 'C:/Users/ada/LagosFile/exports/print/LagosFile_2025_f-1.pdf', true, 'alt-fills');
    expect(invokeSpy).toHaveBeenCalledWith('print_file', { path: 'C:/saved.pdf' }, undefined);
    expect(toast.success).toHaveBeenCalledWith('Sent to printer.');
    expect(comp.exporting()).toBeFalse();

    fs.exportPdf.and.rejectWith(new Error('no printer'));
    await comp.doPrint();
    expect(toast.error).toHaveBeenCalledWith('Print failed: no printer');
    fs.exportPdf.and.returnValue(Promise.reject('raw'));
    await comp.doPrint();
    expect(toast.error).toHaveBeenCalledWith('Print failed: raw');
  });

  it('exports in each format to the chosen path and opens the file', async () => {
    routeInvoke('D:/out/file');
    fs.exportPdf.and.resolveTo('D:/out/a.pdf');
    fs.exportCsv.and.resolveTo('D:/out/a.csv');
    fs.exportJson.and.resolveTo('D:/out/a.json');
    const { comp } = await create();
    await comp.doExport();
    expect(invokeSpy).not.toHaveBeenCalled();

    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    comp.openExport(confirmed);
    await comp.doExport();
    const saveArgs = invokeSpy.calls.allArgs().find(a => a[0] === 'plugin:dialog|save')![1];
    expect(saveArgs.options.defaultPath).toBe(
      `C:/Users/ada/LagosFile/exports/LagosFile_TaxReturn_2025_LIRS_REF_2025_00001_Confirmed_${datePart}.pdf`,
    );
    expect(fs.exportPdf).toHaveBeenCalledWith('f-1', 'D:/out/file', false, 'single');
    expect(invokeSpy).toHaveBeenCalledWith('open_file', { path: 'D:/out/a.pdf' }, undefined);
    expect(comp.exportFiling()).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Export saved successfully.');

    comp.openExport(draft);
    comp.exportFormat = 'csv';
    await comp.doExport();
    expect(fs.exportCsv).toHaveBeenCalledWith('f-2', 'D:/out/file');
    const csvSave = invokeSpy.calls.allArgs().filter(a => a[0] === 'plugin:dialog|save').pop()![1];
    expect(csvSave.options.defaultPath).toContain(`LagosFile_TaxReturn_2024_YOA2024_Draft_${datePart}.csv`);

    comp.openExport(confirmed);
    comp.exportFormat = 'json';
    await comp.doExport();
    expect(fs.exportJson).toHaveBeenCalledWith('f-1', 'D:/out/file');
    expect(invokeSpy).toHaveBeenCalledWith('open_file', { path: 'D:/out/a.json' }, undefined);
  });

  it('does nothing when the export dialog is cancelled and reports export errors', async () => {
    routeInvoke(null);
    const { comp } = await create();
    comp.openExport(confirmed);
    await comp.doExport();
    expect(fs.exportPdf).not.toHaveBeenCalled();
    expect(comp.exportFiling()).toBe(confirmed);
    expect(comp.exporting()).toBeFalse();

    routeInvoke('D:/out/file');
    fs.exportPdf.and.rejectWith(new Error('render failed'));
    await comp.doExport();
    expect(toast.error).toHaveBeenCalledWith('Export failed: render failed');
    fs.exportPdf.and.returnValue(Promise.reject('raw'));
    await comp.doExport();
    expect(toast.error).toHaveBeenCalledWith('Export failed: raw');
    expect(comp.exportFiling()).toBe(confirmed);
  });
});
