import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SidebarComponent } from './sidebar.component';
import { LUCIDE_ICONS, LucideIconProvider, LayoutDashboard, FilePlus2, History, Settings2, SlidersHorizontal } from 'lucide-angular';

@Component({ standalone: true, template: '' })
class BlankComponent {}

describe('SidebarComponent', () => {
  let fixture: ComponentFixture<SidebarComponent>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        provideRouter([
          { path: 'dashboard', component: BlankComponent },
          { path: 'filing/new', component: BlankComponent },
          { path: 'filing/:id', component: BlankComponent },
          { path: 'history', component: BlankComponent },
          { path: 'configuration', component: BlankComponent },
          { path: 'settings', component: BlankComponent },
        ]),
        { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ LayoutDashboard, FilePlus2, History, Settings2, SlidersHorizontal }) },
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
  });

  async function navigate(url: string): Promise<void> {
    await router.navigateByUrl(url);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function activeLabels(): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('a.sidebar__link.active'))
      .map(a => (a as HTMLElement).querySelector('.sidebar__link-label')!.textContent!.trim());
  }

  it('renders every nav item with its route', () => {
    const links = Array.from(fixture.nativeElement.querySelectorAll('a.sidebar__link')) as HTMLAnchorElement[];
    expect(links.map(l => l.querySelector('.sidebar__link-label')!.textContent!.trim()))
      .toEqual(['Dashboard', 'New Filing', 'Filing History', 'Configuration', 'Settings']);
    expect(links.map(l => l.getAttribute('href'))).toEqual(['/dashboard', '/filing/new', '/history', '/configuration', '/settings']);
  });

  it('highlights only the matching route', async () => {
    await navigate('/dashboard');
    expect(activeLabels()).toEqual(['Dashboard']);
  });

  it('also highlights Filing History while viewing an existing filing', async () => {
    await navigate('/filing/abc-123');
    expect(fixture.componentInstance.currentUrl()).toBe('/filing/abc-123');
    expect(activeLabels()).toEqual(['Filing History']);
  });

  it('highlights New Filing on /filing/new', async () => {
    await navigate('/filing/new');
    expect(activeLabels()).toEqual(['New Filing']);
  });

  it('isExtraActive is false for items without an extra prefix', async () => {
    await navigate('/filing/xyz');
    const comp = fixture.componentInstance;
    expect(comp.isExtraActive(comp.navItems[0])).toBeFalse();
    expect(comp.isExtraActive(comp.navItems[2])).toBeTrue();
  });
});
