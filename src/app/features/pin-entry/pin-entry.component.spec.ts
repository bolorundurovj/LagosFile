import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { LUCIDE_ICONS, LucideIconProvider, icons, Fingerprint } from 'lucide-angular';
import { PinEntryComponent } from './pin-entry.component';
import { AuthService } from '../../core/services/auth.service';

describe('PinEntryComponent', () => {
  let authMock: {
    unlock: jasmine.Spy;
    unlockWithBiometric: jasmine.Spy;
    state: ReturnType<typeof signal<string>>;
    biometricEnabled: ReturnType<typeof signal<boolean>>;
    hasRecovery: ReturnType<typeof signal<boolean>>;
  };

  function configure(route?: unknown): void {
    authMock = {
      unlock: jasmine.createSpy('unlock'),
      unlockWithBiometric: jasmine.createSpy('unlockWithBiometric'),
      state: signal('unlocked'),
      biometricEnabled: signal(false),
      hasRecovery: signal(false),
    };
    TestBed.configureTestingModule({
      imports: [PinEntryComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ ...icons, Fingerprint }) },
        ...(route ? [{ provide: ActivatedRoute, useValue: route }] : []),
      ],
    });
  }

  function create() {
    const fixture = TestBed.createComponent(PinEntryComponent);
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture.detectChanges();
    return { fixture, comp: fixture.componentInstance, navigate };
  }

  describe('with default route', () => {
    beforeEach(() => configure());

    it('requires a PIN before attempting to unlock', async () => {
      const { comp } = create();
      await comp.submit();
      expect(comp.errorMsg).toBe('PIN is required.');
      expect(authMock.unlock).not.toHaveBeenCalled();
    });

    it('navigates to the dashboard on successful unlock', async () => {
      authMock.unlock.and.resolveTo({ success: true });
      const { comp, navigate } = create();
      comp.pin = '1234';
      await comp.submit();
      expect(authMock.unlock).toHaveBeenCalledWith('1234');
      expect(navigate).toHaveBeenCalledWith(['/dashboard']);
      expect(comp.loading).toBeFalse();
      expect(comp.errorMsg).toBe('');
    });

    it('navigates to profile setup when the profile is missing', async () => {
      authMock.unlock.and.callFake(async () => {
        authMock.state.set('needs_profile');
        return { success: true };
      });
      const { comp, navigate } = create();
      comp.pin = '1234';
      await comp.submit();
      expect(navigate).toHaveBeenCalledWith(['/profile-setup']);
    });

    it('shows the service error or a default message on failed unlock', async () => {
      authMock.unlock.and.resolveTo({ success: false, error: 'Too many attempts' });
      const { comp, fixture, navigate } = create();
      comp.pin = '0000';
      await comp.submit();
      expect(comp.errorMsg).toBe('Too many attempts');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.form-error').textContent).toContain('Too many attempts');

      authMock.unlock.and.resolveTo({ success: false });
      await comp.submit();
      expect(comp.errorMsg).toBe('Incorrect PIN. Please try again.');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('resets loading even when unlock throws', async () => {
      authMock.unlock.and.rejectWith(new Error('boom'));
      const { comp } = create();
      comp.pin = '1234';
      await expectAsync(comp.submit()).toBeRejected();
      expect(comp.loading).toBeFalse();
    });

    it('unlocks with biometrics and routes based on auth state', async () => {
      authMock.unlockWithBiometric.and.resolveTo({ success: true });
      const { comp, navigate } = create();
      await comp.unlockWithBiometric();
      expect(navigate).toHaveBeenCalledWith(['/dashboard']);

      authMock.state.set('needs_profile');
      await comp.unlockWithBiometric();
      expect(navigate).toHaveBeenCalledWith(['/profile-setup']);
      expect(comp.loading).toBeFalse();
    });

    it('reports biometric failures', async () => {
      authMock.unlockWithBiometric.and.resolveTo({ success: false, error: 'Cancelled' });
      const { comp, navigate } = create();
      await comp.unlockWithBiometric();
      expect(comp.errorMsg).toBe('Cancelled');

      authMock.unlockWithBiometric.and.resolveTo({ success: false });
      await comp.unlockWithBiometric();
      expect(comp.errorMsg).toBe('Biometric authentication failed.');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('renders the biometric button and recovery link based on auth flags', () => {
      const { fixture } = create();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.btn--biometric')).toBeNull();
      expect(el.querySelector('.forgot-link')).toBeNull();
      expect(el.querySelector('.auth-card__warning')).not.toBeNull();
      expect(el.querySelector('.alert--info')).toBeNull();

      authMock.biometricEnabled.set(true);
      authMock.hasRecovery.set(true);
      fixture.detectChanges();
      expect(el.querySelector('.btn--biometric')).not.toBeNull();
      expect(el.querySelector('.forgot-link')?.getAttribute('href')).toBe('/recover-pin');
    });
  });

  it('shows the idle lock notice when opened with reason=idle', () => {
    configure({ snapshot: { queryParamMap: convertToParamMap({ reason: 'idle' }) } });
    const { comp, fixture } = create();
    expect(comp.lockedForIdle).toBeTrue();
    expect(fixture.nativeElement.querySelector('.alert--info').textContent).toContain('inactivity');
  });
});
