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

  describe('setupPin', () => {
    it('should invoke setup_pin and set state to needs_profile', async () => {
      tauriSpy.invoke.and.resolveTo(undefined);

      await service.setupPin('1234');

      expect(tauriSpy.invoke).toHaveBeenCalledWith('setup_pin', { pin: '1234' });
      expect(service.state()).toBe('needs_profile');
    });
  });

  describe('unlockWithBiometric', () => {
    it('should set state to unlocked with taxpayer on success', async () => {
      const mockTaxpayer = { id: '2', name: 'Jane' };
      tauriSpy.invoke.and.resolveTo(mockTaxpayer);

      const result = await service.unlockWithBiometric();

      expect(result.success).toBeTrue();
      expect(service.state()).toBe('unlocked');
      expect(service.taxpayer()).toEqual(mockTaxpayer as any);
    });

    it('should return error on failure', async () => {
      tauriSpy.invoke.and.rejectWith('Biometric failed');

      const result = await service.unlockWithBiometric();

      expect(result.success).toBeFalse();
      expect(result.error).toBe('Biometric failed');
    });
  });

  describe('enableBiometric', () => {
    it('should invoke enable_biometric and set biometricEnabled to true', async () => {
      tauriSpy.invoke.and.resolveTo(undefined);

      await service.enableBiometric();

      expect(tauriSpy.invoke).toHaveBeenCalledWith('enable_biometric');
      expect(service.biometricEnabled()).toBeTrue();
    });
  });

  describe('disableBiometric', () => {
    it('should invoke disable_biometric and set biometricEnabled to false', async () => {
      tauriSpy.invoke.and.resolveTo(undefined);

      await service.disableBiometric();

      expect(tauriSpy.invoke).toHaveBeenCalledWith('disable_biometric');
      expect(service.biometricEnabled()).toBeFalse();
    });
  });

  describe('lock', () => {
    it('should invoke lock_db and set state to locked and taxpayer to null', async () => {
      tauriSpy.invoke.and.resolveTo(undefined);
      const mockTaxpayer = { id: '1', name: 'John' };
      service.setTaxpayer(mockTaxpayer as any);

      await service.lock();

      expect(tauriSpy.invoke).toHaveBeenCalledWith('lock_db');
      expect(service.state()).toBe('locked');
      expect(service.taxpayer()).toBeNull();
    });
  });

  describe('setupRecovery', () => {
    it('should invoke setup_recovery and set hasRecovery to true', async () => {
      tauriSpy.invoke.and.resolveTo(undefined);
      const questions = ['Q1', 'Q2', 'Q3'] as [string, string, string];
      const answers = ['A1', 'A2', 'A3'] as [string, string, string];

      await service.setupRecovery(questions, answers);

      expect(tauriSpy.invoke).toHaveBeenCalledWith('setup_recovery', {
        question1: 'Q1', question2: 'Q2', question3: 'Q3',
        answer1: 'A1', answer2: 'A2', answer3: 'A3'
      });
      expect(service.hasRecovery()).toBeTrue();
    });
  });

  describe('getRecoveryQuestions', () => {
    it('should invoke get_recovery_questions and return questions array', async () => {
      const mockQuestions = ['Q1', 'Q2', 'Q3'];
      tauriSpy.invoke.and.resolveTo(mockQuestions);

      const result = await service.getRecoveryQuestions();

      expect(tauriSpy.invoke).toHaveBeenCalledWith('get_recovery_questions');
      expect(result).toEqual(mockQuestions);
    });
  });

  describe('recoverWithAnswers', () => {
    it('should set unlocked with taxpayer on success', async () => {
      const mockTaxpayer = { id: '3', name: 'Recovered' };
      tauriSpy.invoke.and.resolveTo(mockTaxpayer);

      const result = await service.recoverWithAnswers(['A1', 'A2', 'A3'] as [string, string, string]);

      expect(result.success).toBeTrue();
      expect(service.state()).toBe('unlocked');
      expect(service.taxpayer()).toEqual(mockTaxpayer as any);
    });

    it('should return error on failure', async () => {
      tauriSpy.invoke.and.rejectWith('Recovery failed');

      const result = await service.recoverWithAnswers(['A1', 'A2', 'A3'] as [string, string, string]);

      expect(result.success).toBeFalse();
      expect(result.error).toBe('Recovery failed');
    });
  });

  describe('resetPin', () => {
    it('should invoke reset_pin and set hasRecovery to false', async () => {
      tauriSpy.invoke.and.resolveTo(undefined);

      await service.resetPin('5678');

      expect(tauriSpy.invoke).toHaveBeenCalledWith('reset_pin', { newPin: '5678' });
      expect(service.hasRecovery()).toBeFalse();
    });
  });

  describe('changePin', () => {
    it('should invoke change_pin and set hasRecovery to false', async () => {
      tauriSpy.invoke.and.resolveTo(undefined);

      await service.changePin('1234', '5678');

      expect(tauriSpy.invoke).toHaveBeenCalledWith('change_pin', { currentPin: '1234', newPin: '5678' });
      expect(service.hasRecovery()).toBeFalse();
    });
  });

  describe('backupDb', () => {
    it('should invoke backup_db with destPath', async () => {
      tauriSpy.invoke.and.resolveTo(undefined);

      await service.backupDb('/path/to/backup');

      expect(tauriSpy.invoke).toHaveBeenCalledWith('backup_db', { destPath: '/path/to/backup' });
    });
  });

  describe('restoreDb', () => {
    it('should invoke restore_db with srcPath', async () => {
      tauriSpy.invoke.and.resolveTo(undefined);

      await service.restoreDb('/path/to/restore');

      expect(tauriSpy.invoke).toHaveBeenCalledWith('restore_db', { srcPath: '/path/to/restore' });
    });
  });

  describe('setTaxpayer', () => {
    it('should set taxpayer and state to unlocked', () => {
      const mockTaxpayer = { id: '1', name: 'John' };

      service.setTaxpayer(mockTaxpayer as any);

      expect(service.taxpayer()).toEqual(mockTaxpayer as any);
      expect(service.state()).toBe('unlocked');
    });
  });

  describe('isUnlocked', () => {
    it('should return true when state is unlocked', () => {
      service.setTaxpayer({ id: '1' } as any);

      expect(service.isUnlocked()).toBeTrue();
    });

    it('should return false when state is not unlocked', () => {
      expect(service.isUnlocked()).toBeFalse();
    });
  });
});