import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LUCIDE_ICONS, LucideIconProvider, icons, AlertTriangle } from 'lucide-angular';
import { PinSetupComponent } from './pin-setup.component';
import { AuthService } from '../../core/services/auth.service';

describe('PinSetupComponent', () => {
  let authSpy: jasmine.SpyObj<AuthService>;
  let invokeSpy: jasmine.Spy;
  let navigate: jasmine.Spy;

  beforeEach(() => {
    invokeSpy = jasmine.createSpy('invoke');
    (window as any).__TAURI_INTERNALS__ = { invoke: invokeSpy };
    authSpy = jasmine.createSpyObj('AuthService', ['setupPin', 'restoreBackupFresh']);
    TestBed.configureTestingModule({
      imports: [PinSetupComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authSpy },
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ ...icons, AlertTriangle }) },
      ],
    });
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  function create() {
    const fixture = TestBed.createComponent(PinSetupComponent);
    fixture.detectChanges();
    return { fixture, comp: fixture.componentInstance };
  }

  describe('create PIN', () => {
    it('rejects PINs shorter than 4 characters', async () => {
      const { comp, fixture } = create();
      comp.pin = '12';
      comp.confirm = '12';
      await comp.submit();
      expect(comp.errors.pin).toBe('PIN must be at least 4 characters.');
      expect(authSpy.setupPin).not.toHaveBeenCalled();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.form-error').textContent).toContain('at least 4');
    });

    it('rejects mismatched confirmation', async () => {
      const { comp } = create();
      comp.pin = '1234';
      comp.confirm = '4321';
      await comp.submit();
      expect(comp.errors.confirm).toBe('PINs do not match.');
      expect(authSpy.setupPin).not.toHaveBeenCalled();
    });

    it('sets the PIN and goes to recovery setup', async () => {
      authSpy.setupPin.and.resolveTo();
      const { comp } = create();
      comp.pin = '123456';
      comp.confirm = '123456';
      await comp.submit();
      expect(authSpy.setupPin).toHaveBeenCalledWith('123456');
      expect(navigate).toHaveBeenCalledWith(['/setup-recovery']);
      expect(comp.loading).toBeFalse();
    });

    it('surfaces setup errors from Error and non-Error rejections', async () => {
      const { comp, fixture } = create();
      comp.pin = '1234';
      comp.confirm = '1234';

      authSpy.setupPin.and.rejectWith(new Error('disk full'));
      await comp.submit();
      expect(comp.errors.general).toBe('disk full');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.alert--error').textContent).toContain('disk full');

      authSpy.setupPin.and.returnValue(Promise.reject('db locked'));
      await comp.submit();
      expect(comp.errors.general).toBe('db locked');

      authSpy.setupPin.and.returnValue(Promise.reject(null));
      await comp.submit();
      expect(comp.errors.general).toBe('Failed to set PIN.');
      expect(navigate).not.toHaveBeenCalled();
      expect(comp.loading).toBeFalse();
    });
  });

  describe('restore mode', () => {
    it('toggles restore mode and clears state', () => {
      const { comp, fixture } = create();
      comp.errors = { pin: 'x' };
      comp.enterRestoreMode();
      expect(comp.restoreMode).toBeTrue();
      expect(comp.errors).toEqual({});
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.auth-card__title').textContent).toContain('Restore from backup');

      comp.backupPin = 'secret';
      comp.errors = { file: 'y' };
      comp.exitRestoreMode();
      expect(comp.restoreMode).toBeFalse();
      expect(comp.backupPin).toBe('');
      expect(comp.errors).toEqual({});
    });

    it('picks a backup file from the dialog (string or array result)', async () => {
      const { comp } = create();
      comp.errors.file = 'Please select a backup file.';
      invokeSpy.and.resolveTo('C:/backups/a.lf.enc');
      await comp.pickBackupFile();
      expect(invokeSpy).toHaveBeenCalledWith('plugin:dialog|open', jasmine.objectContaining({
        options: jasmine.objectContaining({ multiple: false }),
      }), undefined);
      expect(comp.backupPath).toBe('C:/backups/a.lf.enc');
      expect(comp.errors.file).toBeUndefined();

      invokeSpy.and.resolveTo(['C:/backups/b.lf.enc']);
      await comp.pickBackupFile();
      expect(comp.backupPath).toBe('C:/backups/b.lf.enc');
    });

    it('keeps the previous path when the dialog is cancelled or empty', async () => {
      const { comp } = create();
      comp.backupPath = 'keep.lf.enc';
      invokeSpy.and.resolveTo(null);
      await comp.pickBackupFile();
      expect(comp.backupPath).toBe('keep.lf.enc');

      invokeSpy.and.resolveTo([]);
      await comp.pickBackupFile();
      expect(comp.backupPath).toBe('keep.lf.enc');
    });

    it('validates file and PIN before restoring', async () => {
      const { comp } = create();
      comp.enterRestoreMode();
      await comp.submitRestore();
      expect(comp.errors.file).toBe('Please select a backup file.');

      comp.backupPath = 'a.lf.enc';
      await comp.submitRestore();
      expect(comp.errors.pin).toBe('Please enter the backup PIN.');
      expect(authSpy.restoreBackupFresh).not.toHaveBeenCalled();
    });

    it('navigates to dashboard when the backup contains a taxpayer, else to profile setup', async () => {
      const { comp } = create();
      comp.backupPath = 'a.lf.enc';
      comp.backupPin = '9999';

      authSpy.restoreBackupFresh.and.resolveTo({ id: 'tp', fullName: 'A', tin: '1', createdAt: '' } as any);
      await comp.submitRestore();
      expect(authSpy.restoreBackupFresh).toHaveBeenCalledWith('a.lf.enc', '9999');
      expect(navigate).toHaveBeenCalledWith(['/dashboard']);

      authSpy.restoreBackupFresh.and.resolveTo(null as any);
      await comp.submitRestore();
      expect(navigate).toHaveBeenCalledWith(['/profile-setup']);
      expect(comp.loading).toBeFalse();
    });

    it('reports restore failures', async () => {
      const { comp } = create();
      comp.backupPath = 'a.lf.enc';
      comp.backupPin = '9999';

      authSpy.restoreBackupFresh.and.rejectWith(new Error('Wrong PIN'));
      await comp.submitRestore();
      expect(comp.errors.general).toBe('Wrong PIN');

      authSpy.restoreBackupFresh.and.returnValue(Promise.reject('corrupt'));
      await comp.submitRestore();
      expect(comp.errors.general).toBe('corrupt');

      authSpy.restoreBackupFresh.and.returnValue(Promise.reject(undefined));
      await comp.submitRestore();
      expect(comp.errors.general).toBe('Restore failed.');
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
