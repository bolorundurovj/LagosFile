import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
