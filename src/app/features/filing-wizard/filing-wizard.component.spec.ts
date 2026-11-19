import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { FilingWizardComponent } from './filing-wizard.component';
import { FilingService } from '../../core/services/filing.service';
import { ToastService } from '../../core/services/toast.service';
import { Filing } from '../../core/models';
import { LUCIDE_ICONS, LucideIconProvider, FileText, Check } from 'lucide-angular';

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
