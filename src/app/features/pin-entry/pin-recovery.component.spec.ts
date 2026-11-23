import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LUCIDE_ICONS, LucideIconProvider, icons, AlertTriangle, CheckCircle } from 'lucide-angular';
import { PinRecoveryComponent } from './pin-recovery.component';
import { AuthService } from '../../core/services/auth.service';

describe('PinRecoveryComponent', () => {
  let authSpy: jasmine.SpyObj<AuthService>;
  let navigate: jasmine.Spy;
  const questions = ['First pet?', 'Birth city?', 'First school?'];

  beforeEach(() => {
    authSpy = jasmine.createSpyObj('AuthService', [
      'getRecoveryQuestions', 'recoverWithAnswers', 'resetPin', 'isUnlocked', 'lock',
    ]);
    authSpy.getRecoveryQuestions.and.resolveTo(questions);
    TestBed.configureTestingModule({
      imports: [PinRecoveryComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authSpy },
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ ...icons, AlertTriangle, CheckCircle }) },
      ],
    });
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  async function create() {
    const fixture = TestBed.createComponent(PinRecoveryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, comp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('loads and renders the recovery questions', async () => {
    const { comp, el } = await create();
    expect(comp.questions()).toEqual(questions);
    const labels = Array.from(el.querySelectorAll('.form-label')).map(l => l.textContent?.trim());
    expect(labels).toEqual(questions);
  });

  it('shows a load error when questions cannot be fetched', async () => {
    authSpy.getRecoveryQuestions.and.rejectWith(new Error('No recovery configured'));
    const { comp, el } = await create();
    expect(comp.loadError()).toBe('No recovery configured');
    expect(el.querySelector('.alert--error')?.textContent).toContain('No recovery configured');
  });

  it('falls back to a generic load error for non-Error rejections', async () => {
    authSpy.getRecoveryQuestions.and.returnValue(Promise.reject('nope'));
    const { comp } = await create();
    expect(comp.loadError()).toBe('Could not load recovery questions.');
  });

  it('shows a skeleton while questions are empty', async () => {
    authSpy.getRecoveryQuestions.and.resolveTo([]);
    const { el } = await create();
    expect(el.querySelector('.skeleton')).not.toBeNull();
  });

  it('requires all answers before verifying', async () => {
    const { comp } = await create();
    comp.answers = ['a', '  ', 'c'];
    await comp.verifyAnswers();
    expect(comp.error()).toBe('Please answer all three questions.');
    expect(authSpy.recoverWithAnswers).not.toHaveBeenCalled();
  });

  it('advances to the reset step on correct answers', async () => {
    authSpy.recoverWithAnswers.and.resolveTo({ success: true });
    const { comp, fixture, el } = await create();
    comp.answers = ['rex', 'lagos', 'kings'];
    await comp.verifyAnswers();
    expect(authSpy.recoverWithAnswers).toHaveBeenCalledWith(['rex', 'lagos', 'kings']);
    expect(comp.step()).toBe('reset');
    expect(comp.loading()).toBeFalse();
    fixture.detectChanges();
    expect(el.querySelector('#newPin')).not.toBeNull();
  });

  it('shows the error for incorrect answers', async () => {
    const { comp } = await create();
    comp.answers = ['a', 'b', 'c'];

    authSpy.recoverWithAnswers.and.resolveTo({ success: false, error: 'Answers do not match' });
    await comp.verifyAnswers();
    expect(comp.error()).toBe('Answers do not match');

    authSpy.recoverWithAnswers.and.resolveTo({ success: false });
    await comp.verifyAnswers();
    expect(comp.error()).toBe('Incorrect answers. Please try again.');
    expect(comp.step()).toBe('answers');
  });

  it('validates the new PIN', async () => {
    const { comp } = await create();
    comp.newPin = '12';
    await comp.resetPin();
    expect(comp.error()).toBe('PIN must be at least 4 characters.');

    comp.newPin = '1234';
    comp.confirmPin = '9999';
    await comp.resetPin();
    expect(comp.error()).toBe('PINs do not match.');
    expect(authSpy.resetPin).not.toHaveBeenCalled();
  });

  it('resets the PIN and shows the success step', async () => {
    authSpy.resetPin.and.resolveTo();
    const { comp, fixture, el } = await create();
    comp.step.set('reset');
    comp.newPin = '5678';
    comp.confirmPin = '5678';
    await comp.resetPin();
    expect(authSpy.resetPin).toHaveBeenCalledWith('5678');
    expect(comp.step()).toBe('done');
    fixture.detectChanges();
    expect(el.querySelector('.success-panel')?.textContent).toContain('PIN reset successfully');

    comp.goToDashboard();
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('reports reset failures', async () => {
    authSpy.resetPin.and.returnValue(Promise.reject('write failed'));
    const { comp } = await create();
    comp.newPin = '5678';
    comp.confirmPin = '5678';
    await comp.resetPin();
    expect(comp.error()).toBe('write failed');
    expect(comp.step()).toBe('answers');

    authSpy.resetPin.and.returnValue(Promise.reject(null));
    await comp.resetPin();
    expect(comp.error()).toBe('Failed to reset PIN.');
    expect(comp.loading()).toBeFalse();
  });

  it('locks an unlocked session before returning to PIN entry', async () => {
    authSpy.isUnlocked.and.returnValue(true);
    authSpy.lock.and.resolveTo();
    const { comp } = await create();
    await comp.goBack();
    expect(authSpy.lock).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/unlock']);
  });

  it('skips locking when already locked', async () => {
    authSpy.isUnlocked.and.returnValue(false);
    const { comp } = await create();
    await comp.goBack();
    expect(authSpy.lock).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/unlock']);
  });

  it('still navigates when lock throws', async () => {
    authSpy.isUnlocked.and.returnValue(true);
    authSpy.lock.and.rejectWith(new Error('lock failed'));
    const { comp } = await create();
    await expectAsync(comp.goBack()).toBeRejectedWithError('lock failed');
    expect(navigate).toHaveBeenCalledWith(['/unlock']);
  });
});
