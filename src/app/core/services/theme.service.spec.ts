import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [ThemeService]
    });
    service = TestBed.inject(ThemeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should set theme and save to localStorage', () => {
    service.setTheme('dark');
    expect(service.theme()).toBe('dark');
    expect(localStorage.getItem('lf-theme')).toBe('dark');
  });

  it('should initialize with system theme by default', () => {
    expect(service.theme()).toBe('system');
  });
});
