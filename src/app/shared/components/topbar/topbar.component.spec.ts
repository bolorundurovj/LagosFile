import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TopbarComponent } from './topbar.component';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { ToastService } from '../../../core/services/toast.service';
import { Taxpayer } from '../../../core/models';
import { LUCIDE_ICONS, LucideIconProvider, Calendar, Sun, Moon, Monitor } from 'lucide-angular';

type Theme = 'light' | 'dark' | 'system';

describe('TopbarComponent', () => {
  let fixture: ComponentFixture<TopbarComponent>;
  let authSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let toastSpy: jasmine.SpyObj<ToastService>;
  let theme: ReturnType<typeof signal<Theme>>;
  let setTheme: jasmine.Spy;

  const taxpayer: Taxpayer = {
    id: 'tp-1',
    fullName: 'adaeze chioma obi',
    tin: '1234567890123',
    createdAt: '2025-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    authSpy = jasmine.createSpyObj('AuthService', ['lock']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    routerSpy.navigate.and.resolveTo(true);
    toastSpy = jasmine.createSpyObj('ToastService', ['error']);
    theme = signal<Theme>('light');
    setTheme = jasmine.createSpy('setTheme').and.callFake((t: Theme) => theme.set(t));

    await TestBed.configureTestingModule({
      imports: [TopbarComponent],
      providers: [
        { provide: AuthService, useValue: authSpy },
        { provide: Router, useValue: routerSpy },
        { provide: ToastService, useValue: toastSpy },
        { provide: ThemeService, useValue: { theme, setTheme } },
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ Calendar, Sun, Moon, Monitor }) },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TopbarComponent);
  });

  function el(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('shows the current year and no user block without a taxpayer', () => {
    const root = el();
    expect(root.querySelector('.topbar__yoa')?.textContent).toBe(`YOA ${new Date().getFullYear()}`);
    expect(root.querySelector('.topbar__user')).toBeNull();
    expect(fixture.componentInstance.initials()).toBe('');
  });

  it('shows the taxpayer name, TIN and two-letter initials', () => {
    fixture.componentRef.setInput('taxpayer', taxpayer);
    const root = el();
    expect(root.querySelector('.topbar__user-name')?.textContent).toBe('adaeze chioma obi');
    expect(root.querySelector('.topbar__user-tin')?.textContent).toBe('TIN: 1234567890123');
    expect(root.querySelector('.topbar__avatar')?.textContent?.trim()).toBe('AC');
  });

  it('cycles light -> dark -> system -> light and reflects the theme in the button label', () => {
    const btn = el().querySelector('.topbar__theme-btn') as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toBe('Theme: light');

    btn.click();
    expect(setTheme).toHaveBeenCalledWith('dark');
    expect(el().querySelector('.topbar__theme-btn')!.getAttribute('aria-label')).toBe('Theme: dark');

    btn.click();
    expect(setTheme).toHaveBeenCalledWith('system');
    expect(el().querySelector('.topbar__theme-btn')!.getAttribute('aria-label')).toBe('Theme: system');

    btn.click();
    expect(setTheme.calls.mostRecent().args[0]).toBe('light');
  });

  it('toggles the user menu from the avatar', () => {
    fixture.componentRef.setInput('taxpayer', taxpayer);
    (el().querySelector('.topbar__avatar') as HTMLButtonElement).click();
    expect(el().querySelector('.topbar__dropdown')).not.toBeNull();
    (el().querySelector('.topbar__avatar') as HTMLButtonElement).click();
    expect(el().querySelector('.topbar__dropdown')).toBeNull();
  });

  it('locks the app and navigates to the unlock screen', async () => {
    authSpy.lock.and.resolveTo();
    fixture.componentRef.setInput('taxpayer', taxpayer);
    fixture.componentInstance.showMenu = true;
    expect(el().querySelector('.topbar__dropdown-item')?.textContent).toBe('Lock App');

    await fixture.componentInstance.lock();

    expect(authSpy.lock).toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/unlock']);
    expect(fixture.componentInstance.showMenu).toBeFalse();
    expect(toastSpy.error).not.toHaveBeenCalled();
  });

  it('shows an error toast and stays put when locking fails', async () => {
    authSpy.lock.and.rejectWith(new Error('db busy'));
    await fixture.componentInstance.lock();
    expect(toastSpy.error).toHaveBeenCalledWith('Failed to lock app: db busy');
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  it('stringifies non-Error lock failures', async () => {
    authSpy.lock.and.callFake(() => Promise.reject('vault offline'));
    await fixture.componentInstance.lock();
    expect(toastSpy.error).toHaveBeenCalledWith('Failed to lock app: vault offline');
  });
});
