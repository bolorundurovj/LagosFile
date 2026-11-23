import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToastComponent } from './toast.component';
import { ToastService } from '../../../core/services/toast.service';

describe('ToastComponent', () => {
  let fixture: ComponentFixture<ToastComponent>;
  let service: ToastService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ToastComponent] }).compileComponents();
    service = TestBed.inject(ToastService);
    fixture = TestBed.createComponent(ToastComponent);
  });

  function toasts(): HTMLElement[] {
    fixture.detectChanges();
    return Array.from(fixture.nativeElement.querySelectorAll('.toast'));
  }

  it('renders one alert per toast with a type class, icon and message', () => {
    service.toasts.set([
      { id: 1, type: 'success', message: 'Saved' },
      { id: 2, type: 'error', message: 'Failed' },
      { id: 3, type: 'warning', message: 'Careful' },
      { id: 4, type: 'info', message: 'FYI' },
    ]);
    const items = toasts();
    expect(items.length).toBe(4);
    expect(items[0].classList).toContain('toast--success');
    expect(items[0].querySelector('.toast__icon')?.textContent?.trim()).toBe('✓');
    expect(items[1].querySelector('.toast__icon')?.textContent?.trim()).toBe('✕');
    expect(items[2].querySelector('.toast__icon')?.textContent?.trim()).toBe('⚠');
    expect(items[3].querySelector('.toast__icon')?.textContent?.trim()).toBe('ℹ');
    expect(items[1].querySelector('.toast__message')?.textContent).toBe('Failed');
    expect(items[0].getAttribute('role')).toBe('alert');
  });

  it('dismisses a toast when the close button is clicked', () => {
    service.toasts.set([
      { id: 1, type: 'info', message: 'One' },
      { id: 2, type: 'info', message: 'Two' },
    ]);
    const items = toasts();
    (items[0].querySelector('.toast__close') as HTMLButtonElement).click();
    const remaining = toasts();
    expect(remaining.length).toBe(1);
    expect(service.toasts().map(t => t.id)).toEqual([2]);
  });

  it('runs the action callback and dismisses the toast when the action is clicked', () => {
    const fn = jasmine.createSpy('undo');
    service.toasts.set([{ id: 7, type: 'success', message: 'Deleted', action: { label: 'Undo', fn } }]);
    const [item] = toasts();
    const action = item.querySelector('.toast__action') as HTMLButtonElement;
    expect(action.textContent?.trim()).toBe('Undo');
    action.click();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(service.toasts().length).toBe(0);
  });

  it('omits the action button when no action is provided', () => {
    service.toasts.set([{ id: 1, type: 'info', message: 'Plain' }]);
    const [item] = toasts();
    expect(item.querySelector('.toast__action')).toBeNull();
  });
});
