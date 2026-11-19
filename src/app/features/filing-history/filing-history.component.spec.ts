import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
});
