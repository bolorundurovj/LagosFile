import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DropzoneFile, FileDropzoneComponent } from './file-dropzone.component';
import { LUCIDE_ICONS, LucideIconProvider, Paperclip } from 'lucide-angular';

type Handler = (event: unknown) => void;
type TauriWindow = Record<'__TAURI_INTERNALS__' | '__TAURI_EVENT_PLUGIN_INTERNALS__', unknown>;

describe('FileDropzoneComponent', () => {
  const win = window as unknown as TauriWindow;
  let savedInternals: unknown;
  let savedEventInternals: unknown;
  let listeners: Record<string, Handler>;
  let invoke: jasmine.Spy;
  let unregisterListener: jasmine.Spy;
  let dialogResult: unknown;
  let fixture: ComponentFixture<FileDropzoneComponent>;
  let emitted: DropzoneFile[];

  function installTauri(): void {
    const callbacks = new Map<number, Handler>();
    let nextId = 0;
    listeners = {};
    dialogResult = null;
    invoke = jasmine.createSpy('invoke').and.callFake(async (cmd: string, args: Record<string, unknown>) => {
      if (cmd === 'plugin:event|listen') {
        listeners[args['event'] as string] = callbacks.get(args['handler'] as number)!;
        return ++nextId;
      }
      if (cmd === 'plugin:dialog|open') {
        if (dialogResult instanceof Error) throw dialogResult;
        return dialogResult;
      }
      return null;
    });
    unregisterListener = jasmine.createSpy('unregisterListener');
    win.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } },
      transformCallback: (cb: Handler) => {
        const id = ++nextId;
        callbacks.set(id, cb);
        return id;
      },
      invoke,
    };
    win.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener };
  }

  beforeEach(async () => {
    savedInternals = win.__TAURI_INTERNALS__;
    savedEventInternals = win.__TAURI_EVENT_PLUGIN_INTERNALS__;
    installTauri();
    await TestBed.configureTestingModule({
      imports: [FileDropzoneComponent],
      providers: [{ provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ Paperclip }) }],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    win.__TAURI_INTERNALS__ = savedInternals;
    win.__TAURI_EVENT_PLUGIN_INTERNALS__ = savedEventInternals;
  });

  async function create(): Promise<void> {
    fixture = TestBed.createComponent(FileDropzoneComponent);
    emitted = [];
    fixture.componentInstance.fileSelected.subscribe(f => emitted.push(f));
    spyOn(fixture.nativeElement as HTMLElement, 'getBoundingClientRect').and.returnValue(
      { left: 100, right: 300, top: 100, bottom: 200 } as DOMRect,
    );
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function fire(event: string, payload: unknown): void {
    listeners[event]({ event, id: 1, payload });
    fixture.detectChanges();
  }

  function zone(): HTMLElement {
    return fixture.nativeElement.querySelector('.drop-zone');
  }

  it('renders the label, aria-label and compact modifier', async () => {
    await create();
    fixture.componentRef.setInput('label', 'Attach WHT certificate');
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();
    expect(zone().getAttribute('aria-label')).toBe('Attach WHT certificate');
    expect(zone().querySelector('.drop-zone__label')?.textContent).toBe('Attach WHT certificate');
    expect(zone().classList).toContain('drop-zone--compact');
  });

  it('emits the picked file with its name and lower-cased extension', async () => {
    await create();
    dialogResult = 'C:\\docs\\Payslip.PDF';
    await fixture.componentInstance.openFilePicker();
    const call = invoke.calls.all().find(c => c.args[0] === 'plugin:dialog|open')!;
    expect((call.args[1] as { options: { multiple: boolean } }).options.multiple).toBeFalse();
    expect(emitted).toEqual([{ path: 'C:\\docs\\Payslip.PDF', name: 'Payslip.PDF', size: 0, type: 'pdf' }]);
  });

  it('emits nothing when the picker is cancelled or fails', async () => {
    await create();
    dialogResult = null;
    await fixture.componentInstance.openFilePicker();
    dialogResult = ['a.pdf', 'b.pdf'];
    await fixture.componentInstance.openFilePicker();
    dialogResult = new Error('dialog closed');
    await fixture.componentInstance.openFilePicker();
    expect(emitted).toEqual([]);
  });

  it('opens the picker when the zone is clicked', async () => {
    await create();
    dialogResult = '/home/me/receipt.png';
    zone().click();
    await fixture.whenStable();
    expect(emitted.map(f => f.name)).toEqual(['receipt.png']);
  });

  it('highlights while a drag hovers over the zone and clears on leave', async () => {
    await create();
    const ratio = window.devicePixelRatio || 1;
    fire('tauri://drag-enter', { paths: [], position: { x: 150 * ratio, y: 150 * ratio } });
    expect(fixture.componentInstance.isDragOver).toBeTrue();
    expect(zone().classList).toContain('drag-over');

    fire('tauri://drag-over', { position: { x: 500 * ratio, y: 150 * ratio } });
    expect(fixture.componentInstance.isDragOver).toBeFalse();

    fire('tauri://drag-over', { position: { x: 200 * ratio, y: 180 * ratio } });
    expect(fixture.componentInstance.isDragOver).toBeTrue();

    fire('tauri://drag-leave', {});
    expect(fixture.componentInstance.isDragOver).toBeFalse();
    expect(zone().classList).not.toContain('drag-over');
  });

  it('emits supported files dropped inside the zone and ignores other extensions', async () => {
    await create();
    const ratio = window.devicePixelRatio || 1;
    fixture.componentInstance.isDragOver = true;
    fire('tauri://drag-drop', {
      paths: ['/tmp/a.pdf', '/tmp/notes.txt', 'C:\\scans\\b.JPEG'],
      position: { x: 120 * ratio, y: 120 * ratio },
    });
    expect(fixture.componentInstance.isDragOver).toBeFalse();
    expect(emitted).toEqual([
      { path: '/tmp/a.pdf', name: 'a.pdf', size: 0, type: 'pdf' },
      { path: 'C:\\scans\\b.JPEG', name: 'b.JPEG', size: 0, type: 'jpeg' },
    ]);
  });

  it('ignores drops outside the zone', async () => {
    await create();
    fire('tauri://drag-drop', { paths: ['/tmp/a.pdf'], position: { x: 0, y: 0 } });
    expect(emitted).toEqual([]);
  });

  it('unregisters the drag-drop listeners on destroy', async () => {
    await create();
    fixture.destroy();
    expect(unregisterListener).toHaveBeenCalledTimes(4);
    expect(unregisterListener.calls.allArgs().map(a => a[0]).sort()).toEqual(
      ['tauri://drag-drop', 'tauri://drag-enter', 'tauri://drag-leave', 'tauri://drag-over'],
    );
  });

  it('works without Tauri and prevents default browser drag handling', async () => {
    win.__TAURI_INTERNALS__ = undefined;
    await create();
    const over = new Event('dragover', { cancelable: true });
    const drop = new Event('drop', { cancelable: true });
    zone().dispatchEvent(over);
    zone().dispatchEvent(drop);
    expect(over.defaultPrevented).toBeTrue();
    expect(drop.defaultPrevented).toBeTrue();
    expect(() => fixture.destroy()).not.toThrow();
  });
});
