import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StepDeductionsComponent } from './step-deductions.component';
import { FilingService } from '../../../../core/services/filing.service';
import { ConfigService } from '../../../../core/services/config.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LIRSService } from '../../../../core/services/lirs.service';
import { TauriService } from '../../../../core/services/tauri.service';
import { Document, Filing, ReliefEntry, TaxConfig } from '../../../../core/models';
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
      'saveReliefEntries',
      'attachDocument',
    ]);
    toastSpy = jasmine.createSpyObj('ToastService', ['error', 'success', 'info', 'warning']);
    filingServiceSpy.listReliefEntries.and.resolveTo([]);
    filingServiceSpy.upsertReliefEntry.and.callFake(async (e: ReliefEntry) => e);
    filingServiceSpy.deleteReliefEntry.and.resolveTo();
    filingServiceSpy.saveReliefEntries.and.callFake(async (_fid, upserts) => upserts.map(u => u.id ?? ''));

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

    // Single batch invoke: only rent (non-zero) upserted; both zeroed persisted rows deleted
    expect(filingServiceSpy.saveReliefEntries).toHaveBeenCalledTimes(1);
    expect(filingServiceSpy.upsertReliefEntry).not.toHaveBeenCalled();
    expect(filingServiceSpy.deleteReliefEntry).not.toHaveBeenCalled();
    const [fid, upserts, deletedIds] = filingServiceSpy.saveReliefEntries.calls.mostRecent().args;
    expect(fid).toBe('filing-1');
    expect(upserts.length).toBe(1);
    expect(upserts[0].reliefType).toBe('rent');
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

