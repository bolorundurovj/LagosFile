import { TestBed } from '@angular/core/testing';
import { LogoMarkComponent } from './logo-mark.component';

describe('LogoMarkComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LogoMarkComponent] }).compileComponents();
  });

  function render(inputs: Record<string, unknown>): HTMLImageElement {
    const fixture = TestBed.createComponent(LogoMarkComponent);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('img');
  }

  it('defaults to the light alt-fills mark at 64px with the 200x84 aspect ratio', () => {
    const img = render({});
    expect(img.getAttribute('src')).toBe('assets/logo/mark-alt-fills.svg');
    expect(img.getAttribute('width')).toBe('64');
    expect(img.getAttribute('height')).toBe('27');
    expect(img.getAttribute('alt')).toBe('LagosFile mark');
  });

  it('uses the dark alt-fills asset when dark is set', () => {
    const img = render({ dark: true, size: 52 });
    expect(img.getAttribute('src')).toBe('assets/logo/mark-alt-fills-dark.svg');
    expect(img.getAttribute('width')).toBe('52');
    expect(img.getAttribute('height')).toBe('22');
  });

  it('resolves the single-span variant in light and dark', () => {
    expect(render({ variant: 'single-span' }).getAttribute('src')).toBe('assets/logo/mark-single-span.svg');
    expect(render({ variant: 'single-span', dark: true }).getAttribute('src')).toBe('assets/logo/mark-single-span-dark.svg');
  });
});
