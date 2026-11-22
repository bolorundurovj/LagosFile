import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { SettingsComponent } from './settings.component';
import { AuthService } from '../../core/services/auth.service';
import { ProfileService } from '../../core/services/profile.service';
import { ConfigService } from '../../core/services/config.service';
import { ThemeService } from '../../core/services/theme.service';
import { IdleLockService } from '../../core/services/idle-lock.service';
import { UpdateService } from '../../core/services/update.service';
import { ToastService } from '../../core/services/toast.service';
import { Taxpayer } from '../../core/models';
import { LUCIDE_ICONS, LucideIconProvider, icons, AlertTriangle, CheckCircle } from 'lucide-angular';

describe('SettingsComponent (profile update and TIN edit)', () => {
  let profileServiceSpy: jasmine.SpyObj<ProfileService>;
  let toastSpy: jasmine.SpyObj<ToastService>;
  let setTaxpayerSpy: jasmine.Spy;
  let taxpayerSig: ReturnType<typeof signal<Taxpayer | null>>;

  const initialTaxpayer: Taxpayer = {
    id: 'tp-1',
    fullName: 'Old Name',
    tin: '1234567890123',
    address: 'Ikoyi, Lagos',
    createdAt: '2025-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    taxpayerSig = signal<Taxpayer | null>(initialTaxpayer);
    setTaxpayerSpy = jasmine.createSpy('setTaxpayer').and.callFake((tp: Taxpayer) => taxpayerSig.set(tp));
    profileServiceSpy = jasmine.createSpyObj('ProfileService', ['update', 'validateTin']);
    profileServiceSpy.validateTin.and.callFake((tin: string) =>
      /^\d{13}$/.test(tin) ? null : 'TIN must be exactly 13 digits (numbers only).',
    );
    toastSpy = jasmine.createSpyObj('ToastService', ['error', 'success', 'info', 'warning']);

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            taxpayer: taxpayerSig,
            setTaxpayer: setTaxpayerSpy,
            biometricAvailable: signal(false),
            biometricEnabled: signal(false),
            hasRecovery: signal(false),
          },
        },
        { provide: ProfileService, useValue: profileServiceSpy },
        { provide: ConfigService, useValue: { load: jasmine.createSpy('load') } },
        { provide: ThemeService, useValue: { theme: signal('system'), setTheme: jasmine.createSpy('setTheme') } },
        { provide: IdleLockService, useValue: { minutes: signal(15), setMinutes: jasmine.createSpy('setMinutes') } },
        {
          provide: UpdateService,
          useValue: {
            checking: signal(false),
            updateAvailable: signal(null),
            updateUrl: signal(null),
            checkForUpdates: jasmine.createSpy('checkForUpdates'),
          },
        },
        { provide: ToastService, useValue: toastSpy },
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ ...icons, AlertTriangle, CheckCircle }) },
      ],
    }).compileComponents();
  });

  it('updates AuthService taxpayer signal immediately when profile is saved', async () => {
    const updated: Taxpayer = { ...initialTaxpayer, fullName: 'Updated Name' };
    profileServiceSpy.update.and.resolveTo(updated);

    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;

    comp.editForm.fullName = 'Updated Name';
    await comp.saveProfile();

    expect(profileServiceSpy.update).toHaveBeenCalledWith(jasmine.objectContaining({ id: 'tp-1', fullName: 'Updated Name' }));
    expect(setTaxpayerSpy).toHaveBeenCalledWith(updated);
    expect(taxpayerSig()?.fullName).toBe('Updated Name');
  });

  it('requires confirmation and 13-digit validation when changing TIN', async () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;

    // Invalid TIN rejected without calling update
    comp.editForm.tin = '123';
    await comp.saveProfile();
    expect(toastSpy.error).toHaveBeenCalledWith(jasmine.stringContaining('13 digits'));
    expect(profileServiceSpy.update).not.toHaveBeenCalled();

    // Valid new TIN cancelled at confirmation prompt
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
    comp.editForm.tin = '9876543210987';
    await comp.saveProfile();
    expect(confirmSpy).toHaveBeenCalled();
    expect(profileServiceSpy.update).not.toHaveBeenCalled();

    // Confirmed TIN change saves and updates AuthService
    const updated: Taxpayer = { ...initialTaxpayer, tin: '9876543210987' };
    profileServiceSpy.update.and.resolveTo(updated);
    confirmSpy.and.returnValue(true);
    await comp.saveProfile();
    expect(profileServiceSpy.update).toHaveBeenCalledWith(jasmine.objectContaining({ id: 'tp-1', tin: '9876543210987' }));
    expect(taxpayerSig()?.tin).toBe('9876543210987');
  });
});

