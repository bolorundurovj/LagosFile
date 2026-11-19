import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { FilingWizardComponent } from './filing-wizard.component';
import { StepReviewComponent } from './steps/step-review/step-review.component';
import { FilingService } from '../../core/services/filing.service';
import { FxService } from '../../core/services/fx.service';
import { ConfigService } from '../../core/services/config.service';
import { ToastService } from '../../core/services/toast.service';
import { Filing, IncomeEntry } from '../../core/models';
import {
  LUCIDE_ICONS,
  LucideIconProvider,
  FileText,
  Check,
  Plus,
  RefreshCw,
  Upload,
  X,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  TriangleAlert,
  Info,
  Paperclip,
} from 'lucide-angular';

describe('FilingWizardComponent (S12 read-only filed returns)', () => {
  let filingServiceSpy: jasmine.SpyObj<FilingService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let toastSpy: jasmine.SpyObj<ToastService>;

  const submittedFiling: Filing = {
    id: 'filing-sub-1',
    taxpayerId: 'tp-1',
    yearOfAssessment: 2024,
    status: 'Submitted',
    filingReference: 'LIRS/REF/2024/00001',
    createdAt: '2025-02-01T00:00:00Z',
    confirmedAt: '2025-02-02T00:00:00Z',
    submittedAt: '2025-02-03T12:00:00Z',
    totalIncomeNgn: 5_000_000,
    chargeableIncome: 5_000_000,
    taxPayable: 690_000,
    whtCredit: 0,
    netTaxPayable: 690_000,
    minimumTax: 0,
    finalTaxPayable: 690_000,
    taxConfigVersion: 'Tax Config v1.0',
  };

  beforeEach(async () => {
    filingServiceSpy = jasmine.createSpyObj('FilingService', [
      'getFiling',
      'listIncomeEntries',
      'listAllowances',
      'listReliefEntries',
      'amendFiling',
      'createDraft',
    ]);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    toastSpy = jasmine.createSpyObj('ToastService', ['error', 'success']);

    filingServiceSpy.getFiling.and.resolveTo(submittedFiling);
    filingServiceSpy.listIncomeEntries.and.resolveTo([]);
    filingServiceSpy.listAllowances.and.resolveTo([]);
    filingServiceSpy.listReliefEntries.and.resolveTo([]);

    await TestBed.configureTestingModule({
      imports: [FilingWizardComponent],
      providers: [
        { provide: FilingService, useValue: filingServiceSpy },
        { provide: Router, useValue: routerSpy },
        { provide: ToastService, useValue: toastSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: (k: string) => (k === 'id' ? 'filing-sub-1' : null) } },
          },
        },
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ FileText, Check }) },
      ],
    }).compileComponents();
  });

  it('renders a Submitted filing route in read-only mode with an Amend button and no editable wizard', async () => {
    const fixture = TestBed.createComponent(FilingWizardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(fixture.componentInstance.mode()).toBe('readonly');
    expect(el.querySelector('[data-testid="readonly-filing-summary"]')).toBeTruthy();
    expect(el.querySelector('lf-step-income')).toBeNull();
    expect(el.textContent).toContain('LIRS/REF/2024/00001');
    expect(el.textContent).toContain('Submitted');
    expect(el.textContent).toContain('Amend');
  });

  it('navigates to the amended Draft when Amend is clicked', async () => {
    const draftAmendment: Filing = {
      ...submittedFiling,
      id: 'filing-amend-2',
      parentFilingId: submittedFiling.id,
      status: 'Draft',
      filingReference: undefined,
    };
    filingServiceSpy.amendFiling.and.resolveTo(draftAmendment);

    const fixture = TestBed.createComponent(FilingWizardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    await fixture.componentInstance.amendReadonlyFiling();

    expect(filingServiceSpy.amendFiling).toHaveBeenCalledWith('filing-sub-1');
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/filing', 'filing-amend-2']);
  });
});

