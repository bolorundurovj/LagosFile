import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { TauriService } from './tauri.service';
import { AppStatus } from '../models';

describe('AuthService', () => {
  let service: AuthService;
  let tauriSpy: jasmine.SpyObj<TauriService>;

  beforeEach(() => {
    const spy = jasmine.createSpyObj('TauriService', ['invoke']);

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: TauriService, useValue: spy }
      ]
    });

    service = TestBed.inject(AuthService);
    tauriSpy = TestBed.inject(TauriService) as jasmine.SpyObj<TauriService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('init', () => {
    it('should set state to locked if db exists', async () => {
      const mockStatus: AppStatus = {
        hasDb: true,
        hasProfile: false,
        hasRecovery: false,
        biometricAvailable: false,
        biometricEnabled: false
      };
      tauriSpy.invoke.and.resolveTo(mockStatus);

      await service.init();

      expect(service.state()).toBe('locked');
      expect(service.hasRecovery()).toBeFalse();
    });

    it('should set state to needs_pin_setup if db does not exist', async () => {
      const mockStatus: AppStatus = {
        hasDb: false,
        hasProfile: false,
        hasRecovery: false,
        biometricAvailable: false,
        biometricEnabled: false
      };
      tauriSpy.invoke.and.resolveTo(mockStatus);

      await service.init();

      expect(service.state()).toBe('needs_pin_setup');
    });
  });

  describe('unlock', () => {
    it('should return success true and update state when pin is correct', async () => {
      const mockTaxpayer = { id: '1', name: 'John Doe' };
      tauriSpy.invoke.and.resolveTo(mockTaxpayer);

      const result = await service.unlock('1234');

      expect(result.success).toBeTrue();
      expect(service.state()).toBe('unlocked');
      expect(service.taxpayer()).toEqual(mockTaxpayer as any);
    });

    it('should return success false and error message when pin is incorrect', async () => {
      tauriSpy.invoke.and.rejectWith('Invalid PIN');

      const result = await service.unlock('wrong');

      expect(result.success).toBeFalse();
      expect(result.error).toBe('Invalid PIN');
      expect(service.state()).toBe('locked');
    });
  });
});
