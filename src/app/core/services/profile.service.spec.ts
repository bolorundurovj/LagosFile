import { TestBed } from '@angular/core/testing';
import { ProfileService } from './profile.service';
import { TauriService } from './tauri.service';
import { Taxpayer } from '../models';

describe('ProfileService', () => {
  let service: ProfileService;
  let tauriSpy: jasmine.SpyObj<TauriService>;

  const mockTaxpayer: Taxpayer = {
    id: 'test-uuid',
    fullName: 'John Doe',
    tin: '1234567890123',
    address: '123 Lagos St',
    phone: '08012345678',
    email: 'john@example.com',
    filingAgent: undefined,
    createdAt: new Date().toISOString()
  };

  beforeEach(() => {
    const spy = jasmine.createSpyObj('TauriService', ['invoke']);

    TestBed.configureTestingModule({
      providers: [
        ProfileService,
        { provide: TauriService, useValue: spy }
      ]
    });

    service = TestBed.inject(ProfileService);
    tauriSpy = TestBed.inject(TauriService) as jasmine.SpyObj<TauriService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('create', () => {
    it('should call tauri create_profile and return taxpayer', async () => {
      tauriSpy.invoke.and.resolveTo(mockTaxpayer);
      const input = { fullName: 'John Doe', tin: '1234567890123' } as any;

      const result = await service.create(input);

      expect(tauriSpy.invoke).toHaveBeenCalledWith('create_profile', { profile: input });
      expect(result).toEqual(mockTaxpayer);
    });
  });

  describe('validateTin', () => {
    it('should return null for valid 13-digit TIN', () => {
      expect(service.validateTin('1234567890123')).toBeNull();
    });

    it('should return error for shorter TIN', () => {
      expect(service.validateTin('123456789012')).toContain('13 digits');
    });

    it('should return error for TIN with letters', () => {
      expect(service.validateTin('123456789012A')).toContain('numbers only');
    });
  });
});