describe('SettingsComponent (security, backup and about)', () => {
  let authMock: any;
  let configMock: any;
  let updateMock: any;
  let profileSpy: jasmine.SpyObj<ProfileService>;
  let toastSpy: jasmine.SpyObj<ToastService>;
  let invokeSpy: jasmine.Spy;
  let navigate: jasmine.Spy;
  let taxpayerSig: ReturnType<typeof signal<Taxpayer | null>>;

  const tp: Taxpayer = {
    id: 'tp-1',
    fullName: 'Ada',
    tin: '1234567890123',
    phone: '080',
    email: 'a@b.ng',
    filingAgent: 'Agent',
    createdAt: '2025-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    invokeSpy = jasmine.createSpy('invoke');
    (window as any).__TAURI_INTERNALS__ = { invoke: invokeSpy };
    taxpayerSig = signal<Taxpayer | null>(tp);
    authMock = {
      taxpayer: taxpayerSig,
      setTaxpayer: jasmine.createSpy('setTaxpayer'),
      biometricAvailable: signal(true),
      biometricEnabled: signal(false),
      hasRecovery: signal(true),
      enableBiometric: jasmine.createSpy('enableBiometric').and.resolveTo(),
      disableBiometric: jasmine.createSpy('disableBiometric').and.resolveTo(),
      changePin: jasmine.createSpy('changePin').and.resolveTo(),
      backupDb: jasmine.createSpy('backupDb').and.resolveTo(),
      restoreDb: jasmine.createSpy('restoreDb').and.resolveTo(null),
      lock: jasmine.createSpy('lock').and.resolveTo(),
    };
    configMock = {
      loadActive: jasmine.createSpy('loadActive').and.resolveTo({}),
      getMigrationNotices: jasmine.createSpy('getMigrationNotices').and.resolveTo([]),
    };
    updateMock = {
      checking: signal(false),
      updateAvailable: signal<string | null>(null),
      updateUrl: signal<string | null>(null),
      checkForUpdates: jasmine.createSpy('checkForUpdates').and.resolveTo(),
    };
    profileSpy = jasmine.createSpyObj('ProfileService', ['update', 'validateTin']);
    toastSpy = jasmine.createSpyObj('ToastService', ['error', 'success', 'info', 'warning']);

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
        { provide: ProfileService, useValue: profileSpy },
        { provide: ConfigService, useValue: configMock },
        { provide: ThemeService, useValue: { theme: signal('system'), setTheme: jasmine.createSpy('setTheme') } },
        { provide: IdleLockService, useValue: { minutes: signal(15), setMinutes: jasmine.createSpy('setMinutes') } },
        { provide: UpdateService, useValue: updateMock },
        { provide: ToastService, useValue: toastSpy },
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ ...icons, AlertTriangle, CheckCircle }) },
      ],
    }).compileComponents();
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  function create() {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    return { fixture, comp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('prefills the edit form from the taxpayer, defaulting missing fields to empty', () => {
    const { comp } = create();
    expect(comp.editForm).toEqual({
      fullName: 'Ada', tin: '1234567890123', address: '', phone: '080', email: 'a@b.ng', filingAgent: 'Agent',
    });
  });

  it('leaves the form empty and skips saving when there is no taxpayer', async () => {
    taxpayerSig.set(null);
    const { comp, el } = create();
    expect(comp.editForm.fullName).toBe('');
    expect(el.textContent).not.toContain('Update Profile');
    await comp.saveProfile();
    expect(profileSpy.update).not.toHaveBeenCalled();
  });

  it('reports profile save failures', async () => {
    profileSpy.update.and.rejectWith(new Error('locked'));
    const { comp } = create();
    await comp.saveProfile();
    expect(toastSpy.error).toHaveBeenCalledWith('Failed to save profile: locked');
    expect(comp.savingProfile()).toBeFalse();

    profileSpy.update.and.returnValue(Promise.reject('raw'));
    await comp.saveProfile();
    expect(toastSpy.error).toHaveBeenCalledWith('Failed to save profile: raw');
  });

  it('toggles biometric on and off and reports failures', async () => {
    const { comp } = create();
    await comp.toggleBiometric();
    expect(authMock.enableBiometric).toHaveBeenCalled();
    expect(toastSpy.success).toHaveBeenCalledWith('Biometric authentication enabled.');

    authMock.biometricEnabled.set(true);
    await comp.toggleBiometric();
    expect(authMock.disableBiometric).toHaveBeenCalled();
    expect(toastSpy.success).toHaveBeenCalledWith('Biometric authentication disabled.');

    authMock.disableBiometric.and.rejectWith(new Error('hello unavailable'));
    await comp.toggleBiometric();
    expect(toastSpy.error).toHaveBeenCalledWith('Failed to update biometric settings: hello unavailable');

    authMock.disableBiometric.and.returnValue(Promise.reject('x'));
    await comp.toggleBiometric();
    expect(toastSpy.error).toHaveBeenCalledWith('Failed to update biometric settings: x');
    expect(comp.togglingBiometric()).toBeFalse();
  });

  it('only allows changing PIN when lengths and confirmation are valid', () => {
    const { comp } = create();
    expect(comp.canChangePin()).toBeFalse();
    comp.pinForm = { current: '1234', next: '567', confirm: '567' };
    expect(comp.canChangePin()).toBeFalse();
    comp.pinForm = { current: '1234', next: '5678', confirm: '5679' };
    expect(comp.canChangePin()).toBeFalse();
    comp.pinForm = { current: '1234', next: '5678', confirm: '5678' };
    expect(comp.canChangePin()).toBeTrue();
  });

  it('changes PIN, clears the form and offers a recovery setup action', async () => {
    const { comp } = create();
    await comp.changePin();
    expect(authMock.changePin).not.toHaveBeenCalled();

    comp.pinForm = { current: '1234', next: '5678', confirm: '5678' };
    await comp.changePin();
    expect(authMock.changePin).toHaveBeenCalledWith('1234', '5678');
    expect(comp.pinForm).toEqual({ current: '', next: '', confirm: '' });
    const [message, action] = toastSpy.success.calls.mostRecent().args as any[];
    expect(message).toContain('PIN changed successfully');
    expect(action.label).toBe('Set Up Now');
    action.fn();
    expect(navigate).toHaveBeenCalledWith(['/setup-recovery']);
    expect(comp.changingPin()).toBeFalse();
  });

  it('shows PIN change errors', async () => {
    const { comp } = create();
    comp.pinForm = { current: '1234', next: '5678', confirm: '5678' };
    authMock.changePin.and.rejectWith(new Error('Current PIN is wrong'));
    await comp.changePin();
    expect(comp.pinError()).toBe('Current PIN is wrong');

    authMock.changePin.and.returnValue(Promise.reject('raw'));
    await comp.changePin();
    expect(comp.pinError()).toBe('raw');
    expect(comp.pinForm.current).toBe('1234');
  });

  it('locks the app and navigates to unlock, reporting failures', async () => {
    const { comp } = create();
    await comp.lock();
    expect(authMock.lock).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/unlock']);

    navigate.calls.reset();
    authMock.lock.and.rejectWith(new Error('busy'));
    await comp.lock();
    expect(toastSpy.error).toHaveBeenCalledWith('Failed to lock app: busy');
    expect(navigate).not.toHaveBeenCalled();

    authMock.lock.and.returnValue(Promise.reject('raw'));
    await comp.lock();
    expect(toastSpy.error).toHaveBeenCalledWith('Failed to lock app: raw');
  });

  it('opens the release page when an update is available, otherwise confirms up to date', async () => {
    const openSpy = spyOn(window, 'open');
    const { comp } = create();
    await comp.checkForUpdates();
    expect(updateMock.checkForUpdates).toHaveBeenCalled();
    expect(toastSpy.success).toHaveBeenCalledWith('You are running the latest version.');
    expect(openSpy).not.toHaveBeenCalled();

    updateMock.checkForUpdates.and.callFake(async () => {
      updateMock.updateAvailable.set('9.9.9');
      updateMock.updateUrl.set('https://example.com/r');
    });
    await comp.checkForUpdates();
    expect(openSpy).toHaveBeenCalledWith('https://example.com/r', '_blank');
  });

  it('loads and parses the changelog once, skipping Unreleased and stripping commit links', async () => {
    const md = [
      '# Changelog',
      '## [Unreleased]',
      '- pending item',
      '## [1.2.0] - 2026-05-01',
      '- Added calculator ([`abc123`](https://x/commit/abc123))',
      '  - Fixed rounding',
      '## [1.1.0]',
      '- Initial release',
    ].join('\n');
    const fetchSpy = spyOn(window, 'fetch').and.callFake(async () => new Response(md));
    const { comp, fixture, el } = create();

    await comp.openChangelog();
    expect(fetchSpy).toHaveBeenCalledWith('/assets/CHANGELOG.md');
    expect(comp.showChangelog).toBeTrue();
    expect(comp.changelogLoading()).toBeFalse();
    expect(comp.changelogEntries()).toEqual([
      { version: '1.2.0', date: '2026-05-01', items: ['Added calculator', 'Fixed rounding'] },
      { version: '1.1.0', date: '', items: ['Initial release'] },
    ]);
    fixture.detectChanges();
    expect(el.querySelectorAll('.changelog-entry').length).toBe(2);
    expect(el.querySelectorAll('.changelog-entry__date').length).toBe(1);

    comp.showChangelog = false;
    await comp.openChangelog();
    expect(comp.showChangelog).toBeTrue();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('shows an error when the changelog cannot be fetched', async () => {
    spyOn(window, 'fetch').and.rejectWith(new Error('offline'));
    const { comp, fixture, el } = create();
    await comp.openChangelog();
    expect(comp.changelogError()).toBe('Could not load changelog.');
    fixture.detectChanges();
    expect(el.querySelector('.changelog-body')?.textContent).toContain('Could not load changelog.');
  });

  describe('backup', () => {
    function routeInvoke(saveResult: string | null): void {
      invokeSpy.and.callFake(async (cmd: string, args: any) => {
        if (cmd === 'plugin:path|resolve_directory') return 'C:/Users/ada';
        if (cmd === 'plugin:path|join') return args.paths.join('/');
        if (cmd === 'plugin:dialog|save') return saveResult;
        return undefined;
      });
    }

    it('saves a backup to the chosen path with a dated default name', async () => {
      routeInvoke('D:/backups/vault.lf.enc');
      const { comp } = create();
      await comp.backupDb();
      const saveCall = invokeSpy.calls.allArgs().find(a => a[0] === 'plugin:dialog|save')!;
      const today = new Date().toISOString().slice(0, 10);
      expect(saveCall[1].options.defaultPath).toBe(`C:/Users/ada/LagosFile/lagosfile_backup_${today}.lf.enc`);
      expect(authMock.backupDb).toHaveBeenCalledWith('D:/backups/vault.lf.enc');
      expect(toastSpy.success).toHaveBeenCalledWith('Backup saved successfully.');
      expect(comp.backingUp()).toBeFalse();
    });

    it('does nothing when the save dialog is cancelled', async () => {
      routeInvoke(null);
      const { comp } = create();
      await comp.backupDb();
      expect(authMock.backupDb).not.toHaveBeenCalled();
    });

    it('reports backup failures', async () => {
      routeInvoke('D:/b.lf.enc');
      authMock.backupDb.and.rejectWith(new Error('disk full'));
      const { comp } = create();
      await comp.backupDb();
      expect(toastSpy.error).toHaveBeenCalledWith('Backup failed: disk full');

      authMock.backupDb.and.returnValue(Promise.reject('raw'));
      await comp.backupDb();
      expect(toastSpy.error).toHaveBeenCalledWith('Backup failed: raw');
      expect(comp.backingUp()).toBeFalse();
    });
  });

  describe('restore', () => {
    it('opens the PIN modal for a chosen backup (string or array)', async () => {
      const { comp, fixture, el } = create();
      invokeSpy.and.resolveTo('D:/a.lf.enc');
      comp.restorePin = 'stale';
      comp.restoreError.set('stale');
      await comp.restoreDb();
      expect(invokeSpy).toHaveBeenCalledWith('plugin:dialog|open', jasmine.anything(), undefined);
      expect(comp.pendingRestorePath).toBe('D:/a.lf.enc');
      expect(comp.restorePin).toBe('');
      expect(comp.restoreError()).toBe('');
      expect(comp.showRestoreModal()).toBeTrue();
      fixture.detectChanges();
      expect(el.querySelector('#restoreBackupPin')).not.toBeNull();

      invokeSpy.and.resolveTo(['D:/b.lf.enc']);
      await comp.restoreDb();
      expect(comp.pendingRestorePath).toBe('D:/b.lf.enc');
    });

    it('ignores cancelled or empty selections', async () => {
      const { comp } = create();
      invokeSpy.and.resolveTo(null);
      await comp.restoreDb();
      expect(comp.showRestoreModal()).toBeFalse();

      invokeSpy.and.resolveTo([]);
      await comp.restoreDb();
      expect(comp.showRestoreModal()).toBeFalse();
      expect(comp.pendingRestorePath).toBe('');
    });

    it('cancels the modal unless a restore is in progress', () => {
      const { comp } = create();
      comp.showRestoreModal.set(true);
      comp.pendingRestorePath = 'D:/a.lf.enc';
      comp.restorePin = '1111';
      comp.restoring.set(true);
      comp.cancelRestore();
      expect(comp.showRestoreModal()).toBeTrue();

      comp.restoring.set(false);
      comp.cancelRestore();
      expect(comp.showRestoreModal()).toBeFalse();
      expect(comp.pendingRestorePath).toBe('');
      expect(comp.restorePin).toBe('');
    });

    it('requires a path and PIN and ignores re-entry while restoring', async () => {
      const { comp } = create();
      await comp.confirmRestore();
      comp.pendingRestorePath = 'D:/a.lf.enc';
      await comp.confirmRestore();
      comp.restorePin = '1111';
      comp.restoring.set(true);
      await comp.confirmRestore();
      expect(authMock.restoreDb).not.toHaveBeenCalled();
    });

    it('restores, refreshes the form and config, and closes the modal', async () => {
      authMock.restoreDb.and.resolveTo({ ...tp, fullName: 'Restored', tin: '9999999999999', phone: undefined, address: 'Yaba' });
      const { comp } = create();
      comp.showRestoreModal.set(true);
      comp.pendingRestorePath = 'D:/a.lf.enc';
      comp.restorePin = '1111';
      await comp.confirmRestore();

      expect(authMock.restoreDb).toHaveBeenCalledWith('D:/a.lf.enc', '1111');
      expect(comp.editForm).toEqual(jasmine.objectContaining({
        fullName: 'Restored', tin: '9999999999999', phone: '', address: 'Yaba',
      }));
      expect(configMock.loadActive).toHaveBeenCalled();
      expect(configMock.getMigrationNotices).toHaveBeenCalled();
      expect(comp.showRestoreModal()).toBeFalse();
      expect(comp.pendingRestorePath).toBe('');
      expect(comp.restorePin).toBe('');
      expect(comp.restoring()).toBeFalse();
      expect(toastSpy.success).toHaveBeenCalledWith('Backup restored. Your data has been replaced.');
    });

    it('keeps the form when the backup has no taxpayer and tolerates config refresh failures', async () => {
      configMock.loadActive.and.rejectWith(new Error('no config'));
      const { comp } = create();
      comp.pendingRestorePath = 'D:/a.lf.enc';
      comp.restorePin = '1111';
      await comp.confirmRestore();
      expect(comp.editForm.fullName).toBe('Ada');
      expect(configMock.getMigrationNotices).not.toHaveBeenCalled();
      expect(toastSpy.success).toHaveBeenCalledWith('Backup restored. Your data has been replaced.');
    });

    it('skips config refresh methods that are unavailable', async () => {
      delete configMock.loadActive;
      delete configMock.getMigrationNotices;
      const { comp } = create();
      comp.pendingRestorePath = 'D:/a.lf.enc';
      comp.restorePin = '1111';
      await comp.confirmRestore();
      expect(toastSpy.success).toHaveBeenCalledWith('Backup restored. Your data has been replaced.');
    });

    it('shows restore errors inside the modal', async () => {
      const { comp, fixture, el } = create();
      comp.showRestoreModal.set(true);
      comp.pendingRestorePath = 'D:/a.lf.enc';
      comp.restorePin = '0000';

      authMock.restoreDb.and.rejectWith(new Error('Wrong backup PIN'));
      await comp.confirmRestore();
      expect(comp.restoreError()).toBe('Wrong backup PIN');
      expect(comp.showRestoreModal()).toBeTrue();
      fixture.detectChanges();
      expect(el.querySelector('.modal .alert--error')?.textContent).toContain('Wrong backup PIN');

      authMock.restoreDb.and.returnValue(Promise.reject('raw'));
      await comp.confirmRestore();
      expect(comp.restoreError()).toBe('raw');
      expect(comp.restoring()).toBeFalse();
    });
  });
});