describe('StepDeductionsComponent (caps, entries and save paths)', () => {
  let filingServiceSpy: jasmine.SpyObj<FilingService>;
  let toastSpy: jasmine.SpyObj<ToastService>;
  let getForFiling: jasmine.Spy;
  let fixture: ComponentFixture<StepDeductionsComponent>;
  let comp: StepDeductionsComponent;

  const caps = (extra: Partial<TaxConfig['reliefCaps']> = {}) =>
    ({ reliefCaps: { rentReliefCap: 500_000, rentReliefRate: 0.2, ...extra } }) as TaxConfig;

  function rel(id: string, reliefType: ReliefEntry['reliefType'], claimedAmount: number, documents: Document[] = []): ReliefEntry {
    return { id, filingId: 'filing-1', reliefType, claimedAmount, approvedAmount: claimedAmount, documents };
  }

  async function create(): Promise<void> {
    fixture = TestBed.createComponent(StepDeductionsComponent);
    fixture.componentRef.setInput('filingId', 'filing-1');
    comp = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    filingServiceSpy = jasmine.createSpyObj('FilingService', ['listReliefEntries', 'saveReliefEntries', 'attachDocument', 'deleteDocument']);
    toastSpy = jasmine.createSpyObj('ToastService', ['error', 'success']);
    filingServiceSpy.listReliefEntries.and.resolveTo([]);
    filingServiceSpy.saveReliefEntries.and.callFake(async (_fid, upserts) => upserts.map(u => u.id ?? ''));
    getForFiling = jasmine.createSpy('getForFiling').and.resolveTo(caps());

    await TestBed.configureTestingModule({
      imports: [StepDeductionsComponent],
      providers: [
        { provide: FilingService, useValue: filingServiceSpy },
        { provide: ConfigService, useValue: { activeConfig: () => caps({ rentReliefCap: 1 }), getForFiling } },
        { provide: ToastService, useValue: toastSpy },
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ Paperclip, Upload, HelpCircle }) },
      ],
    }).compileComponents();
  });

  it('uses the filing config for rent relief at 20% capped at the configured amount', async () => {
    await create();
    expect(getForFiling).toHaveBeenCalledWith('filing-1');
    comp.fields.annualRent = 1_000_000;
    expect(comp.rentRelief()).toBe(200_000);
    comp.fields.annualRent = 5_000_000;
    expect(comp.rentRelief()).toBe(500_000);
  });

  it('falls back to the active config when the filing config cannot be loaded', async () => {
    getForFiling.and.rejectWith(new Error('missing'));
    await create();
    comp.fields.annualRent = 1_000_000;
    expect(comp.rentRelief()).toBe(1);
  });

  it('disables rent relief under CRA and applies statutory caps to deductions', async () => {
    getForFiling.and.resolveTo(caps({ craEnabled: true, pensionCap: 100_000, nhisCap: 0, nhfCap: null }));
    await create();
    Object.assign(comp.fields, { pension: 300_000, nhis: 50_000, nhf: 20_000, lifeAssurance: 10_000, annualRent: 2_000_000 });
    comp.addOther();
    comp.otherEntries()[0].claimedAmount = 5_000;
    expect(comp.craEnabled()).toBeTrue();
    expect(comp.rentRelief()).toBe(0);
    expect(comp.totalDeductions()).toBe(100_000 + 0 + 20_000 + 10_000 + 5_000);
    expect(fixture.nativeElement.textContent).not.toContain('Attach tenancy agreement');
  });

  it('capped ignores missing or negative caps', async () => {
    await create();
    expect(comp.capped(500, null)).toBe(500);
    expect(comp.capped(500, undefined)).toBe(500);
    expect(comp.capped(500, -1)).toBe(500);
    expect(comp.capped(500, 200)).toBe(200);
  });

  it('loads existing reliefs into fields, WHT and other lists and drops duplicate legacy rows', async () => {
    filingServiceSpy.listReliefEntries.and.resolveTo([
      rel('p-old', 'pension', 100_000),
      rel('p-new', 'pension', 250_000),
      rel('w1', 'wht', 40_000),
      rel('o1', 'other_approved', 7_000),
      rel('ft', 'foreign_tax', 1),
    ]);
    await create();
    expect(comp.fields.pension).toBe(250_000);
    expect(comp.whtEntries().map(e => e.id)).toEqual(['w1']);
    expect(comp.otherEntries().map(e => e.id)).toEqual(['o1']);
    expect(comp.totalWht()).toBe(40_000);
    expect(comp.isDirty()).toBeFalse();

    await comp.save();
    const [, upserts, deleteIds] = filingServiceSpy.saveReliefEntries.calls.mostRecent().args;
    expect(deleteIds).toEqual(['p-old']);
    expect(upserts.map(u => u.id)).toEqual(['w1', 'o1', 'p-new']);
    expect(comp.isDirty()).toBeFalse();
  });

  it('reports load failures but still becomes editable', async () => {
    filingServiceSpy.listReliefEntries.and.rejectWith('db locked');
    await create();
    expect(toastSpy.error).toHaveBeenCalledWith('Could not load deductions: db locked');
    expect(comp.isDirty()).toBeFalse();
    comp.addWht();
    expect(comp.isDirty()).toBeTrue();
  });

  it('queues attachments and reports invalid files', async () => {
    await create();
    comp.onFileSelected({ path: '', name: 'x.pdf', size: 1, type: 'pdf' }, comp.standard.pension);
    expect(toastSpy.error).toHaveBeenCalledWith(jasmine.stringContaining('Drag-and-drop'));
    comp.onFileSelected({ path: '/tmp/pfa.pdf', name: 'pfa.pdf', size: 1, type: 'pdf' }, comp.standard.pension);
    expect(comp.standard.pension.documents.map(d => d.fileName)).toEqual(['pfa.pdf']);
    expect(comp.isDirty()).toBeTrue();
  });

  it('saves a zero-amount standard relief that has a document and uploads it', async () => {
    filingServiceSpy.attachDocument.and.resolveTo({ id: 'doc-1' } as Document);
    await create();
    comp.onFileSelected({ path: '/tmp/pfa.pdf', name: 'pfa.pdf', size: 1, type: 'pdf' }, comp.standard.pension);
    expect(await comp.save()).toBeTrue();
    const [, upserts] = filingServiceSpy.saveReliefEntries.calls.mostRecent().args;
    expect(upserts.map(u => u.reliefType)).toEqual(['pension']);
    expect(filingServiceSpy.attachDocument).toHaveBeenCalledWith(comp.standard.pension.id, 'relief_entry', '/tmp/pfa.pdf', 'pfa.pdf', 'pdf', 1);
    expect(comp.standard.pension.documents[0].id).toBe('doc-1');
  });

  it('returns false and reports files that fail to upload', async () => {
    filingServiceSpy.attachDocument.and.rejectWith('too big');
    await create();
    comp.addWht();
    const wht = comp.whtEntries()[0];
    wht.claimedAmount = 10_000;
    comp.onFileSelected({ path: '/tmp/w.pdf', name: 'w.pdf', size: 1, type: 'pdf' }, wht);
    expect(await comp.save()).toBeFalse();
    expect(toastSpy.error).toHaveBeenCalledWith('Could not attach w.pdf: too big');
    expect(comp.isDirty()).toBeTrue();
  });

  it('removes attachments and reports deletion failures', async () => {
    const doc = { id: 'doc-9', fileName: 'r.pdf' } as Document;
    filingServiceSpy.listReliefEntries.and.resolveTo([rel('rent-1', 'rent', 1_000_000, [doc])]);
    filingServiceSpy.deleteDocument.and.rejectWith('locked');
    await create();
    await comp.onRemoveDocument(comp.standard.rent, 'doc-9');
    expect(toastSpy.error).toHaveBeenCalledWith('Could not remove document: locked');
    filingServiceSpy.deleteDocument.and.resolveTo();
    await comp.onRemoveDocument(comp.standard.rent, 'doc-9');
    expect(comp.standard.rent.documents).toEqual([]);
  });

  it('deletes removed WHT and other entries, sets approved amounts and emits next', async () => {
    filingServiceSpy.listReliefEntries.and.resolveTo([rel('w1', 'wht', 1), rel('o1', 'other_approved', 2)]);
    await create();
    comp.removeWht('w1');
    comp.removeOther('o1');
    comp.addOther();
    comp.otherEntries()[0].claimedAmount = '3000' as unknown as number;
    comp.fields.paye = 90_000;
    const nextSpy = jasmine.createSpy('next');
    comp.next.subscribe(nextSpy);
    await comp.saveAndNext();
    const [, upserts, deleteIds] = filingServiceSpy.saveReliefEntries.calls.mostRecent().args;
    expect(deleteIds).toEqual(['w1', 'o1']);
    const other = upserts.find(u => u.reliefType === 'other_approved')!;
    expect(other.claimedAmount).toBe(3000);
    expect(other.approvedAmount).toBe(3000);
    expect(upserts.find(u => u.reliefType === 'paye')!.approvedAmount).toBe(90_000);
    expect(nextSpy).toHaveBeenCalled();
  });

  it('zeroes legacy rent under CRA and deletes the persisted row', async () => {
    getForFiling.and.resolveTo(caps({ craEnabled: true }));
    filingServiceSpy.listReliefEntries.and.resolveTo([rel('rent-1', 'rent', 900_000)]);
    await create();
    expect(comp.fields.annualRent).toBe(900_000);
    await comp.save();
    expect(comp.fields.annualRent).toBe(0);
    expect(filingServiceSpy.saveReliefEntries.calls.mostRecent().args[2]).toEqual(['rent-1']);
  });

  it('reports save failures, keeps saving false and does not emit next', async () => {
    filingServiceSpy.saveReliefEntries.and.rejectWith('constraint failed');
    await create();
    const nextSpy = jasmine.createSpy('next');
    comp.next.subscribe(nextSpy);
    await comp.saveAndNext();
    expect(toastSpy.error).toHaveBeenCalledWith('Could not save deductions: constraint failed');
    expect(comp.saving()).toBeFalse();
    expect(nextSpy).not.toHaveBeenCalled();
  });
});
