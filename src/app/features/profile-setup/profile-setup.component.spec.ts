import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LUCIDE_ICONS, LucideIconProvider, icons, AlertTriangle } from 'lucide-angular';
import { ProfileSetupComponent } from './profile-setup.component';
import { ProfileService } from '../../core/services/profile.service';
import { AuthService } from '../../core/services/auth.service';
import { Taxpayer } from '../../core/models';

describe('ProfileSetupComponent', () => {
  let profileSpy: jasmine.SpyObj<ProfileService>;
  let authSpy: jasmine.SpyObj<AuthService>;
  let navigate: jasmine.Spy;

  const created: Taxpayer = {
    id: 'tp-1',
    fullName: 'Adaeze Obi',
    tin: '1234567890123',
    createdAt: '2025-01-01T00:00:00Z',
  };

  beforeEach(() => {
    profileSpy = jasmine.createSpyObj('ProfileService', ['validateTin', 'create']);
    profileSpy.validateTin.and.callFake((tin: string) =>
      /^\d{13}$/.test(tin) ? null : 'TIN must be exactly 13 digits (numbers only).',
    );
    authSpy = jasmine.createSpyObj('AuthService', ['setTaxpayer']);
    TestBed.configureTestingModule({
      imports: [ProfileSetupComponent],
      providers: [
        provideRouter([]),
        { provide: ProfileService, useValue: profileSpy },
        { provide: AuthService, useValue: authSpy },
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ ...icons, AlertTriangle }) },
      ],
    });
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  function create() {
    const fixture = TestBed.createComponent(ProfileSetupComponent);
    fixture.detectChanges();
    return { fixture, comp: fixture.componentInstance };
  }

  it('reports missing name and invalid TIN together without saving', async () => {
    const { comp, fixture } = create();
    comp.form.fullName = '   ';
    comp.form.tin = '123';
    await comp.submit();
    expect(comp.errors.fullName).toBe('Full name is required.');
    expect(comp.errors.tin).toContain('13 digits');
    expect(profileSpy.create).not.toHaveBeenCalled();

    fixture.detectChanges();
    const errors = Array.from(fixture.nativeElement.querySelectorAll('.form-error')).map((e: any) => e.textContent.trim());
    expect(errors).toEqual(['Full name is required.', 'TIN must be exactly 13 digits (numbers only).']);
  });

  it('creates the profile with trimmed name and optional fields omitted when blank', async () => {
    profileSpy.create.and.resolveTo(created);
    const { comp } = create();
    comp.form.fullName = '  Adaeze Obi  ';
    comp.form.tin = '1234567890123';
    comp.form.email = 'a@b.ng';
    await comp.submit();

    expect(profileSpy.create).toHaveBeenCalledWith({
      fullName: 'Adaeze Obi',
      tin: '1234567890123',
      address: undefined,
      phone: undefined,
      email: 'a@b.ng',
      filingAgent: undefined,
    });
    expect(authSpy.setTaxpayer).toHaveBeenCalledWith(created);
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
    expect(comp.loading).toBeFalse();
    expect(comp.errors).toEqual({});
  });

  it('passes through all optional fields when provided', async () => {
    profileSpy.create.and.resolveTo(created);
    const { comp } = create();
    comp.form = {
      fullName: 'A', tin: '1234567890123', address: 'Ikeja', phone: '080', email: 'e@x', filingAgent: 'Agent Co',
    };
    await comp.submit();
    expect(profileSpy.create).toHaveBeenCalledWith(jasmine.objectContaining({
      address: 'Ikeja', phone: '080', email: 'e@x', filingAgent: 'Agent Co',
    }));
  });

  it('shows a general error when creation fails', async () => {
    const { comp, fixture } = create();
    comp.form.fullName = 'A';
    comp.form.tin = '1234567890123';

    profileSpy.create.and.returnValue(Promise.reject('TIN already registered'));
    await comp.submit();
    expect(comp.errors.general).toBe('TIN already registered');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.alert--error').textContent).toContain('TIN already registered');

    profileSpy.create.and.returnValue(Promise.reject(null));
    await comp.submit();
    expect(comp.errors.general).toBe('Failed to create profile.');
    expect(authSpy.setTaxpayer).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(comp.loading).toBeFalse();
  });
});
