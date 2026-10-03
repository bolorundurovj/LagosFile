import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authGuard, publicGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { TauriService } from '../services/tauri.service';

describe('authGuard', () => {
  let authService: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    const spy = jasmine.createSpyObj('AuthService', ['isUnlocked', 'state'], {
      state: jasmine.createSpy('state'),
      isUnlocked: jasmine.createSpy('isUnlocked')
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: spy },
        { provide: TauriService, useValue: jasmine.createSpyObj('TauriService', ['invoke']) },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['createUrlTree']) }
      ]
    });

    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
  });

  it('should return true when unlocked', () => {
    (authService.isUnlocked as jasmine.Spy).and.returnValue(true);

    const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));

    expect(result).toBeTrue();
  });

  it('should redirect to /setup-pin when needs_pin_setup', () => {
    const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    (authService.isUnlocked as jasmine.Spy).and.returnValue(false);
    (authService.state as jasmine.Spy).and.returnValue('needs_pin_setup');
    (router.createUrlTree as jasmine.Spy).and.returnValue({} as any);

    TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));

    expect(router.createUrlTree).toHaveBeenCalledWith(['/setup-pin']);
  });

  it('should redirect to /profile-setup when needs_profile', () => {
    const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    (authService.isUnlocked as jasmine.Spy).and.returnValue(false);
    (authService.state as jasmine.Spy).and.returnValue('needs_profile');
    (router.createUrlTree as jasmine.Spy).and.returnValue({} as any);

    TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));

    expect(router.createUrlTree).toHaveBeenCalledWith(['/profile-setup']);
  });

  it('should redirect to /unlock when locked', () => {
    const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    (authService.isUnlocked as jasmine.Spy).and.returnValue(false);
    (authService.state as jasmine.Spy).and.returnValue('locked');
    (router.createUrlTree as jasmine.Spy).and.returnValue({} as any);

    TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));

    expect(router.createUrlTree).toHaveBeenCalledWith(['/unlock']);
  });
});

describe('publicGuard', () => {
  let authService: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    const spy = jasmine.createSpyObj('AuthService', ['isUnlocked'], {
      isUnlocked: jasmine.createSpy('isUnlocked')
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: spy },
        { provide: TauriService, useValue: jasmine.createSpyObj('TauriService', ['invoke']) },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['createUrlTree']) }
      ]
    });

    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
  });

  it('should redirect to /dashboard when unlocked', () => {
    const router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    (authService.isUnlocked as jasmine.Spy).and.returnValue(true);
    (router.createUrlTree as jasmine.Spy).and.returnValue({} as any);

    TestBed.runInInjectionContext(() => publicGuard({} as any, {} as any));

    expect(router.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
  });

  it('should return true when not unlocked', () => {
    (authService.isUnlocked as jasmine.Spy).and.returnValue(false);

    const result = TestBed.runInInjectionContext(() => publicGuard({} as any, {} as any));

    expect(result).toBeTrue();
  });
});