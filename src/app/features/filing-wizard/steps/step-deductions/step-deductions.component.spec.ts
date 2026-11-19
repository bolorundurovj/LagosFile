import { TestBed } from '@angular/core/testing';
import { StepDeductionsComponent } from './step-deductions.component';
import { FilingService } from '../../../../core/services/filing.service';
import { ConfigService } from '../../../../core/services/config.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LIRSService } from '../../../../core/services/lirs.service';
import { TauriService } from '../../../../core/services/tauri.service';
import { Filing, ReliefEntry } from '../../../../core/models';
import {
  LUCIDE_ICONS,
  LucideIconProvider,
  Paperclip,
  Upload,
  HelpCircle,
} from 'lucide-angular';

describe('StepDeductionsComponent', () => {
  let filingServiceSpy: jasmine.SpyObj<FilingService>;
  let toastSpy: jasmine.SpyObj<ToastService>;

  beforeEach(async () => {
    filingServiceSpy = jasmine.createSpyObj('FilingService', [
      'listReliefEntries',
      'upsertReliefEntry',
      'deleteReliefEntry',
      'attachDocument',
    ]);
    toastSpy = jasmine.createSpyObj('ToastService', ['error', 'success', 'info', 'warning']);
    filingServiceSpy.listReliefEntries.and.resolveTo([]);
    filingServiceSpy.upsertReliefEntry.and.callFake(async (e: ReliefEntry) => e);
    filingServiceSpy.deleteReliefEntry.and.resolveTo();

    await TestBed.configureTestingModule({
      imports: [StepDeductionsComponent],
      providers: [
        { provide: FilingService, useValue: filingServiceSpy },
        { provide: ConfigService, useValue: { activeConfig: () => null } },
        { provide: ToastService, useValue: toastSpy },
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({ Paperclip, Upload, HelpCircle }),
        },
      ],
    }).compileComponents();
  });

  function createComponent() {
    const fixture = TestBed.createComponent(StepDeductionsComponent);
    fixture.componentRef.setInput('filingId', 'filing-1');
    fixture.detectChanges();
    return fixture;
  }

  it('recalculates totalWht immediately when a WHT entry amount is edited in place', async () => {
    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.addWht();
    expect(comp.totalWht()).toBe(0);

    comp.whtEntries()[0].claimedAmount = 150_000;
    expect(comp.totalWht()).toBe(150_000);

    comp.whtEntries()[0].claimedAmount = 225_000;
    expect(comp.totalWht()).toBe(225_000);
  });

  it('skips zero standard reliefs with no documents and deletes existing zero rows on save', async () => {
    const existingPension: ReliefEntry = {
      id: 'rel-pension-1',
      filingId: 'filing-1',
      reliefType: 'pension',
      claimedAmount: 300_000,
      approvedAmount: 300_000,
      documents: [],
    };
    const existingNhf: ReliefEntry = {
      id: 'rel-nhf-1',
      filingId: 'filing-1',
      reliefType: 'nhf',
      claimedAmount: 0,
      approvedAmount: 0,
      documents: [],
    };
    filingServiceSpy.listReliefEntries.and.resolveTo([existingPension, existingNhf]);

    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    // User zeroes out pension and leaves nhf at 0, sets rent to 1,200,000
    comp.fields.pension = 0;
    comp.fields.annualRent = 1_200_000;

    await comp.save();

    // Only rent (non-zero) should be upserted
    expect(filingServiceSpy.upsertReliefEntry.calls.count()).toBe(1);
    expect(filingServiceSpy.upsertReliefEntry.calls.mostRecent().args[0].reliefType).toBe('rent');
    // Both previously persisted zero rows (pension + nhf) should be deleted
    const deletedIds = filingServiceSpy.deleteReliefEntry.calls.allArgs().map(a => a[0]);
    expect(deletedIds).toContain('rel-pension-1');
    expect(deletedIds).toContain('rel-nhf-1');
  });

  it('LIRSService.buildReferenceFields filters zero reliefs and labels rent as "Rent paid"', () => {
    const tauriMock = jasmine.createSpyObj('TauriService', ['invoke']);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [LIRSService, { provide: TauriService, useValue: tauriMock }],
    });
    const lirs = TestBed.inject(LIRSService);
    const filing: Filing = {
      id: 'f-1',
      taxpayerId: 'tp-1',
      yearOfAssessment: 2025,
      status: 'Confirmed',
      createdAt: '2026-01-01T00:00:00Z',
      taxConfigVersion: 'NTA 2025',
    };
    const reliefs: ReliefEntry[] = [
      { id: 'r1', filingId: 'f-1', reliefType: 'pension', claimedAmount: 0, approvedAmount: 0, documents: [] },
      { id: 'r2', filingId: 'f-1', reliefType: 'rent', claimedAmount: 1_500_000, approvedAmount: 1_500_000, documents: [] },
    ];
    const groups = lirs.buildReferenceFields(filing, [], [], reliefs);
    const dedGroup = groups.find(g => g.section === 'Deductions & Reliefs')!;
    expect(dedGroup.fields.length).toBe(1);
    expect(dedGroup.fields[0].label).toBe('Rent paid');
    expect(dedGroup.fields[0].copyText).toBe('1500000');
  });
});
