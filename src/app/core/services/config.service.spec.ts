import { TestBed } from '@angular/core/testing';
import { ConfigService } from './config.service';
import { TauriService } from './tauri.service';
import { TaxConfig } from '../models';

describe('ConfigService', () => {
  let service: ConfigService;
  let tauriSpy: jasmine.SpyObj<TauriService>;

  const mockConfig: TaxConfig = {
    id: 'config-123',
    versionLabel: '2025-v1',
    governedBy: 'NTA 2025',
    bands: [],
    reliefCaps: { rentReliefCap: 100000, rentReliefRate: 0.1 },
    cgtThresholds: { proceedsThreshold: 25000000, gainThreshold: 1000000 },
    allowanceRates: {},
    minimumTaxRate: 0.01,
    isActive: true,
    lastModified: new Date().toISOString(),
    modifiedBy: 'system'
  };

  beforeEach(() => {
    const spy = jasmine.createSpyObj('TauriService', ['invoke']);

    TestBed.configureTestingModule({
      providers: [
        ConfigService,
        { provide: TauriService, useValue: spy }
      ]
    });

    service = TestBed.inject(ConfigService);
    tauriSpy = TestBed.inject(TauriService) as jasmine.SpyObj<TauriService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should load active config', async () => {
    tauriSpy.invoke.and.resolveTo(mockConfig);
    const result = await service.loadActive();
    expect(tauriSpy.invoke).toHaveBeenCalledWith('get_active_config');
    expect(service.activeConfig()).toEqual(mockConfig);
    expect(result).toEqual(mockConfig);
  });

  it('should list versions', async () => {
    tauriSpy.invoke.and.resolveTo([mockConfig]);
    const result = await service.listVersions();
    expect(tauriSpy.invoke).toHaveBeenCalledWith('list_configs');
    expect(result).toEqual([mockConfig]);
  });

  it('should save config', async () => {
    tauriSpy.invoke.and.resolveTo(mockConfig);
    await service.save(mockConfig as any);
    expect(tauriSpy.invoke).toHaveBeenCalledWith('save_config', { config: mockConfig as any });
    expect(service.activeConfig()).toEqual(mockConfig);
  });

  it('should export json', async () => {
    tauriSpy.invoke.and.resolveTo('{}');
    const result = await service.exportJson('id');
    expect(tauriSpy.invoke).toHaveBeenCalledWith('export_config_json', { id: 'id' });
    expect(result).toBe('{}');
  });

  it('should import json', async () => {
    tauriSpy.invoke.and.resolveTo(mockConfig);
    await service.importJson('{}');
    expect(tauriSpy.invoke).toHaveBeenCalledWith('import_config_json', { json: '{}' });
    expect(service.activeConfig()).toEqual(mockConfig);
  });

  it('should get the config tied to a filing without changing the active config', async () => {
    tauriSpy.invoke.and.resolveTo(mockConfig);
    const result = await service.getForFiling('filing-9');
    expect(tauriSpy.invoke).toHaveBeenCalledWith('get_config_for_filing', { filingId: 'filing-9' });
    expect(result).toEqual(mockConfig);
    expect(service.activeConfig()).toBeNull();
  });

  it('should load migration notices', async () => {
    tauriSpy.invoke.and.resolveTo(['Rates updated']);
    const result = await service.getMigrationNotices();
    expect(tauriSpy.invoke).toHaveBeenCalledWith('get_migration_notices');
    expect(result).toEqual(['Rates updated']);
    expect(service.migrationNotices()).toEqual(['Rates updated']);
  });

  it('should treat a non-array migration notice payload as empty', async () => {
    tauriSpy.invoke.and.resolveTo(null);
    expect(await service.getMigrationNotices()).toEqual([]);
    expect(service.migrationNotices()).toEqual([]);
  });

  it('should dismiss migration notices locally and in the backend', async () => {
    tauriSpy.invoke.and.resolveTo(['a']);
    await service.getMigrationNotices();
    tauriSpy.invoke.and.resolveTo(undefined);
    await service.dismissMigrationNotices();
    expect(tauriSpy.invoke).toHaveBeenCalledWith('dismiss_migration_notices');
    expect(service.migrationNotices()).toEqual([]);
  });

  it('should clear migration notices without calling the backend', async () => {
    tauriSpy.invoke.and.resolveTo(['a']);
    await service.getMigrationNotices();
    tauriSpy.invoke.calls.reset();
    service.clearMigrationNotices();
    expect(service.migrationNotices()).toEqual([]);
    expect(tauriSpy.invoke).not.toHaveBeenCalled();
  });
});
