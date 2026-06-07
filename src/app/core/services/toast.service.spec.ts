import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ToastService]
    });
    service = TestBed.inject(ToastService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('show', () => {
    it('should add a toast to the list', () => {
      service.show('info', 'Test message');

      const toasts = service.toasts();
      expect(toasts.length).toBe(1);
      expect(toasts[0].type).toBe('info');
      expect(toasts[0].message).toBe('Test message');
    });
  });

  describe('success/error/info/warning', () => {
    it('success should add a toast with type success', () => {
      service.success('Success!');

      const toasts = service.toasts();
      expect(toasts.length).toBe(1);
      expect(toasts[0].type).toBe('success');
      expect(toasts[0].message).toBe('Success!');
    });

    it('error should add a toast with type error', () => {
      service.error('Error!');

      const toasts = service.toasts();
      expect(toasts.length).toBe(1);
      expect(toasts[0].type).toBe('error');
      expect(toasts[0].message).toBe('Error!');
    });

    it('info should add a toast with type info', () => {
      service.info('Info!');

      const toasts = service.toasts();
      expect(toasts.length).toBe(1);
      expect(toasts[0].type).toBe('info');
      expect(toasts[0].message).toBe('Info!');
    });

    it('warning should add a toast with type warning', () => {
      service.warning('Warning!');

      const toasts = service.toasts();
      expect(toasts.length).toBe(1);
      expect(toasts[0].type).toBe('warning');
      expect(toasts[0].message).toBe('Warning!');
    });
  });

  describe('dismiss', () => {
    it('should remove a toast by id', () => {
      service.show('info', 'First');
      service.show('error', 'Second');

      const toasts = service.toasts();
      const idToRemove = toasts[0].id;

      service.dismiss(idToRemove);

      expect(service.toasts().length).toBe(1);
      expect(service.toasts()[0].message).toBe('Second');
    });
  });

  describe('auto-dismiss', () => {
    beforeEach(() => {
      jasmine.clock().install();
    });

    afterEach(() => {
      jasmine.clock().uninstall();
    });

    it('show should auto-dismiss after duration', () => {
      service.show('info', 'Temporary', undefined, 4000);

      expect(service.toasts().length).toBe(1);

      jasmine.clock().tick(4000);

      expect(service.toasts().length).toBe(0);
    });

    it('error should have a 6000ms duration', () => {
      service.error('Error msg');

      expect(service.toasts().length).toBe(1);

      jasmine.clock().tick(5999);
      expect(service.toasts().length).toBe(1);

      jasmine.clock().tick(1);
      expect(service.toasts().length).toBe(0);
    });

    it('warning should have a 5000ms duration', () => {
      service.warning('Warn msg');

      expect(service.toasts().length).toBe(1);

      jasmine.clock().tick(4999);
      expect(service.toasts().length).toBe(1);

      jasmine.clock().tick(1);
      expect(service.toasts().length).toBe(0);
    });
  });
});