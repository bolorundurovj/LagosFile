import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
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

describe('ConfigurationComponent (editing, saving and FX cache)', () => {
  let configServiceSpy: jasmine.SpyObj<ConfigService>;
  let fxServiceSpy: jasmine.SpyObj<FxService>;
  let toastSpy: jasmine.SpyObj<ToastService>;
  let fixture: ComponentFixture<ConfigurationComponent>;
  let comp: ConfigurationComponent;

  const config: TaxConfig = {
    id: 'cfg-1',
    versionLabel: 'NTA 2025 / Base',
    governedBy: 'NTA 2025',
    bands: [
      { lower: 0, upper: 800_000, rate: 0 },
      { lower: 800_000, upper: null, rate: 0.15 },
    ],
    reliefCaps: { rentReliefCap: 500_000, rentReliefRate: 0.2 },
    cgtThresholds: { proceedsThreshold: 150_000_000, gainThreshold: 10_000_000 },
    allowanceRates: { computer_laptop: 0.25, mystery_asset: 0.1 },
    minimumTaxRate: 0,
    isActive: true,
    lastModified: '2026-01-01T00:00:00Z',
    modifiedBy: 'system',
  };

  beforeEach(async () => {
    configServiceSpy = jasmine.createSpyObj('ConfigService', ['loadActive', 'save', 'exportJson', 'importJson']);
    fxServiceSpy = jasmine.createSpyObj('FxService', ['getCachedRates', 'clearCache']);
    toastSpy = jasmine.createSpyObj('ToastService', ['error', 'success']);
    configServiceSpy.loadActive.and.resolveTo(config);

    await TestBed.configureTestingModule({
      imports: [ConfigurationComponent],
      providers: [
        { provide: ConfigService, useValue: configServiceSpy },
        { provide: FxService, useValue: fxServiceSpy },
        { provide: ToastService, useValue: toastSpy },
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ ...icons, AlertTriangle, CheckCircle }) },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ConfigurationComponent);
    comp = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('populates the form from the active config with labelled allowance rates', () => {
    expect(comp.config()).toEqual(config);
    expect(comp.bands()).toEqual(config.bands);
    expect(comp.bands()[0]).not.toBe(config.bands[0]);
    expect(comp.reliefCaps).toEqual({ rentReliefCap: 500_000, rentReliefRate: 0.2, pensionCap: null, nhisCap: null, nhfCap: null });
    expect(comp.minimumTaxRate).toBe(0);
    expect(comp.allowanceRateEntries()).toEqual([
      { key: 'computer_laptop', rate: 0.25, label: 'Computer / Laptop' },
      { key: 'mystery_asset', rate: 0.1, label: 'mystery_asset' },
    ]);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('NTA 2025 / Base');
    expect(text).toContain('Computer / Laptop');
    expect(fixture.nativeElement.querySelectorAll('.data-table tbody tr').length).toBe(2);
  });

  it('shows a skeleton when the config cannot be loaded', async () => {
    configServiceSpy.loadActive.and.rejectWith(new Error('locked'));
    const f = TestBed.createComponent(ConfigurationComponent);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    expect(f.componentInstance.config()).toBeNull();
    expect(f.nativeElement.querySelector('.skeleton')).not.toBeNull();
  });

  it('returns the NTA section reference for known keys only', () => {
    expect(comp.ntaSection('bands')).toContain('Fourth Schedule');
    expect(comp.ntaSection('nope')).toBe('');
  });

  it('adds and removes tax bands', () => {
    comp.addBand();
    expect(comp.bands().length).toBe(3);
    expect(comp.bands()[2]).toEqual({ lower: 0, upper: null, rate: 0 });
    comp.removeBand(0);
    expect(comp.bands().map(b => b.lower)).toEqual([800_000, 0]);
  });

  it('parses the upper threshold input, treating blank as unlimited', () => {
    const band = comp.bands()[1];
    comp.onUpperChange(band, { target: { value: '3200000' } } as unknown as Event);
    expect(band.upper).toBe(3_200_000);
    comp.onUpperChange(band, { target: { value: '' } } as unknown as Event);
    expect(band.upper).toBeNull();
  });

  it('updates a single allowance rate entry', () => {
    comp.onAllowanceRateChange({ key: 'computer_laptop', rate: 0.5 });
    expect(comp.allowanceRateEntries().map(e => e.rate)).toEqual([0.5, 0.1]);
  });

  it('requires a version label before saving', async () => {
    comp.versionLabel = '   ';
    await comp.save();
    expect(configServiceSpy.save).not.toHaveBeenCalled();
    expect(comp.saveError()).toBe('Please enter a unique version label before saving.');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.alert--error').textContent).toContain('unique version label');
  });

  it('saves the edited config as a new version and shows success for 4 seconds', fakeAsync(() => {
    const saved: TaxConfig = { ...config, id: 'cfg-2', versionLabel: 'v2' };
    configServiceSpy.save.and.resolveTo(saved);
    comp.versionLabel = '  v2  ';
    comp.minimumTaxRate = 0.01;
    comp.onAllowanceRateChange({ key: 'computer_laptop', rate: 0.5 });
    comp.save();
    expect(comp.saving()).toBeTrue();
    flushMicrotasks();

    expect(configServiceSpy.save).toHaveBeenCalledWith({
      versionLabel: 'v2',
      governedBy: 'NTA 2025',
      bands: config.bands,
      reliefCaps: { rentReliefCap: 500_000, rentReliefRate: 0.2, pensionCap: null, nhisCap: null, nhfCap: null },
      cgtThresholds: config.cgtThresholds,
      allowanceRates: { computer_laptop: 0.5, mystery_asset: 0.1 },
      minimumTaxRate: 0.01,
    });
    expect(comp.config()).toEqual(saved);
    expect(comp.versionLabel).toBe('');
    expect(comp.saving()).toBeFalse();
    expect(comp.saveSuccess()).toBeTrue();
    tick(4000);
    expect(comp.saveSuccess()).toBeFalse();
  }));

  it('falls back to NTA 2025 for governedBy when no config is loaded', async () => {
    comp.config.set(null);
    configServiceSpy.save.and.resolveTo(config);
    comp.versionLabel = 'v3';
    await comp.save();
    expect(configServiceSpy.save.calls.mostRecent().args[0].governedBy).toBe('NTA 2025');
  });

  it('shows the save error and clears the saving flag', async () => {
    comp.versionLabel = 'dup';
    configServiceSpy.save.and.rejectWith(new Error('Version label already exists'));
    await comp.save();
    expect(comp.saveError()).toBe('Version label already exists');
    expect(comp.saving()).toBeFalse();
    configServiceSpy.save.and.callFake(() => Promise.reject('plain'));
    await comp.save();
    expect(comp.saveError()).toBe('plain');
  });

  it('loads and lists cached FX rates', async () => {
    fxServiceSpy.getCachedRates.and.resolveTo([
      { id: 'fx1', baseCurrency: 'USD', quoteCurrency: 'NGN', rate: 1550.5, rateDate: '2025-06-01', source: 'cache', fetchedAt: '2025-06-01T00:00:00Z' },
    ]);
    await comp.loadFxCache();
    fixture.detectChanges();
    expect(comp.fxEntries().length).toBe(1);
    expect(comp.fxLoading()).toBeFalse();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('USD/NGN');
    expect(text).toContain('1550.5000');
    expect(text).toContain('Clear All Cached Rates (1)');
  });

  it('ignores FX cache load errors', async () => {
    fxServiceSpy.getCachedRates.and.rejectWith(new Error('offline'));
    await comp.loadFxCache();
    expect(comp.fxEntries()).toEqual([]);
    expect(comp.fxLoading()).toBeFalse();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No cached rates');
  });

  it('clears the FX cache', async () => {
    comp.fxEntries.set([{ id: 'fx1' } as never]);
    fxServiceSpy.clearCache.and.resolveTo();
    await comp.clearFxCache();
    expect(comp.fxEntries()).toEqual([]);
    expect(toastSpy.success).toHaveBeenCalledWith('FX rate cache cleared.');
    expect(comp.fxClearing()).toBeFalse();
  });

  it('reports FX cache clearing failures', async () => {
    comp.fxEntries.set([{ id: 'fx1' } as never]);
    fxServiceSpy.clearCache.and.rejectWith(new Error('busy'));
    await comp.clearFxCache();
    expect(comp.fxEntries().length).toBe(1);
    expect(toastSpy.error).toHaveBeenCalledWith('Failed to clear cache: busy');
    fxServiceSpy.clearCache.and.callFake(() => Promise.reject('nope'));
    await comp.clearFxCache();
    expect(toastSpy.error).toHaveBeenCalledWith('Failed to clear cache: nope');
  });

  describe('export and import', () => {
    const win = window as unknown as Record<'__TAURI_INTERNALS__', unknown>;
    let saved: unknown;
    let invoke: jasmine.Spy;
    let savePath: string | null;

    beforeEach(() => {
      saved = win.__TAURI_INTERNALS__;
      savePath = 'C:/exports/cfg.json';
      invoke = jasmine.createSpy('invoke').and.callFake(async (cmd: string) => (cmd === 'plugin:dialog|save' ? savePath : null));
      win.__TAURI_INTERNALS__ = { invoke };
      configServiceSpy.exportJson.and.resolveTo('{"id":"cfg-1"}');
    });

    afterEach(() => {
      win.__TAURI_INTERNALS__ = saved;
    });

    it('exports to a sanitised file name and writes the JSON', async () => {
      await comp.exportConfig();
      expect(configServiceSpy.exportJson).toHaveBeenCalledWith('cfg-1');
      const dialog = invoke.calls.all().find(c => c.args[0] === 'plugin:dialog|save')!;
      expect(dialog.args[1].options.defaultPath).toBe('NTA_2025_Base.json');
      const write = invoke.calls.all().find(c => c.args[0] === 'plugin:fs|write_text_file')!;
      expect(new TextDecoder().decode(write.args[1])).toBe('{"id":"cfg-1"}');
      expect(decodeURIComponent(write.args[2].headers.path)).toBe('C:/exports/cfg.json');
      expect(toastSpy.success).toHaveBeenCalledWith('Tax configuration exported.');
    });

    it('uses a default file name when the label has no safe characters', async () => {
      comp.config.set({ ...config, versionLabel: '///' });
      await comp.exportConfig();
      const dialog = invoke.calls.all().find(c => c.args[0] === 'plugin:dialog|save')!;
      expect(dialog.args[1].options.defaultPath).toBe('tax-config.json');
    });

    it('does not write when the save dialog is cancelled', async () => {
      savePath = null;
      await comp.exportConfig();
      expect(invoke.calls.all().some(c => c.args[0] === 'plugin:fs|write_text_file')).toBeFalse();
      expect(toastSpy.success).not.toHaveBeenCalled();
    });

    it('does nothing without a loaded config', async () => {
      comp.config.set(null);
      await comp.exportConfig();
      expect(configServiceSpy.exportJson).not.toHaveBeenCalled();
    });

    it('reports export failures', async () => {
      configServiceSpy.exportJson.and.rejectWith(new Error('no such config'));
      await comp.exportConfig();
      expect(toastSpy.error).toHaveBeenCalledWith('Could not export configuration: no such config');
      configServiceSpy.exportJson.and.callFake(() => Promise.reject('raw'));
      await comp.exportConfig();
      expect(toastSpy.error).toHaveBeenCalledWith('Could not export configuration: raw');
    });

    it('imports a JSON file, reloads the active config and resets the input', async () => {
      const imported: TaxConfig = { ...config, id: 'cfg-9', versionLabel: 'Imported' };
      configServiceSpy.importJson.and.resolveTo(imported);
      configServiceSpy.loadActive.and.resolveTo(imported);
      const input = { files: [new File(['{}'], 'c.json')], value: 'c.json' };
      await comp.importConfig({ target: input } as unknown as Event);
      expect(configServiceSpy.importJson).toHaveBeenCalledWith('{}');
      expect(comp.config()?.versionLabel).toBe('Imported');
      expect(input.value).toBe('');
      expect(comp.importError()).toBe('');
    });

    it('shows import errors and still resets the input', async () => {
      configServiceSpy.importJson.and.rejectWith(new Error('Invalid config JSON'));
      const input = { files: [new File(['x'], 'c.json')], value: 'c.json' };
      await comp.importConfig({ target: input } as unknown as Event);
      expect(comp.importError()).toBe('Invalid config JSON');
      expect(input.value).toBe('');
      configServiceSpy.importJson.and.callFake(() => Promise.reject('bad'));
      await comp.importConfig({ target: { files: [new File(['x'], 'c.json')], value: '' } } as unknown as Event);
      expect(comp.importError()).toBe('bad');
    });

    it('ignores an empty file selection', async () => {
      await comp.importConfig({ target: { files: [], value: '' } } as unknown as Event);
      expect(configServiceSpy.importJson).not.toHaveBeenCalled();
    });
  });
});
