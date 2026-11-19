import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { DashboardComponent } from './dashboard.component';
import { FilingService } from '../../core/services/filing.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { Filing, Taxpayer } from '../../core/models';
import { LUCIDE_ICONS, LucideIconProvider, icons, AlertTriangle, CheckCircle } from 'lucide-angular';

describe('DashboardComponent', () => {
  let filingServiceSpy: jasmine.SpyObj<FilingService>;
  let toastSpy: jasmine.SpyObj<ToastService>;

  const taxpayerSig = signal<Taxpayer | null>({
    id: 'tp-1',
    fullName: 'Adaeze Obi',
    tin: '1234567890123',
    createdAt: '2025-01-01T00:00:00Z',
  });

  beforeEach(async () => {
    filingServiceSpy = jasmine.createSpyObj('FilingService', ['listFilings']);
    toastSpy = jasmine.createSpyObj('ToastService', ['error', 'success', 'info', 'warning']);
    filingServiceSpy.listFilings.and.resolveTo([]);

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: FilingService, useValue: filingServiceSpy },
        { provide: AuthService, useValue: { taxpayer: taxpayerSig } },
        { provide: ToastService, useValue: toastSpy },
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ ...icons, AlertTriangle, CheckCircle }) },
      ],
    }).compileComponents();
  });

  it('counts Confirmed and Submitted returns and deduplicates amended years by latest confirmedAt', async () => {
    const filings: Filing[] = [
      // 2023 original (Confirmed) + 2023 amendment (Submitted, later confirmedAt)
      {
        id: 'f-2023-orig',
        taxpayerId: 'tp-1',
        yearOfAssessment: 2023,
        status: 'Confirmed',
        createdAt: '2024-02-01T00:00:00Z',
        confirmedAt: '2024-02-02T00:00:00Z',
        totalIncomeNgn: 4_000_000,
        finalTaxPayable: 500_000,
        taxConfigVersion: 'PITA',
      },
      {
        id: 'f-2023-amend',
        taxpayerId: 'tp-1',
        parentFilingId: 'f-2023-orig',
        yearOfAssessment: 2023,
        status: 'Submitted',
        createdAt: '2024-03-01T00:00:00Z',
        confirmedAt: '2024-03-02T00:00:00Z',
        totalIncomeNgn: 5_000_000,
        finalTaxPayable: 700_000,
        taxConfigVersion: 'PITA',
      },
      // 2024 Submitted
      {
        id: 'f-2024',
        taxpayerId: 'tp-1',
        yearOfAssessment: 2024,
        status: 'Submitted',
        createdAt: '2025-02-01T00:00:00Z',
        confirmedAt: '2025-02-02T00:00:00Z',
        totalIncomeNgn: 6_000_000,
        finalTaxPayable: 900_000,
        taxConfigVersion: 'PITA',
      },
      // 2025 Draft (must not be counted)
      {
        id: 'f-2025-draft',
        taxpayerId: 'tp-1',
        yearOfAssessment: 2025,
        status: 'Draft',
        createdAt: '2026-01-01T00:00:00Z',
        taxConfigVersion: 'PITA',
      },
    ];
    filingServiceSpy.listFilings.and.resolveTo(filings);

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.confirmedCount()).toBe(2);
    expect(comp.lifetimeTotal()).toBe(1_600_000); // 700k (latest 2023) + 900k (2024), NOT 500k+700k+900k
    expect(comp.chartData().length).toBe(2);
    expect(comp.chartData()[0].tax).toBe(700_000);
  });

  it('computes deadline banner accurately in February, April, and December and checks only the previous income year', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const comp = fixture.componentInstance;

    const filed2025: Filing = {
      id: 'f-2025',
      taxpayerId: 'tp-1',
      yearOfAssessment: 2025,
      status: 'Submitted',
      createdAt: '2026-01-15T00:00:00Z',
      confirmedAt: '2026-01-16T00:00:00Z',
      totalIncomeNgn: 5_000_000,
      finalTaxPayable: 690_000,
      taxConfigVersion: 'PITA',
    };

    // February 15, 2026 -> 44 days before March 31, 2026 -> banner SHOWN
    comp.evaluateMetrics([filed2025], new Date(2026, 1, 15));
    expect(comp.showDeadlineBanner()).toBeTrue();
    expect(comp.deadlineYear()).toBe(2026);
    expect(comp.daysLeft()).toBe(44);
    expect(comp.missingPreviousYear()).toBeFalse();

    // April 10, 2026 -> March 31, 2026 passed -> target March 31, 2027 (>60 days) -> banner HIDDEN
    comp.evaluateMetrics([filed2025], new Date(2026, 3, 10));
    expect(comp.showDeadlineBanner()).toBeFalse();
    expect(comp.deadlineYear()).toBe(2027);

    // December 15, 2026 -> target March 31, 2027 (106 days away) -> banner HIDDEN
    comp.evaluateMetrics([], new Date(2026, 11, 15));
    expect(comp.showDeadlineBanner()).toBeFalse();
    expect(comp.deadlineYear()).toBe(2027);
    expect(comp.missingPreviousYear()).toBeTrue();
  });
});
