import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HelpTooltipComponent } from './help-tooltip.component';

describe('HelpTooltipComponent', () => {
  let fixture: ComponentFixture<HelpTooltipComponent>;
  let comp: HelpTooltipComponent;
  let btn: HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HelpTooltipComponent] }).compileComponents();
    fixture = TestBed.createComponent(HelpTooltipComponent);
    fixture.componentRef.setInput('text', 'Explains the field');
    fixture.detectChanges();
    comp = fixture.componentInstance;
    btn = fixture.nativeElement.querySelector('.help-btn');
  });

  function popover(): HTMLElement | null {
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.help-popover');
  }

  function stubButtonTop(top: number): void {
    spyOn(btn, 'getBoundingClientRect').and.returnValue({ top } as DOMRect);
  }

  it('labels the button with the help text and starts hidden', () => {
    expect(btn.getAttribute('aria-label')).toBe('Help: Explains the field');
    expect(popover()).toBeNull();
  });

  it('shows above the button when there is room and flips below near the top of the viewport', () => {
    stubButtonTop(400);
    btn.dispatchEvent(new Event('mouseenter'));
    const el = popover()!;
    expect(el.textContent).toBe('Explains the field');
    expect(comp.direction()).toBe('above');
    expect(el.classList).not.toContain('help-popover--below');

    (btn.getBoundingClientRect as jasmine.Spy).and.returnValue({ top: 50 } as DOMRect);
    comp.show();
    expect(comp.direction()).toBe('below');
    expect(popover()!.classList).toContain('help-popover--below');
  });

  it('applies the left alignment class', () => {
    fixture.componentRef.setInput('align', 'left');
    comp.show();
    expect(popover()!.classList).toContain('help-popover--left');
  });

  it('hides 120ms after the pointer leaves, unless the pointer re-enters the popover', fakeAsync(() => {
    btn.dispatchEvent(new Event('mouseenter'));
    expect(popover()).not.toBeNull();

    btn.dispatchEvent(new Event('mouseleave'));
    tick(60);
    popover()!.dispatchEvent(new Event('mouseenter'));
    tick(200);
    expect(comp.visible()).toBeTrue();

    popover()!.dispatchEvent(new Event('mouseleave'));
    tick(119);
    expect(comp.visible()).toBeTrue();
    tick(1);
    expect(comp.visible()).toBeFalse();
    expect(popover()).toBeNull();
  }));

  it('shows on focus and hides after blur', fakeAsync(() => {
    btn.dispatchEvent(new Event('focus'));
    expect(comp.visible()).toBeTrue();
    btn.dispatchEvent(new Event('blur'));
    tick(120);
    expect(comp.visible()).toBeFalse();
  }));

  it('toggles on click without letting the click reach the document', () => {
    stubButtonTop(10);
    const docListener = jasmine.createSpy('docClick');
    document.addEventListener('click', docListener);
    try {
      btn.click();
      expect(comp.visible()).toBeTrue();
      expect(comp.direction()).toBe('below');
      expect(docListener).not.toHaveBeenCalled();
      btn.click();
      expect(comp.visible()).toBeFalse();
    } finally {
      document.removeEventListener('click', docListener);
    }
  });

  it('closes when the document is clicked elsewhere', () => {
    comp.show();
    expect(comp.visible()).toBeTrue();
    document.body.click();
    expect(comp.visible()).toBeFalse();
  });

  it('cancelHide is a no-op when no hide is scheduled', () => {
    comp.show();
    comp.cancelHide();
    expect(comp.visible()).toBeTrue();
  });
});
