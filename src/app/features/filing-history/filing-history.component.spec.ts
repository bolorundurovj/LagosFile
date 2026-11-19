import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FilingHistoryComponent } from './filing-history.component';
import { FilingService } from '../../core/services/filing.service';
import { LIRSService } from '../../core/services/lirs.service';
import { ToastService } from '../../core/services/toast.service';
import { Filing } from '../../core/models';
import { LUCIDE_ICONS, LucideIconProvider, icons, BarChart2 } from 'lucide-angular';

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
          useValue: new LucideIconProvider({ ...icons, BarChart2 }),
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
});
