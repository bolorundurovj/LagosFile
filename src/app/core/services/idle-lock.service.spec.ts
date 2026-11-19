import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Component } from '@angular/core';
import { IdleLockService } from './idle-lock.service';
import { AuthService } from './auth.service';
import { TauriService } from './tauri.service';

@Component({ standalone: true, template: '' })
class DummyRouteComponent {}

describe('IdleLockService', () => {
  let service: IdleLockService;
  let auth: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    localStorage.removeItem('lagosfile-idle-lock-minutes');
    auth = jasmine.createSpyObj('AuthService', ['lock', 'isUnlocked']);
    auth.lock.and.resolveTo();
    auth.isUnlocked.and.returnValue(true);
    router = jasmine.createSpyObj('Router', ['navigate']);
    router.navigate.and.resolveTo(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
    service = TestBed.inject(IdleLockService);
    jasmine.clock().install();
  });

  afterEach(() => {
    service.stop();
    jasmine.clock().uninstall();
    localStorage.removeItem('lagosfile-idle-lock-minutes');
  });

  it('defaults to 10 minutes', () => {
    expect(service.minutes()).toBe(10);
  });

  it('locks after the configured idle period', async () => {
    service.setMinutes(5);
    service.start();
    jasmine.clock().tick(5 * 60_000 - 1);
    expect(auth.lock).not.toHaveBeenCalled();
    jasmine.clock().tick(1);
    await Promise.resolve();
    expect(auth.lock).toHaveBeenCalled();
  });

  it('restarts the countdown on activity', () => {
    service.setMinutes(5);
    service.start();
    jasmine.clock().tick(4 * 60_000);
    window.dispatchEvent(new KeyboardEvent('keydown'));
    jasmine.clock().tick(4 * 60_000);
    expect(auth.lock).not.toHaveBeenCalled();
  });

  it('never locks when disabled', () => {
    service.setMinutes(0);
    service.start();
    jasmine.clock().tick(24 * 60 * 60_000);
    expect(auth.lock).not.toHaveBeenCalled();
    expect(localStorage.getItem('lagosfile-idle-lock-minutes')).toBe('0');
  });
});

describe('IdleLockService vault lifecycle (S5)', () => {
  let service: IdleLockService;
  let auth: AuthService;
  let tauriSpy: jasmine.SpyObj<TauriService>;
  let router: Router;

  beforeEach(() => {
    localStorage.removeItem('lagosfile-idle-lock-minutes');
    tauriSpy = jasmine.createSpyObj('TauriService', ['invoke']);
    tauriSpy.invoke.and.resolveTo(undefined);

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        IdleLockService,
        { provide: TauriService, useValue: tauriSpy },
        provideRouter([
          { path: 'setup-recovery', component: DummyRouteComponent },
          { path: 'unlock', component: DummyRouteComponent },
        ]),
      ],
    });

    auth = TestBed.inject(AuthService);
    service = TestBed.inject(IdleLockService);
    router = TestBed.inject(Router);
    jasmine.clock().install();
  });

  afterEach(() => {
    service.stop();
    jasmine.clock().uninstall();
    localStorage.removeItem('lagosfile-idle-lock-minutes');
  });

  it('keeps idle lock active after navigating outside shell to /setup-recovery and invokes lock_db', async () => {
    service.setMinutes(5);
    tauriSpy.invoke.and.callFake((async (cmd: string) => {
      if (cmd === 'unlock_db') {
        return { id: '1', fullName: 'Ada', tin: '1234567890123', createdAt: '2026-01-01T00:00:00Z' };
      }
      return undefined;
    }) as any);

    await auth.unlock('1234');
    TestBed.flushEffects();

    await router.navigate(['/setup-recovery']);
    expect(router.url).toBe('/setup-recovery');

    jasmine.clock().tick(5 * 60_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(tauriSpy.invoke).toHaveBeenCalledWith('lock_db');
    expect(auth.state()).toBe('locked');
  });
});
