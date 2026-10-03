import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  beforeEach(() => {
    TestBed.runInInjectionContext(() => {
      service = TestBed.inject(ThemeService);
    });
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('default theme should be system', () => {
    expect(service.theme()).toBe('system');
  });

  describe('setTheme', () => {
    it('should save to localStorage and update the signal', () => {
      TestBed.runInInjectionContext(() => {
        service.setTheme('dark');
      });
      TestBed.flushEffects();

      expect(service.theme()).toBe('dark');
      expect(localStorage.getItem('lf-theme')).toBe('dark');
    });

    it('should save light theme to localStorage', () => {
      TestBed.runInInjectionContext(() => {
        service.setTheme('light');
      });
      TestBed.flushEffects();

      expect(service.theme()).toBe('light');
      expect(localStorage.getItem('lf-theme')).toBe('light');
    });
  });

  describe('isDark', () => {
    it('should be true when theme is set to dark', () => {
      TestBed.runInInjectionContext(() => {
        service.setTheme('dark');
      });
      TestBed.flushEffects();

      expect(service.isDark()).toBeTrue();
    });

    it('should be false when theme is set to light', () => {
      TestBed.runInInjectionContext(() => {
        service.setTheme('light');
      });
      TestBed.flushEffects();

      expect(service.isDark()).toBeFalse();
    });
  });

  describe('_apply', () => {
    it('should set data-theme attribute on documentElement', () => {
      TestBed.runInInjectionContext(() => {
        service.setTheme('dark');
      });
      TestBed.flushEffects();

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('should set data-theme to light for light theme', () => {
      TestBed.runInInjectionContext(() => {
        service.setTheme('light');
      });
      TestBed.flushEffects();

      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });
  });
});