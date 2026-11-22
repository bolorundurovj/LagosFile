import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { RouterOutlet, provideRouter } from '@angular/router';
import { LUCIDE_ICONS, LucideAngularModule, LucideIconProvider, icons, AlertTriangle } from 'lucide-angular';
import { ShellComponent } from './shell.component';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { UpdateService } from '../../core/services/update.service';
import { DeadlineReminderService } from '../../core/services/deadline-reminder.service';

describe('ShellComponent', () => {
  let configMock: {
    migrationNotices: ReturnType<typeof signal<string[]>>;
    loadActive: jasmine.Spy;
    getMigrationNotices: jasmine.Spy;
    dismissMigrationNotices: jasmine.Spy;
  };
  let updateMock: {
    updateAvailable: ReturnType<typeof signal<string | null>>;
    updateUrl: ReturnType<typeof signal<string | null>>;
    checkForUpdates: jasmine.Spy;
    dismiss: jasmine.Spy;
  };
  let remindersSpy: jasmine.SpyObj<DeadlineReminderService>;

  beforeEach(() => {
    configMock = {
      migrationNotices: signal<string[]>([]),
      loadActive: jasmine.createSpy('loadActive').and.resolveTo({}),
      getMigrationNotices: jasmine.createSpy('getMigrationNotices').and.resolveTo([]),
      dismissMigrationNotices: jasmine.createSpy('dismissMigrationNotices').and.resolveTo(),
    };
    updateMock = {
      updateAvailable: signal<string | null>(null),
      updateUrl: signal<string | null>(null),
      checkForUpdates: jasmine.createSpy('checkForUpdates').and.resolveTo(),
      dismiss: jasmine.createSpy('dismiss'),
    };
    remindersSpy = jasmine.createSpyObj('DeadlineReminderService', ['check']);
    remindersSpy.check.and.resolveTo();

    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { taxpayer: signal(null) } },
        { provide: ConfigService, useValue: configMock },
        { provide: UpdateService, useValue: updateMock },
        { provide: DeadlineReminderService, useValue: remindersSpy },
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ ...icons, AlertTriangle }) },
      ],
    });
    TestBed.overrideComponent(ShellComponent, {
      set: { imports: [RouterOutlet, LucideAngularModule], schemas: [NO_ERRORS_SCHEMA] },
    });
  });

  async function create() {
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, comp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('loads config, migration notices, update check and reminders on init', async () => {
    await create();
    expect(configMock.loadActive).toHaveBeenCalled();
    expect(configMock.getMigrationNotices).toHaveBeenCalled();
    expect(updateMock.checkForUpdates).toHaveBeenCalled();
    expect(remindersSpy.check).toHaveBeenCalled();
  });

  it('continues initialization when config loading and notices fail', async () => {
    configMock.loadActive.and.rejectWith(new Error('no db'));
    configMock.getMigrationNotices.and.rejectWith(new Error('no notices'));
    await create();
    expect(configMock.getMigrationNotices).toHaveBeenCalled();
    expect(updateMock.checkForUpdates).toHaveBeenCalled();
    expect(remindersSpy.check).toHaveBeenCalled();
  });

  it('renders no banners by default', async () => {
    const { el } = await create();
    expect(el.querySelector('.update-banner')).toBeNull();
    expect(el.querySelector('.migration-banner')).toBeNull();
  });

  it('shows the update banner and dismisses the advertised version', async () => {
    updateMock.updateAvailable.set('2.0.0');
    updateMock.updateUrl.set('https://example.com/release');
    const { el } = await create();
    const banner = el.querySelector('.update-banner')!;
    expect(banner.textContent).toContain('LagosFile v2.0.0 is available.');
    expect(banner.querySelector('a')?.getAttribute('href')).toBe('https://example.com/release');

    (banner.querySelector('.update-banner__dismiss') as HTMLButtonElement).click();
    expect(updateMock.dismiss).toHaveBeenCalledWith('2.0.0');
  });

  it('lists migration notices and dismisses them', async () => {
    configMock.migrationNotices.set(['Rates updated', 'Bands migrated']);
    const { el } = await create();
    const items = Array.from(el.querySelectorAll('.migration-banner__body > div')).map(d => d.textContent?.trim());
    expect(items).toEqual(['Rates updated', 'Bands migrated']);

    (el.querySelector('.migration-banner__dismiss') as HTMLButtonElement).click();
    expect(configMock.dismissMigrationNotices).toHaveBeenCalled();
  });

  it('swallows errors when dismissing notices', async () => {
    configMock.dismissMigrationNotices.and.rejectWith(new Error('offline'));
    const { comp } = await create();
    await expectAsync(comp.dismissMigrationNotices()).toBeResolved();
  });
});
