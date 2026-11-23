import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { LIRSReferencePanelComponent } from './lirs-reference-panel.component';
import { LIRSFieldGroup } from '../../../core/models';
import { LUCIDE_ICONS, LucideIconProvider, X, Copy, ClipboardList } from 'lucide-angular';

describe('LIRSReferencePanelComponent', () => {
  let fixture: ComponentFixture<LIRSReferencePanelComponent>;
  let comp: LIRSReferencePanelComponent;
  let writeText: jasmine.Spy;

  const groups: LIRSFieldGroup[] = [
    {
      section: 'Taxpayer',
      fields: [
        { label: 'Filing Reference', value: 'LIRS/1', copyText: 'LIRS/1' },
        { label: 'Empty Ref', value: '—', copyText: '' },
      ],
    },
    {
      section: 'Capital Allowances',
      fields: [{ label: 'Laptop', value: '₦100.00', copyText: '100', description: 'Cost: ₦400.00 · Rate: 25%' }],
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LIRSReferencePanelComponent],
      providers: [
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ X, Copy, ClipboardList }) },
      ],
    }).compileComponents();
    writeText = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
    fixture = TestBed.createComponent(LIRSReferencePanelComponent);
    comp = fixture.componentInstance;
  });

  function el(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('renders nothing while hidden', () => {
    fixture.componentRef.setInput('fieldGroups', groups);
    expect(el().querySelector('.lirs-overlay')).toBeNull();
  });

  it('renders groups, fields, descriptions and copy buttons only for copyable fields', () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('fieldGroups', groups);
    const root = el();
    const titles = Array.from(root.querySelectorAll('.lirs-group__title')).map(e => e.textContent);
    expect(titles).toEqual(['Taxpayer', 'Capital Allowances']);
    expect(root.querySelectorAll('.lirs-field').length).toBe(3);
    expect(root.querySelectorAll('.lirs-copy-btn').length).toBe(2);
    expect(root.querySelector('.lirs-field__desc')?.textContent).toContain('Rate: 25%');
    expect(root.querySelector('.lirs-panel__status')).toBeNull();
    expect(root.textContent).not.toContain('Mark as Submitted');
  });

  it('shows the status message and the Mark as Submitted action when enabled', () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('statusMessage', 'Extension connected');
    fixture.componentRef.setInput('showMarkSubmitted', true);
    const markSpy = jasmine.createSpy('mark');
    comp.markSubmitted.subscribe(markSpy);
    const root = el();
    expect(root.querySelector('.lirs-panel__status')?.textContent?.trim()).toBe('Extension connected');
    const markBtn = Array.from(root.querySelectorAll('button')).find(b => b.textContent?.includes('Mark as Submitted'))!;
    markBtn.click();
    expect(markSpy).toHaveBeenCalledTimes(1);
  });

  it('emits closePanel from the overlay, header and footer buttons but not from clicks inside the panel', () => {
    fixture.componentRef.setInput('visible', true);
    const closeSpy = jasmine.createSpy('close');
    comp.closePanel.subscribe(closeSpy);
    const root = el();

    (root.querySelector('.lirs-panel__body') as HTMLElement).click();
    expect(closeSpy).not.toHaveBeenCalled();

    (root.querySelector('.lirs-overlay') as HTMLElement).click();
    (root.querySelector('.icon-btn') as HTMLElement).click();
    (root.querySelector('.lirs-panel__footer .btn--secondary') as HTMLElement).click();
    expect(closeSpy).toHaveBeenCalledTimes(3);
  });

  it('copies field text and marks the field as copied for 1.5s', fakeAsync(() => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('fieldGroups', groups);
    const root = el();
    (root.querySelectorAll('.lirs-copy-btn')[1] as HTMLElement).click();
    flushMicrotasks();
    expect(writeText).toHaveBeenCalledWith('100');
    expect(comp.lastCopied()).toBe('Laptop');
    expect(el().querySelectorAll('.lirs-copy-btn')[1].classList).toContain('copied');

    tick(1500);
    expect(comp.lastCopied()).toBe('');
  }));

  it('swallows clipboard failures', fakeAsync(() => {
    writeText.and.rejectWith(new Error('denied'));
    comp.copyText('x', 'Label');
    flushMicrotasks();
    expect(comp.lastCopied()).toBe('');
  }));
});
