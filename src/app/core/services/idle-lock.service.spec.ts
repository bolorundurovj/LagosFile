import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { IdleLockService } from './idle-lock.service';
import { AuthService } from './auth.service';

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
