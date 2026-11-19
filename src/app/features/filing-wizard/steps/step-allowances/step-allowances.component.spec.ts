import { TestBed } from '@angular/core/testing';
import { StepAllowancesComponent } from './step-allowances.component';
import { FilingService } from '../../../../core/services/filing.service';
import { ConfigService } from '../../../../core/services/config.service';
import { ToastService } from '../../../../core/services/toast.service';
import { CapitalAllowance } from '../../../../core/models';
import {
  LUCIDE_ICONS,
  LucideIconProvider,
  History,
  Paperclip,
  Upload,
  HelpCircle,
  Download,
} from 'lucide-angular';

describe('StepAllowancesComponent', () => {
  let filingServiceSpy: jasmine.SpyObj<FilingService>;
  let toastSpy: jasmine.SpyObj<ToastService>;

  beforeEach(async () => {
    filingServiceSpy = jasmine.createSpyObj('FilingService', [
      'listAllowances',
      'upsertAllowance',
      'deleteAllowance',
      'getPriorYearAllowances',
      'attachDocument',
    ]);
    toastSpy = jasmine.createSpyObj('ToastService', ['error', 'success', 'info', 'warning']);
    filingServiceSpy.listAllowances.and.resolveTo([]);
    filingServiceSpy.upsertAllowance.and.callFake(async (a: CapitalAllowance) => a);
    filingServiceSpy.deleteAllowance.and.resolveTo();

    await TestBed.configureTestingModule({
      imports: [StepAllowancesComponent],
      providers: [
        { provide: FilingService, useValue: filingServiceSpy },
        { provide: ConfigService, useValue: { activeConfig: () => null } },
        { provide: ToastService, useValue: toastSpy },
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({ History, Paperclip, Upload, HelpCircle, Download }),
        },
      ],
    }).compileComponents();
  });

  function createComponent() {
    const fixture = TestBed.createComponent(StepAllowancesComponent);
    fixture.componentRef.setInput('filingId', 'filing-1');
    fixture.componentRef.setInput('yearOfAssessment', 2025);
    fixture.detectChanges();
    return fixture;
  }

  it('keeps WDV equal to cost when raising or lowering a new asset cost', async () => {
    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.addEntry();
    const asset = comp.entries()[0];

    asset.assetCost = 500_000;
    comp.onCostChange(asset);
    expect(asset.taxWrittenDownValue).toBe(500_000);
    expect(asset.annualAllowanceAmount).toBe(125_000);

    // Raising the cost must also raise WDV for a new asset
    asset.assetCost = 800_000;
    comp.onCostChange(asset);
    expect(asset.taxWrittenDownValue).toBe(800_000);
    expect(asset.annualAllowanceAmount).toBe(200_000);
  });

  it('Load from Prior Year skips assets already present on the filing', async () => {
    const existingCarried: CapitalAllowance = {
      id: 'existing-1',
      filingId: 'filing-1',
      assetDescription: 'MacBook Pro',
      assetType: 'computer_laptop',
      assetCost: 2_000_000,
      acquisitionDate: '2024-03-01',
      taxWrittenDownValue: 1_500_000,
      annualAllowanceRate: 0.25,
      annualAllowanceAmount: 500_000,
      documents: [],
    };
    filingServiceSpy.listAllowances.and.resolveTo([existingCarried]);
    filingServiceSpy.getPriorYearAllowances.and.resolveTo([
      {
        assetDescription: 'MacBook Pro',
        assetType: 'computer_laptop',
        assetCost: 2_000_000,
        acquisitionDate: '2024-03-01',
        taxWrittenDownValue: 1_500_000,
        annualAllowanceRate: 0.25,
        annualAllowanceAmount: 500_000,
      },
      {
        assetDescription: 'Dell Monitor',
        assetType: 'monitor',
        assetCost: 400_000,
        acquisitionDate: '2024-06-15',
        taxWrittenDownValue: 300_000,
        annualAllowanceRate: 0.25,
        annualAllowanceAmount: 100_000,
      },
    ]);

    const fixture = createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.entries().length).toBe(1);

    await comp.loadFromPriorYear();
    expect(comp.entries().length).toBe(2);
    expect(comp.entries().map(e => e.assetDescription)).toEqual(['MacBook Pro', 'Dell Monitor']);

    // Calling again skips everything already present
    await comp.loadFromPriorYear();
    expect(comp.entries().length).toBe(2);
  });
});
