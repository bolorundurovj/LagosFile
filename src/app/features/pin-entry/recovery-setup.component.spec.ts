import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LUCIDE_ICONS, LucideIconProvider, icons, AlertTriangle } from 'lucide-angular';
import { RecoverySetupComponent } from './recovery-setup.component';
import { AuthService } from '../../core/services/auth.service';

describe('RecoverySetupComponent', () => {
  let authSpy: jasmine.SpyObj<AuthService>;
  let navigate: jasmine.Spy;

  beforeEach(() => {
    authSpy = jasmine.createSpyObj('AuthService', ['setupRecovery', 'isUnlocked']);
    authSpy.isUnlocked.and.returnValue(false);
    TestBed.configureTestingModule({
      imports: [RecoverySetupComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authSpy },
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ ...icons, AlertTriangle }) },
      ],
    });
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  function create() {
    const fixture = TestBed.createComponent(RecoverySetupComponent);
    fixture.detectChanges();
    return { fixture, comp: fixture.componentInstance };
  }

  function fillValid(comp: RecoverySetupComponent): void {
    comp.selectedQuestions = [comp.allQuestions[0], comp.allQuestions[1], comp.allQuestions[2]];
    comp.answers = ['rex', 'lagos', 'okafor'];
  }

  it('offers only questions not already chosen in other slots', () => {
    const { comp } = create();
    expect(comp.availableFor(0).length).toBe(comp.allQuestions.length);

    comp.selectedQuestions = [comp.allQuestions[0], comp.allQuestions[1], ''];
    const forSlot0 = comp.availableFor(0);
    expect(forSlot0).toContain(comp.allQuestions[0]);
    expect(forSlot0).not.toContain(comp.allQuestions[1]);

    const forSlot2 = comp.availableFor(2);
    expect(forSlot2).not.toContain(comp.allQuestions[0]);
    expect(forSlot2).not.toContain(comp.allQuestions[1]);
    expect(forSlot2.length).toBe(comp.allQuestions.length - 2);
  });

  it('renders an answer input only once a question is selected', async () => {
    const { comp, fixture } = create();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('input[type="text"]').length).toBe(0);
    comp.selectedQuestions = [comp.allQuestions[0], '', ''];
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelectorAll('input[type="text"]').length).toBe(1);
  });

  it('requires each question to be selected and answered', async () => {
    const { comp, fixture } = create();
    await comp.submit();
    expect(comp.error).toBe('Please select question 1.');

    comp.selectedQuestions = [comp.allQuestions[0], '', ''];
    await comp.submit();
    expect(comp.error).toBe('Please provide an answer for question 1.');

    comp.answers = ['rex', '', ''];
    await comp.submit();
    expect(comp.error).toBe('Please select question 2.');

    comp.selectedQuestions = [comp.allQuestions[0], comp.allQuestions[1], comp.allQuestions[2]];
    comp.answers = ['rex', 'lagos', '   '];
    await comp.submit();
    expect(comp.error).toBe('Please provide an answer for question 3.');
    expect(authSpy.setupRecovery).not.toHaveBeenCalled();

    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.alert--error').textContent).toContain('question 3');
  });

  it('saves recovery and returns to profile setup during onboarding', async () => {
    authSpy.setupRecovery.and.resolveTo();
    const { comp } = create();
    fillValid(comp);
    await comp.submit();
    expect(authSpy.setupRecovery).toHaveBeenCalledWith(
      [comp.allQuestions[0], comp.allQuestions[1], comp.allQuestions[2]],
      ['rex', 'lagos', 'okafor'],
    );
    expect(navigate).toHaveBeenCalledWith(['/profile-setup']);
    expect(comp.loading).toBeFalse();
    expect(comp.error).toBe('');
  });

  it('returns to settings when the session is already unlocked', async () => {
    authSpy.isUnlocked.and.returnValue(true);
    authSpy.setupRecovery.and.resolveTo();
    const { comp } = create();
    fillValid(comp);
    await comp.submit();
    expect(navigate).toHaveBeenCalledWith(['/settings']);
  });

  it('shows save errors', async () => {
    const { comp } = create();
    fillValid(comp);
    authSpy.setupRecovery.and.rejectWith(new Error('db error'));
    await comp.submit();
    expect(comp.error).toBe('db error');

    authSpy.setupRecovery.and.returnValue(Promise.reject('raw error'));
    await comp.submit();
    expect(comp.error).toBe('raw error');
    expect(navigate).not.toHaveBeenCalled();
    expect(comp.loading).toBeFalse();
  });

  it('skip navigates to the return path', () => {
    const { comp } = create();
    comp.skip();
    expect(navigate).toHaveBeenCalledWith(['/profile-setup']);

    authSpy.isUnlocked.and.returnValue(true);
    comp.skip();
    expect(navigate).toHaveBeenCalledWith(['/settings']);
  });
});
