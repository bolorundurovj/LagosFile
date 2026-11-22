import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, ParamMap, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { FilingWizardComponent } from './filing-wizard.component';
import { StepReviewComponent } from './steps/step-review/step-review.component';
import { FilingService } from '../../core/services/filing.service';
import { AuthService } from '../../core/services/auth.service';
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
      'saveIncomeEntries',
      'listAllowances',
      'saveAllowances',
      'listReliefEntries',
      'upsertReliefEntry',
      'deleteReliefEntry',
      'saveReliefEntries',
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
    filingServiceSpy.saveIncomeEntries.and.callFake(async (_fid, upserts) => upserts.map(u => u.id ?? ''));
    filingServiceSpy.listAllowances.and.resolveTo([]);
    filingServiceSpy.saveAllowances.and.callFake(async (_fid, upserts) => upserts.map(u => u.id ?? ''));
    filingServiceSpy.listReliefEntries.and.resolveTo([]);
    filingServiceSpy.saveReliefEntries.and.callFake(async (_fid, upserts) => upserts.map(u => u.id ?? ''));
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
    filingServiceSpy.saveIncomeEntries.and.callFake(async (_fid, upserts, deleteIds) => {
      for (const delId of deleteIds) {
        const idx = savedStore.findIndex(x => x.id === delId);
        if (idx >= 0) savedStore.splice(idx, 1);
      }
      for (const u of upserts) {
        const e = u as IncomeEntry;
        const idx = savedStore.findIndex(x => x.id === e.id);
        if (idx >= 0) savedStore[idx] = { ...e };
        else savedStore.push({ ...e });
      }
      return upserts.map(u => u.id ?? '');
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
    expect(filingServiceSpy.saveIncomeEntries).toHaveBeenCalledTimes(1);
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
    const auth = TestBed.inject(AuthService);
    (auth as unknown as { _state: { set(v: string): void } })._state.set('unlocked');
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

  it('StepReviewComponent allows confirming returns with only CGT-exempt gains or digital-asset losses', async () => {
    filingServiceSpy.compute.and.resolveTo({
      totalGrossIncome: 0,
      totalCapitalAllowances: 0,
      proratedCapitalAllowances: 0,
      totalDeductions: 0,
      chargeableIncome: 0,
      bandBreakdown: [],
      graduatedTax: 0,
      whtCredits: 0,
      payeCredits: 0,
      foreignTaxCredits: 0,
      netTaxPayable: 0,
      minimumTax: 0,
      finalTaxPayable: 0,
      cgtExemptAmount: 5_000_000,
      digitalAssetLossRingfenced: 0,
      configVersion: 'NTA 2025',
      rentReliefApplied: 0,
    });
    filingServiceSpy.listIncomeEntries.and.resolveTo([
      {
        id: 'cgt-1',
        filingId: 'filing-draft-1',
        incomeType: 'capital_gain_shares',
        grossAmountNgn: 5_000_000,
        cgtProceeds: 20_000_000,
        cgtGain: 5_000_000,
        isForeign: false,
        isCgtExempt: true,
        documents: [],
      },
    ]);

    const fixture = TestBed.createComponent(StepReviewComponent);
    fixture.componentRef.setInput('filingId', 'filing-draft-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.validationIssues().length).toBe(0);

    // Digital-asset loss only should also be confirmable
    fixture.componentInstance.result.set({
      ...fixture.componentInstance.result()!,
      cgtExemptAmount: 0,
      digitalAssetLossRingfenced: 1_200_000,
    });
    expect(fixture.componentInstance.validationIssues().length).toBe(0);

    // Truly empty return (no income entries, zero gross/exempt/loss) is still blocked
    fixture.componentInstance.hasExemptOrDigitalIncome.set(false);
    fixture.componentInstance.result.set({
      ...fixture.componentInstance.result()!,
      cgtExemptAmount: 0,
      digitalAssetLossRingfenced: 0,
    });
    expect(fixture.componentInstance.validationIssues().length).toBe(1);
  });

  it('canDeactivate bypasses confirmation dialog when vault is locked', () => {
    const auth = TestBed.inject(AuthService);
    (auth as unknown as { _state: { set(v: string): void } })._state.set('locked');
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);

    const fixture = TestBed.createComponent(FilingWizardComponent);
    fixture.componentInstance.mode.set('active');
    expect(fixture.componentInstance.canDeactivate()).toBeTrue();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe('FilingWizardComponent (navigation and route changes)', () => {
  let filingServiceSpy: jasmine.SpyObj<FilingService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let toastSpy: jasmine.SpyObj<ToastService>;
  let paramMap$: BehaviorSubject<ParamMap>;
  let fixture: ComponentFixture<FilingWizardComponent>;
  let comp: FilingWizardComponent;

  const confirmed: Filing = {
    id: 'filing-c-1',
    taxpayerId: 'tp-1',
    yearOfAssessment: 2023,
    status: 'Confirmed',
    createdAt: '2024-02-01T00:00:00Z',
    confirmedAt: '2024-02-02T00:00:00Z',
    payeCredit: 120_000,
    foreignTaxCredit: 30_000,
    taxConfigVersion: 'PITA',
  };

  function stepRef(dirty: boolean, saveResult = true) {
    return { isDirty: () => dirty, save: jasmine.createSpy('save').and.resolveTo(saveResult) };
  }

  async function create(id: string | null): Promise<void> {
    paramMap$ = new BehaviorSubject(convertToParamMap(id ? { id } : {}));
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { paramMap: paramMap$.asObservable(), snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } },
    });
    fixture = TestBed.createComponent(FilingWizardComponent);
    comp = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    filingServiceSpy = jasmine.createSpyObj('FilingService', [
      'getFiling', 'listIncomeEntries', 'listAllowances', 'listReliefEntries', 'amendFiling', 'createDraft',
    ]);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    routerSpy.navigate.and.resolveTo(true);
    toastSpy = jasmine.createSpyObj('ToastService', ['error', 'success']);
    filingServiceSpy.getFiling.and.resolveTo(confirmed);
    filingServiceSpy.listIncomeEntries.and.resolveTo([
      { id: 'i1', filingId: 'filing-c-1', incomeType: 'employment', grossAmountNgn: 4_000_000, isForeign: false, isCgtExempt: false, documents: [] },
    ]);
    filingServiceSpy.listAllowances.and.resolveTo([
      { id: 'a1', filingId: 'filing-c-1', assetDescription: 'Laptop', assetType: 'computer_laptop', assetCost: 1, acquisitionDate: '', taxWrittenDownValue: 1, annualAllowanceRate: 0.25, annualAllowanceAmount: 250_000, documents: [] },
    ]);
    filingServiceSpy.listReliefEntries.and.resolveTo([
      { id: 'r1', filingId: 'filing-c-1', reliefType: 'pension', claimedAmount: 1, approvedAmount: 320_000, documents: [] },
    ]);

    await TestBed.configureTestingModule({
      imports: [FilingWizardComponent],
      providers: [
        { provide: FilingService, useValue: filingServiceSpy },
        { provide: Router, useValue: routerSpy },
        { provide: ToastService, useValue: toastSpy },
        { provide: ActivatedRoute, useValue: {} },
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ FileText, Check }) },
      ],
    }).compileComponents();
  });

  it('renders read-only income, allowances, reliefs and optional credits', async () => {
    await create('filing-c-1');
    const text = fixture.nativeElement.textContent as string;
    expect(comp.mode()).toBe('readonly');
    expect(text).toContain('Filed Return');
    expect(text).toContain('Income Entries (1)');
    expect(text).toContain('Capital Allowances (1)');
    expect(text).toContain('Laptop (computer_laptop)');
    expect(text).toContain('Deductions & Reliefs (1)');
    expect(text).toContain('PAYE Credits');
    expect(text).toContain('Foreign Tax Credits');
  });

  it('reloads when the route id changes but ignores the initial emission', async () => {
    await create('filing-c-1');
    expect(filingServiceSpy.getFiling).toHaveBeenCalledTimes(1);

    filingServiceSpy.getFiling.and.resolveTo({ ...confirmed, id: 'draft-2', status: 'Draft', yearOfAssessment: 2024 });
    paramMap$.next(convertToParamMap({ id: 'draft-2' }));
    await fixture.whenStable();
    expect(filingServiceSpy.getFiling).toHaveBeenCalledWith('draft-2');
    expect(comp.mode()).toBe('active');
    expect(comp.filingId()).toBe('draft-2');
    expect(comp.yearOfAssessment()).toBe(2024);
    expect(comp.readonlyFiling()).toBeNull();

    paramMap$.next(convertToParamMap({}));
    await fixture.whenStable();
    expect(comp.mode()).toBe('selecting-year');
    expect(comp.filingId()).toBeUndefined();
  });

  it('starts in year selection for a new filing and offers the last ten years', async () => {
    await create(null);
    const year = new Date().getFullYear();
    expect(comp.mode()).toBe('selecting-year');
    expect(comp.loading()).toBeFalse();
    expect(comp.selectedYear).toBe(year - 1);
    expect(comp.availableYears.length).toBe(10);
    expect(comp.availableYears[0]).toBe(year - 1);
    expect(fixture.nativeElement.querySelectorAll('option').length).toBe(10);
  });

  it('blocks filings for the current or a future year', async () => {
    await create(null);
    comp.selectedYear = new Date().getFullYear();
    await comp.beginFiling();
    expect(toastSpy.error).toHaveBeenCalledWith(jasmine.stringContaining('past years of assessment'));
    expect(filingServiceSpy.createDraft).not.toHaveBeenCalled();
  });

  it('creates a draft for the selected year and enters the wizard', async () => {
    await create(null);
    filingServiceSpy.createDraft.and.resolveTo({ ...confirmed, id: 'draft-9', status: 'Draft', yearOfAssessment: 2022 });
    comp.selectedYear = 2022;
    await comp.beginFiling();
    expect(filingServiceSpy.createDraft).toHaveBeenCalledWith(2022);
    expect(comp.filingId()).toBe('draft-9');
    expect(comp.yearOfAssessment()).toBe(2022);
    expect(comp.mode()).toBe('active');
    expect(comp.starting()).toBeFalse();
  });

  it('reports amendment failures and ignores amend without a read-only filing', async () => {
    await create('filing-c-1');
    filingServiceSpy.amendFiling.and.rejectWith(new Error('Amendment exists'));
    await comp.amendReadonlyFiling();
    expect(toastSpy.error).toHaveBeenCalledWith('Failed to create amendment: Amendment exists');
    expect(comp.amending()).toBeFalse();
    expect(comp.mode()).toBe('readonly');

    filingServiceSpy.amendFiling.calls.reset();
    comp.readonlyFiling.set(null);
    await comp.amendReadonlyFiling();
    expect(filingServiceSpy.amendFiling).not.toHaveBeenCalled();
  });

  it('navigates to history, dashboard and back to history after confirmation', async () => {
    await create(null);
    comp.goToHistory();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/history']);
    comp.cancel();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/dashboard']);
    routerSpy.navigate.calls.reset();
    comp.onConfirmed();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/history']);
  });

  it('moves forward up to step 4 and back down to step 1', async () => {
    await create(null);
    spyOn(comp as never, 'activeStepRef').and.returnValue(undefined as never);
    comp.goNext();
    comp.goNext();
    comp.goNext();
    comp.goNext();
    expect(comp.currentStep()).toBe(4);
    await comp.goBack();
    expect(comp.currentStep()).toBe(3);
    comp.currentStep.set(1);
    await comp.goBack();
    expect(comp.currentStep()).toBe(1);
  });

  it('saves a dirty step before switching and stays put if saving fails', async () => {
    await create(null);
    const ref = stepRef(true, false);
    spyOn(comp as never, 'activeStepRef').and.returnValue(ref as never);
    await comp.goToStep(3);
    expect(ref.save).toHaveBeenCalled();
    expect(comp.currentStep()).toBe(1);

    ref.save.and.resolveTo(true);
    await comp.goToStep(3);
    expect(comp.currentStep()).toBe(3);

    ref.save.calls.reset();
    await comp.goToStep(3);
    expect(ref.save).not.toHaveBeenCalled();
  });

  it('skips saving when the step is clean', async () => {
    await create(null);
    const ref = stepRef(false);
    spyOn(comp as never, 'activeStepRef').and.returnValue(ref as never);
    await comp.goToStep(2);
    expect(ref.save).not.toHaveBeenCalled();
    expect(comp.currentStep()).toBe(2);
  });

  it('canDeactivate allows leaving read-only and clean wizards without prompting', async () => {
    await create('filing-c-1');
    const auth = TestBed.inject(AuthService);
    (auth as unknown as { _state: { set(v: string): void } })._state.set('unlocked');
    const confirmSpy = spyOn(window, 'confirm');
    expect(comp.canDeactivate()).toBeTrue();
    comp.mode.set('active');
    spyOn(comp as never, 'activeStepRef').and.returnValue(undefined as never);
    expect(comp.canDeactivate()).toBeTrue();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
