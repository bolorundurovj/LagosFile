import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { ToastService } from './core/services/toast.service';

describe('AppComponent', () => {
  let invokeSpy: jasmine.Spy;
  let unregisterSpy: jasmine.Spy;
  let handler: ((event: { payload: unknown }) => void) | null;

  function installTauri(): void {
    handler = null;
    invokeSpy = jasmine.createSpy('invoke').and.callFake(async (cmd: string) =>
      cmd === 'plugin:event|listen' ? 42 : undefined,
    );
    unregisterSpy = jasmine.createSpy('unregisterListener');
    (window as any).__TAURI_INTERNALS__ = {
      invoke: invokeSpy,
      transformCallback: (cb: (event: { payload: unknown }) => void) => {
        handler = cb;
        return 1;
      },
    };
    (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: unregisterSpy };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        { provide: ToastService, useValue: { toasts: () => [], dismiss: jasmine.createSpy('dismiss') } },
      ],
    });
  });

  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__;
  });

  it('does not subscribe to migration events outside Tauri', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.migrationStatus()).toBeNull();
    expect(fixture.nativeElement.querySelector('.migration-banner')).toBeNull();
    expect(() => fixture.destroy()).not.toThrow();
  });

  it('shows migration progress and clears it 1.5s after completion', fakeAsync(() => {
    installTauri();
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    flushMicrotasks();

    expect(invokeSpy).toHaveBeenCalledWith('plugin:event|listen', jasmine.objectContaining({
      event: 'doc-migration-progress',
    }), undefined);
    expect(handler).not.toBeNull();

    handler!({ payload: { completed: 1, total: 3, fileName: 'receipt.pdf' } });
    fixture.detectChanges();
    const banner: HTMLElement = fixture.nativeElement.querySelector('.migration-banner');
    expect(banner.textContent).toContain('(1 / 3)');
    expect(banner.textContent).toContain('receipt.pdf');

    tick(5000);
    expect(fixture.componentInstance.migrationStatus()).not.toBeNull();

    handler!({ payload: { completed: 3, total: 3, fileName: 'last.pdf' } });
    handler!({ payload: { completed: 3, total: 3, fileName: 'last.pdf' } });
    tick(1499);
    expect(fixture.componentInstance.migrationStatus()?.fileName).toBe('last.pdf');
    tick(1);
    expect(fixture.componentInstance.migrationStatus()).toBeNull();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.migration-banner')).toBeNull();

    fixture.destroy();
    flushMicrotasks();
    expect(unregisterSpy).toHaveBeenCalledWith('doc-migration-progress', 42);
    expect(invokeSpy).toHaveBeenCalledWith('plugin:event|unlisten', { event: 'doc-migration-progress', eventId: 42 }, undefined);
  }));

  it('cancels a pending clear timer on destroy', fakeAsync(() => {
    installTauri();
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    flushMicrotasks();

    handler!({ payload: { completed: 2, total: 2, fileName: 'a.pdf' } });
    fixture.destroy();
    flushMicrotasks();
    tick(2000);
    expect(fixture.componentInstance.migrationStatus()?.fileName).toBe('a.pdf');
  }));

  it('ignores listen failures', async () => {
    installTauri();
    invokeSpy.and.rejectWith(new Error('not available'));
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.migrationStatus()).toBeNull();
    expect(() => fixture.destroy()).not.toThrow();
  });
});
