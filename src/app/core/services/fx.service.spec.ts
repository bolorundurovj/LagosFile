import { TestBed } from '@angular/core/testing';
import { FxService } from './fx.service';
import { TauriService } from './tauri.service';

describe('FxService', () => {
  let service: FxService;
  let tauriSpy: jasmine.SpyObj<TauriService>;

  beforeEach(() => {
    const spy = jasmine.createSpyObj('TauriService', ['invoke']);

    TestBed.configureTestingModule({
      providers: [
        FxService,
        { provide: TauriService, useValue: spy }
      ]
    });

    service = TestBed.inject(FxService);
    tauriSpy = TestBed.inject(TauriService) as jasmine.SpyObj<TauriService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('resolveRate', () => {
    it('should invoke resolve_fx_rate with correct args', async () => {
      const mockResult = { rate: 1550.5, source: 'cache' as const, rateDate: '2024-01-01', isCached: true };
      tauriSpy.invoke.and.resolveTo(mockResult);

      const result = await service.resolveRate('USD', 'NGN', '2024-01-01');

      expect(tauriSpy.invoke).toHaveBeenCalledWith('resolve_fx_rate', { base: 'USD', quote: 'NGN', targetDate: '2024-01-01' });
      expect(result).toEqual(mockResult);
    });
  });

  describe('getCachedRates', () => {
    it('should invoke list_fx_cache', async () => {
      const mockCache = [{ id: '1', baseCurrency: 'USD', quoteCurrency: 'NGN', rate: 1550, rateDate: '2024-01-01', source: 'cache', fetchedAt: '2024-01-01' }];
      tauriSpy.invoke.and.resolveTo(mockCache);

      const result = await service.getCachedRates();

      expect(tauriSpy.invoke).toHaveBeenCalledWith('list_fx_cache');
      expect(result).toEqual(mockCache);
    });
  });

  describe('clearCache', () => {
    it('should invoke clear_fx_cache', async () => {
      tauriSpy.invoke.and.resolveTo(undefined);

      await service.clearCache();

      expect(tauriSpy.invoke).toHaveBeenCalledWith('clear_fx_cache');
    });
  });
});