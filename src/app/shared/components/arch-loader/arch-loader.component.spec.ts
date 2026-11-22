import { TestBed } from '@angular/core/testing';
import { ArchLoaderComponent } from './arch-loader.component';

describe('ArchLoaderComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ArchLoaderComponent] }).compileComponents();
  });

  it('renders the three arches and the default caption', () => {
    const fixture = TestBed.createComponent(ArchLoaderComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('g.arch').length).toBe(3);
    expect(el.querySelector('.arch-loader__caption')?.textContent?.trim()).toBe('Loading…');
  });

  it('renders a custom caption', () => {
    const fixture = TestBed.createComponent(ArchLoaderComponent);
    fixture.componentRef.setInput('caption', 'Computing your tax...');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.arch-loader__caption').textContent.trim()).toBe('Computing your tax...');
  });

  it('hides the caption when showCaption is false', () => {
    const fixture = TestBed.createComponent(ArchLoaderComponent);
    fixture.componentRef.setInput('showCaption', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.arch-loader__caption')).toBeNull();
  });
});
