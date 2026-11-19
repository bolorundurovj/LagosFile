import { TestBed } from '@angular/core/testing';
import { ConfigurationComponent } from './configuration.component';
import { ConfigService } from '../../core/services/config.service';
import { FxService } from '../../core/services/fx.service';
import { ToastService } from '../../core/services/toast.service';
import { TaxConfig } from '../../core/models';
import { LUCIDE_ICONS, LucideIconProvider, icons, AlertTriangle, CheckCircle } from 'lucide-angular';

describe('ConfigurationComponent', () => {
  let configServiceSpy: jasmine.SpyObj<ConfigService>;
  let fxServiceSpy: jasmine.SpyObj<FxService>;
  let toastSpy: jasmine.SpyObj<ToastService>;

  const sampleConfig: TaxConfig = {
    id: 'cfg-1',
    versionLabel: 'NTA 2025',
    governedBy: 'NTA 2025',
    bands: [
      { lower: 0, upper: 800_000, rate: 0 },
      { lower: 800_000, upper: null, rate: 0.15 },
    ],
    reliefCaps: { rentReliefCap: 500_000, rentReliefRate: 0.2 },
    cgtThresholds: { proceedsThreshold: 150_000_000, gainThreshold: 10_000_000 },
    allowanceRates: { computer_laptop: 0.25 },
    minimumTaxRate: 0,
    isActive: true,
    lastModified: '2026-01-01T00:00:00Z',
    modifiedBy: 'system',
  };

  beforeEach(async () => {
    configServiceSpy = jasmine.createSpyObj('ConfigService', [
      'loadActive',
      'save',
      'exportJson',
      'importJson',
    ]);
    fxServiceSpy = jasmine.createSpyObj('FxService', ['getCachedRates', 'clearCache']);
    toastSpy = jasmine.createSpyObj('ToastService', ['error', 'success', 'info', 'warning']);

    configServiceSpy.loadActive.and.resolveTo(sampleConfig);
    configServiceSpy.importJson.and.resolveTo({ ...sampleConfig, id: 'cfg-2', versionLabel: 'NTA 2025 (imported)' });

    await TestBed.configureTestingModule({
      imports: [ConfigurationComponent],
      providers: [
        { provide: ConfigService, useValue: configServiceSpy },
        { provide: FxService, useValue: fxServiceSpy },
        { provide: ToastService, useValue: toastSpy },
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ ...icons, AlertTriangle, CheckCircle }) },
      ],
    }).compileComponents();
  });

  it('importConfig sends raw JSON text string (not a parsed object) to ConfigService.importJson', async () => {
    const fixture = TestBed.createComponent(ConfigurationComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const jsonText = JSON.stringify(sampleConfig);
    const fakeFile = new File([jsonText], 'tax-config.json', { type: 'application/json' });
    const fakeInput = { files: [fakeFile], value: 'tax-config.json' } as unknown as HTMLInputElement;

    await fixture.componentInstance.importConfig({ target: fakeInput } as unknown as Event);

    expect(configServiceSpy.importJson).toHaveBeenCalledWith(jsonText);
    expect(typeof configServiceSpy.importJson.calls.mostRecent().args[0]).toBe('string');
    expect(toastSpy.success).toHaveBeenCalled();
  });
});
