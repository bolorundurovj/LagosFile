import { TestBed } from '@angular/core/testing';
import { TauriService } from './tauri.service';

type TauriWindow = Record<'__TAURI_INTERNALS__', unknown>;

describe('TauriService', () => {
  const win = window as unknown as TauriWindow;
  let saved: unknown;
  let invoke: jasmine.Spy;

  beforeEach(() => {
    saved = win.__TAURI_INTERNALS__;
    invoke = jasmine.createSpy('invoke');
    win.__TAURI_INTERNALS__ = { invoke };
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    win.__TAURI_INTERNALS__ = saved;
  });

  it('forwards the command and arguments to Tauri and returns the result', async () => {
    invoke.and.resolveTo({ id: 'f-1' });
    const result = await TestBed.inject(TauriService).invoke<{ id: string }>('get_filing', { id: 'f-1' });
    expect(result).toEqual({ id: 'f-1' });
    expect(invoke).toHaveBeenCalledWith('get_filing', { id: 'f-1' }, undefined);
  });

  it('sends an empty argument object when none is given', async () => {
    invoke.and.resolveTo(null);
    await TestBed.inject(TauriService).invoke('lock_db');
    expect(invoke).toHaveBeenCalledWith('lock_db', {}, undefined);
  });

  it('propagates backend errors', async () => {
    invoke.and.rejectWith('Database is locked');
    await expectAsync(TestBed.inject(TauriService).invoke('list_filings')).toBeRejectedWith('Database is locked');
  });
});
