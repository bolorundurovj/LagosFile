import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HelpComponent } from './help.component';
import { ConfigService } from '../../core/services/config.service';

describe('HelpComponent', () => {
  let activeConfig: ReturnType<typeof signal<any>>;

  const config = {
    versionLabel: 'NTA 2025',
    bands: [
      { lower: 0, upper: 800_000, rate: 0 },
      { lower: 800_000, upper: null, rate: 0.25 },
    ],
    reliefCaps: { rentReliefRate: 0.3, rentReliefCap: 600_000 },
    cgtThresholds: { proceedsThreshold: 100_000_000, gainThreshold: 5_000_000 },
    minimumTaxRate: 0.02,
  };

  beforeEach(() => {
    activeConfig = signal<any>(null);
    TestBed.configureTestingModule({
      imports: [HelpComponent],
      providers: [
        provideRouter([]),
        { provide: ConfigService, useValue: { activeConfig } },
      ],
    });
  });

  function create() {
    const fixture = TestBed.createComponent(HelpComponent);
    fixture.detectChanges();
    return { fixture, comp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  function guideBody(comp: HelpComponent, title: string): string {
    return comp.guides().find(g => g.title === title)!.body.join(' ');
  }

  it('uses default thresholds when no config is loaded', () => {
    const { comp, el } = create();
    expect(el.querySelector('.help__rates')).toBeNull();
    expect(guideBody(comp, 'Rent Relief')).toContain('20% of annual rent paid');
    expect(guideBody(comp, 'Rent Relief')).toContain((500_000).toLocaleString('en-NG'));
    expect(guideBody(comp, 'How your tax is computed')).toContain('minimum tax of 1%');
    expect(guideBody(comp, 'Capital gains on shares')).toContain((150_000_000).toLocaleString('en-NG'));
    expect(el.querySelectorAll('.help__guide').length).toBe(comp.guides().length);
  });

  it('renders active config bands and interpolates config values into guides', () => {
    activeConfig.set(config);
    const { comp, el } = create();
    const rates = el.querySelector('.help__rates')!;
    expect(rates.textContent).toContain('Current tax bands (NTA 2025)');
    const bands = rates.querySelectorAll('.help__band');
    expect(bands.length).toBe(2);
    expect(bands[1].textContent).toContain('and above');
    expect(bands[1].textContent).toContain('25%');

    expect(guideBody(comp, 'Rent Relief')).toContain('30% of annual rent paid');
    expect(guideBody(comp, 'Rent Relief')).toContain((600_000).toLocaleString('en-NG'));
    expect(guideBody(comp, 'How your tax is computed')).toContain('minimum tax of 2%');
    expect(guideBody(comp, 'Capital gains on shares')).toContain((5_000_000).toLocaleString('en-NG'));
  });

  it('filters guides by title and body text, case-insensitively', () => {
    const { comp, el, fixture } = create();
    comp.query.set('  WITHHOLDING ');
    expect(comp.filtered().map(g => g.title)).toEqual(['Withholding tax (WHT) credits']);

    comp.query.set('tenancy agreement');
    expect(comp.filtered().map(g => g.title)).toEqual(['Rent Relief']);

    comp.query.set('zzz-no-match');
    fixture.detectChanges();
    expect(comp.filtered().length).toBe(0);
    expect(el.textContent).toContain('No guides match "zzz-no-match"');

    comp.query.set('');
    expect(comp.filtered().length).toBe(comp.guides().length);
  });
});
