import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideIcons } from '@ng-icons/core';
import { heroXMark } from '@ng-icons/heroicons/outline';
import { describe, expect, it } from 'vitest';
import { DrawerComponent } from './drawer.component';

@Component({
  imports: [DrawerComponent],
  template: `
    <app-drawer [(open)]="open" title="Edit tier">
      <div data-testid="drawer-body">Tier form</div>
      <button footer type="button">Save tier</button>
    </app-drawer>
  `,
})
class DrawerHostComponent {
  open = true;
}

describe('super-admin DrawerComponent', () => {
  it('keeps header and footer fixed while only the body scrolls', async () => {
    await TestBed.configureTestingModule({
      imports: [DrawerHostComponent],
      providers: [provideIcons({ heroXMark })],
    }).compileComponents();
    const fixture = TestBed.createComponent(DrawerHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('section') as HTMLElement;
    const header = panel.querySelector('header') as HTMLElement;
    const body = panel.querySelector('.min-h-0') as HTMLElement;
    const footer = panel.querySelector('footer') as HTMLElement;

    expect(panel.classList.contains('overflow-hidden')).toBe(true);
    expect(header.classList.contains('shrink-0')).toBe(true);
    expect(body.classList.contains('flex-1')).toBe(true);
    expect(body.classList.contains('overflow-y-auto')).toBe(true);
    expect(body.textContent).toContain('Tier form');
    expect(body.textContent).not.toContain('Save tier');
    expect(footer.classList.contains('shrink-0')).toBe(true);
    expect(footer.textContent).toContain('Save tier');
  });
});