describe('FilingWizardComponent (dirty step saving, route guard, and error handling)', () => {
  let filingServiceSpy: jasmine.SpyObj<FilingService>;
  let fxServiceSpy: jasmine.SpyObj<FxService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let toastSpy: jasmine.SpyObj<ToastService>;
  let routeId: string | null;

  const draftFiling: Filing = {
    id: 'filing-draft-1',
    taxpayerId: 'tp-1',
    yearOfAssessment: 2025,
    status: 'Draft',
    createdAt: '2026-01-02T00:00:00Z',
    taxConfigVersion: 'NTA 2025',
  };

  beforeEach(async () => {
    routeId = 'filing-draft-1';
    filingServiceSpy = jasmine.createSpyObj('FilingService', [
      'getFiling',
      'listIncomeEntries',
      'upsertIncomeEntry',
      'deleteIncomeEntry',
      'listAllowances',
      'listReliefEntries',
      'upsertReliefEntry',
      'deleteReliefEntry',
      'amendFiling',
      'createDraft',
      'compute',
      'confirmFiling',
      'listFilings',
    ]);
    fxServiceSpy = jasmine.createSpyObj('FxService', ['resolveRate']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    toastSpy = jasmine.createSpyObj('ToastService', ['error', 'success', 'info', 'warning']);

    filingServiceSpy.getFiling.and.resolveTo(draftFiling);
    filingServiceSpy.listIncomeEntries.and.resolveTo([]);
    filingServiceSpy.upsertIncomeEntry.and.callFake(async (e: IncomeEntry) => e);
    filingServiceSpy.listAllowances.and.resolveTo([]);
    filingServiceSpy.listReliefEntries.and.resolveTo([]);
    filingServiceSpy.listFilings.and.resolveTo([]);

    await TestBed.configureTestingModule({
      imports: [FilingWizardComponent, StepReviewComponent],
      providers: [
        { provide: FilingService, useValue: filingServiceSpy },
        { provide: FxService, useValue: fxServiceSpy },
        { provide: ConfigService, useValue: { activeConfig: () => null } },
        { provide: Router, useValue: routerSpy },
        { provide: ToastService, useValue: toastSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: (k: string) => (k === 'id' ? routeId : null) } },
          },
        },
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({
            FileText,
            Check,
            Plus,
            RefreshCw,
            Upload,
            X,
            HelpCircle,
            CheckCircle2,
            AlertTriangle,
            TriangleAlert,
            Info,
            Paperclip,
          }),
        },
      ],
    }).compileComponents();
  });

  it('saves dirty income edits when navigating via sidebar to step 3 and preserves them on return', async () => {
    const savedStore: IncomeEntry[] = [];
    filingServiceSpy.listIncomeEntries.and.callFake(async () => savedStore.map(e => ({ ...e, documents: [...e.documents] })));
    filingServiceSpy.upsertIncomeEntry.and.callFake(async (e: IncomeEntry) => {
      const idx = savedStore.findIndex(x => x.id === e.id);
      if (idx >= 0) savedStore[idx] = { ...e };
      else savedStore.push({ ...e });
      return e;
    });

    const fixture = TestBed.createComponent(FilingWizardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    const incomeDebug = fixture.debugElement.children[0]; // wizard root
    expect(incomeDebug).toBeTruthy();

    // Mutate Step 1 without clicking "Save & Continue"
    const step1 = (comp as unknown as { stepIncome: () => { addEntry(): void; entries: () => IncomeEntry[]; isDirty(): boolean } | undefined }).stepIncome()!;
    step1.addEntry();
    step1.entries()[0].grossAmountNgn = 4_200_000;
    expect(step1.isDirty()).toBeTrue();

    // Click Step 3 in the sidebar
    await comp.goToStep(3);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(comp.currentStep()).toBe(3);
    expect(filingServiceSpy.upsertIncomeEntry).toHaveBeenCalled();
    expect(savedStore.length).toBe(1);
    expect(savedStore[0].grossAmountNgn).toBe(4_200_000);

    // Return to Step 1 and verify the edited value was persisted
    await comp.goToStep(1);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const reloadedStep1 = (comp as unknown as { stepIncome: () => { entries: () => IncomeEntry[]; isDirty(): boolean } | undefined }).stepIncome()!;
    expect(reloadedStep1.entries().length).toBe(1);
    expect(reloadedStep1.entries()[0].grossAmountNgn).toBe(4_200_000);
    expect(reloadedStep1.isDirty()).toBeFalse();
  });

  it('canDeactivate prompts when the active step has unsaved edits', async () => {
    const fixture = TestBed.createComponent(FilingWizardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
    expect(comp.canDeactivate()).toBeTrue();
    expect(confirmSpy).not.toHaveBeenCalled();

    const step1 = (comp as unknown as { stepIncome: () => { addEntry(): void } | undefined }).stepIncome()!;
    step1.addEntry();

    expect(comp.canDeactivate()).toBeFalse();
    expect(confirmSpy).toHaveBeenCalled();

    confirmSpy.and.returnValue(true);
    expect(comp.canDeactivate()).toBeTrue();
  });

  it('shows an error toast and clears starting when createDraft rejects', async () => {
    routeId = null;
    filingServiceSpy.createDraft.and.rejectWith(new Error('Filing already exists for 2025'));

    const fixture = TestBed.createComponent(FilingWizardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.selectedYear = 2025;
    await comp.beginFiling();

    expect(toastSpy.error).toHaveBeenCalledWith(jasmine.stringContaining('Filing already exists for 2025'));
    expect(comp.starting()).toBeFalse();
    expect(comp.mode()).toBe('selecting-year');
  });

  it('shows an error toast and clears loading when getFiling rejects', async () => {
    filingServiceSpy.getFiling.and.rejectWith(new Error('Not found'));

    const fixture = TestBed.createComponent(FilingWizardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(toastSpy.error).toHaveBeenCalledWith(jasmine.stringContaining('Not found'));
    expect(fixture.componentInstance.loading()).toBeFalse();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/history']);
  });

  it('StepReviewComponent shows a toast and clears confirming when confirmFiling rejects', async () => {
    filingServiceSpy.compute.and.resolveTo({
      totalGrossIncome: 5_000_000,
      totalCapitalAllowances: 0,
      proratedCapitalAllowances: 0,
      totalDeductions: 0,
      chargeableIncome: 5_000_000,
      bandBreakdown: [],
      graduatedTax: 690_000,
      whtCredits: 0,
      payeCredits: 0,
      foreignTaxCredits: 0,
      netTaxPayable: 690_000,
      minimumTax: 0,
      finalTaxPayable: 690_000,
      cgtExemptAmount: 0,
      digitalAssetLossRingfenced: 0,
      configVersion: 'NTA 2025',
      rentReliefApplied: 0,
    });
    filingServiceSpy.confirmFiling.and.rejectWith(new Error('Filing is already confirmed'));

    const fixture = TestBed.createComponent(StepReviewComponent);
    fixture.componentRef.setInput('filingId', 'filing-draft-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    await fixture.componentInstance.confirm();
    expect(toastSpy.error).toHaveBeenCalledWith(jasmine.stringContaining('Filing is already confirmed'));
    expect(fixture.componentInstance.confirming()).toBeFalse();
  });
});
